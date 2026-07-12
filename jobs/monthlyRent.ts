import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getBusinessDate,
  getRentDateSummary,
  resolveEffectiveBillingSettings,
} from "@/lib/rentDates";

const UNIT_CHUNK_SIZE = 500;
const LEDGER_CREATE_CHUNK_SIZE = 1000;
const MONTHLY_RENT_JOB_LOCK_ID = 91024001;

type MonthlyRentJobResult = {
  ok: true;
  processedUnits: number;
  dueUnits: number;
  skippedNoTenant: number;
  skippedNotDue: number;
  skippedMoveInAfterDue: number;
  rentChargesCreated: number;
  recurringFeeChargesCreated: number;
  existingChargesSkipped: number;
};

type MonthlyRentUnit = Prisma.UnitGetPayload<{
  include: {
    property: {
      include: {
        settings: true;
      };
    };
    tier: true;
    tenantAssignments: true;
    recurringFeeItems: true;
  };
}>;

type DueUnitPayload = {
  unit: MonthlyRentUnit;
  assignment: MonthlyRentUnit["tenantAssignments"][number];
  billingCycle: string;
  dueDate: Date;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function parseDateOnly(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  return new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
}

function rentKey(unitId: string, billingCycle: string): string {
  return `${unitId}|${billingCycle}|RENT`;
}

function feeKey(unitId: string, billingCycle: string, memo: string): string {
  return `${unitId}|${billingCycle}|RECURRING_FEE|${memo}`;
}

async function acquireMonthlyRentLock(db: PrismaClient): Promise<boolean> {
  try {
    const rows = await db.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(${MONTHLY_RENT_JOB_LOCK_ID}) AS locked
    `;

    return rows[0]?.locked === true;
  } catch {
    return true;
  }
}

async function releaseMonthlyRentLock(db: PrismaClient): Promise<void> {
  try {
    await db.$executeRaw`
      SELECT pg_advisory_unlock(${MONTHLY_RENT_JOB_LOCK_ID})
    `;
  } catch {
    // Local/non-Postgres fallback. No-op.
  }
}

async function createLedgerEntriesInChunks(
  rows: Prisma.LedgerEntryCreateManyInput[]
): Promise<number> {
  let created = 0;

  for (let i = 0; i < rows.length; i += LEDGER_CREATE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + LEDGER_CREATE_CHUNK_SIZE);
    if (chunk.length === 0) continue;

    const result = await prisma.ledgerEntry.createMany({
      data: chunk,
    });

    created += result.count;
  }

  return created;
}

export async function runMonthlyRentJob(
  asOf = new Date()
): Promise<MonthlyRentJobResult> {
  const lockAcquired = await acquireMonthlyRentLock(prisma);

  if (!lockAcquired) {
    return {
      ok: true,
      processedUnits: 0,
      dueUnits: 0,
      skippedNoTenant: 0,
      skippedNotDue: 0,
      skippedMoveInAfterDue: 0,
      rentChargesCreated: 0,
      recurringFeeChargesCreated: 0,
      existingChargesSkipped: 0,
    };
  }

  const today = getBusinessDate(asOf);

  let cursorId: string | undefined;
  let processedUnits = 0;
  let dueUnits = 0;
  let skippedNoTenant = 0;
  let skippedNotDue = 0;
  let skippedMoveInAfterDue = 0;
  let rentChargesCreated = 0;
  let recurringFeeChargesCreated = 0;
  let existingChargesSkipped = 0;

  try {
    while (true) {
      const units: MonthlyRentUnit[] = await prisma.unit.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
        take: UNIT_CHUNK_SIZE,
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        include: {
          property: {
            include: {
              settings: true,
            },
          },
          tier: true,
          tenantAssignments: {
            where: {
              isCurrent: true,
              moveOutDate: null,
            },
            orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
          recurringFeeItems: {
            where: {
              isActive: true,
            },
          },
        },
      });

      if (units.length === 0) break;

      cursorId = units[units.length - 1]?.id;
      processedUnits += units.length;

      const dueUnitPayloads: DueUnitPayload[] = units.reduce<DueUnitPayload[]>(
        (acc, unit) => {
          const assignment = unit.tenantAssignments[0] ?? null;

          if (!assignment) {
            skippedNoTenant++;
            return acc;
          }

          const effective = resolveEffectiveBillingSettings({
            tier: unit.tier,
            propertySettings: unit.property.settings,
          });

          const rentDates = getRentDateSummary({
            ...effective,
            now: today,
            billingCycleStartDate: unit.property.billingCycleStartDate,
          });

          const dueDate = parseDateOnly(rentDates.dueDate);

          if (!sameDay(today, dueDate)) {
            skippedNotDue++;
            return acc;
          }

          if (
            assignment.moveInDate &&
            startOfDay(assignment.moveInDate).getTime() > dueDate.getTime()
          ) {
            skippedMoveInAfterDue++;
            return acc;
          }

          dueUnits++;

          acc.push({
            unit,
            assignment,
            billingCycle: rentDates.billingCycle,
            dueDate,
          });

          return acc;
        },
        []
      );

      if (dueUnitPayloads.length === 0) continue;

      const dueUnitIds = dueUnitPayloads.map(
        (item: DueUnitPayload) => item.unit.id
      );

      const billingCycles = Array.from(
        new Set(
          dueUnitPayloads.map((item: DueUnitPayload) => item.billingCycle)
        )
      );

      const existingEntries = await prisma.ledgerEntry.findMany({
        where: {
          unitId: { in: dueUnitIds },
          billingCycle: { in: billingCycles },
          entryType: "CHARGE",
          chargeType: { in: ["RENT", "RECURRING_FEE"] },
          voidedAt: null,
        },
        select: {
          unitId: true,
          billingCycle: true,
          chargeType: true,
          memo: true,
        },
      });

      const existingRentKeys = new Set<string>();
      const existingFeeKeys = new Set<string>();

      for (const entry of existingEntries) {
        const chargeType = String(entry.chargeType);

        if (chargeType === "RENT") {
          existingRentKeys.add(rentKey(entry.unitId, entry.billingCycle));
          continue;
        }

        if (chargeType === "RECURRING_FEE") {
          existingFeeKeys.add(
            feeKey(entry.unitId, entry.billingCycle, entry.memo ?? "")
          );
        }
      }

      const rentRows: Prisma.LedgerEntryCreateManyInput[] = [];
      const recurringFeeRows: Prisma.LedgerEntryCreateManyInput[] = [];

      for (const item of dueUnitPayloads) {
        const { unit, assignment, billingCycle, dueDate } = item;

        const baseRentCents = Math.max(0, unit.tier?.baseRentCents ?? 0);

        if (baseRentCents > 0) {
          const key = rentKey(unit.id, billingCycle);

          if (existingRentKeys.has(key)) {
            existingChargesSkipped++;
          } else {
            existingRentKeys.add(key);

            rentRows.push({
              propertyId: unit.propertyId,
              unitId: unit.id,
              tenantAssignmentId: assignment.id,
              entryType: "CHARGE",
              chargeType: "RENT",
              amountCents: baseRentCents,
              billingCycle,
              effectiveDate: dueDate,
              memo: "Monthly Rent",
            });
          }
        }

        for (const fee of unit.recurringFeeItems) {
          const amountCents = Math.max(0, fee.amountCents);
          if (amountCents <= 0) continue;

          const memo = fee.label;
          const key = feeKey(unit.id, billingCycle, memo);

          if (existingFeeKeys.has(key)) {
            existingChargesSkipped++;
            continue;
          }

          existingFeeKeys.add(key);

          recurringFeeRows.push({
            propertyId: unit.propertyId,
            unitId: unit.id,
            tenantAssignmentId: assignment.id,
            entryType: "CHARGE",
            chargeType: "RECURRING_FEE",
            amountCents,
            billingCycle,
            effectiveDate: dueDate,
            memo,
          });
        }
      }

      rentChargesCreated += await createLedgerEntriesInChunks(rentRows);
      recurringFeeChargesCreated += await createLedgerEntriesInChunks(
        recurringFeeRows
      );
    }

    return {
      ok: true,
      processedUnits,
      dueUnits,
      skippedNoTenant,
      skippedNotDue,
      skippedMoveInAfterDue,
      rentChargesCreated,
      recurringFeeChargesCreated,
      existingChargesSkipped,
    };
  } finally {
    await releaseMonthlyRentLock(prisma);
  }
}