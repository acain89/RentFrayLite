import { prisma } from "@/lib/prisma";
import { getUnitFinancialState } from "@/lib/unitFinancialState";
import { getBusinessDate } from "@/lib/rentDates";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDay(date: Date): string {
  return startOfDay(date).toISOString().slice(0, 10);
}

type LateFeesJobResult = {
  ok: true;
  billingCycle: string;
  posted: number;
  skipped: number;
};

export async function runLateFeesJob(asOf = new Date()): Promise<LateFeesJobResult> {
  const now = getBusinessDate(asOf);
  const effectiveDate = now;
  const effectiveDay = isoDay(effectiveDate);

  const units = await prisma.unit.findMany({
    where: { isActive: true },
    include: {
      property: { include: { settings: true } },
      tier: {
        select: {
          rentDueDay: true,
          gracePeriodDays: true,
          lateFeeInitialCents: true,
          lateFeeDailyCents: true,
          maxLateFeeDays: true,
        },
      },
      tenantAssignments: {
        where: { isCurrent: true, moveOutDate: null },
        orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  });

  let posted = 0;
  let skipped = 0;

  for (const unit of units) {
    const assignment = unit.tenantAssignments[0] ?? null;

    if (!assignment) {
      skipped++;
      continue;
    }

    const financialState = await getUnitFinancialState({
      propertyId: unit.propertyId,
      unitId: unit.id,
      tenantAssignmentId: assignment.id,
      tier: unit.tier,
      propertySettings: unit.property.settings,
      billingCycleStartDate: unit.property.billingCycleStartDate,
      now,
    });

    const effective = financialState.effectiveBillingSettings;
    const billingCycle = financialState.billingCycle;

    if (
      !effective.lateFeeEnabled ||
      !financialState.isPastGracePeriod ||
      financialState.daysPastGrace <= 0 ||
      financialState.ledgerBalanceCents <= 0 ||
      financialState.hasPendingPayment ||
      financialState.hasPaidPayment
    ) {
      skipped++;
      continue;
    }

    const shouldPostInitial =
      financialState.daysPastGrace >= 1 && effective.lateFeeInitialCents > 0;

    const shouldPostDaily =
      financialState.daysPastGrace >= 2 &&
      effective.lateFeeDailyCents > 0 &&
      effective.maxLateFeeDays > 0 &&
      financialState.daysPastGrace - 1 <= effective.maxLateFeeDays;

    if (shouldPostInitial) {
      const existingInitial = await prisma.ledgerEntry.findFirst({
        where: {
          propertyId: unit.propertyId,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle,
          entryType: "CHARGE",
          chargeType: { in: ["LATE_FEE", "LATE_FEE_INITIAL"] },
          voidedAt: null,
        },
        select: { id: true },
      });

      if (!existingInitial) {
        await prisma.ledgerEntry.create({
          data: {
            propertyId: unit.propertyId,
            unitId: unit.id,
            tenantAssignmentId: assignment.id,
            entryType: "CHARGE",
            chargeType: "LATE_FEE_INITIAL",
            amountCents: effective.lateFeeInitialCents,
            memo: `Initial late fee - ${billingCycle}`,
            effectiveDate,
            billingCycle,
            createdByManagementUserId: null,
          },
        });

        posted++;
      }
    }

    if (shouldPostDaily) {
      const existingDaily = await prisma.ledgerEntry.findFirst({
        where: {
          propertyId: unit.propertyId,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle,
          entryType: "CHARGE",
          chargeType: "LATE_FEE_DAILY",
          memo: `Daily late fee - ${effectiveDay}`,
          voidedAt: null,
        },
        select: { id: true },
      });

      if (!existingDaily) {
        await prisma.ledgerEntry.create({
          data: {
            propertyId: unit.propertyId,
            unitId: unit.id,
            tenantAssignmentId: assignment.id,
            entryType: "CHARGE",
            chargeType: "LATE_FEE_DAILY",
            amountCents: effective.lateFeeDailyCents,
            memo: `Daily late fee - ${effectiveDay}`,
            effectiveDate,
            billingCycle,
            createdByManagementUserId: null,
          },
        });

        posted++;
      }
    }

    if (!shouldPostInitial && !shouldPostDaily) {
      skipped++;
    }
  }

  return {
    ok: true,
    billingCycle: "per-unit",
    posted,
    skipped,
  };
}