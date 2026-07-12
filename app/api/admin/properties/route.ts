import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type IncomingCharge = {
  label?: string;
  amount?: string;
};

type IncomingTier = {
  name?: string;
  unitCount?: string;
  unitLabels?: string;
  baseRent?: string;
  dueDay?: string;
  graceDays?: string;
  lateFeeInitial?: string;
  lateFeeDaily?: string;
  lateFeeMaxDays?: string;
  processingFee?: string;
  charges?: IncomingCharge[];
};

type IncomingProperty = {
  name?: string;
  code?: string;
  address?: string;
  businessType?: string;
};

type IncomingWizardPayload = {
  account?: {
    fullName?: string;
    email?: string;
    password?: string;
  };
  property?: IncomingProperty;
  tiers?: IncomingTier[];
  applySameRulesToAll?: boolean;
  paymentSetupDeferred?: boolean;
};

type PropertyListRow = {
  id: string;
  name: string;
  propertyCode: string;
  propertyType: string | null;
  isActive: boolean;
  managementUsers: Array<{
    displayName: string | null;
    email: string | null;
  }>;
  _count: {
    units: number;
    tiers: number;
  };
  units: Array<{
    isActive: boolean;
    tenantAssignments: Array<{
      id: string;
    }>;
  }>;
};

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toCents(value: unknown): number {
  return Math.round(toNumber(value, 0) * 100);
}

function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

function parseUnitLabels(raw: string | undefined): string[] {
  return [
    ...new Set(
      String(raw || "")
        .split(",")
        .map((v: string) => v.trim())
        .filter((v: string) => Boolean(v))
        .map((v: string) => v.toUpperCase())
    ),
  ];
}

function hasDuplicateValues(values: string[]): boolean {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) return true;
    seen.add(value);
  }

  return false;
}

function getDuplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicates];
}

function getRecurringChargeTotal(charges: IncomingCharge[] = []): number {
  return charges.reduce(
    (sum: number, charge: IncomingCharge) => sum + toNumber(charge.amount, 0),
    0
  );
}

function getMonthlySubtotal(tier: IncomingTier): number {
  return toNumber(tier.baseRent, 0) + getRecurringChargeTotal(tier.charges || []);
}

function getMinimumProcessingFee(monthlySubtotal: number): number {
  if (monthlySubtotal <= 0) return 0;

  const cardFee = monthlySubtotal * 0.029 + 0.3;
  const achFee = monthlySubtotal * 0.01;

  return Math.min(cardFee, achFee);
}

function isPrismaKnownError(
  err: unknown
): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

function generateFourDigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateFiveDigitCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

async function generateUniquePropertyCode(
  tx: Prisma.TransactionClient
): Promise<string> {
  const fourDigitCount = await tx.property.count({
    where: {
      propertyCode: {
        gte: "1000",
        lte: "9999",
      },
    },
  });

  if (fourDigitCount < 9000) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const propertyCode = generateFourDigitCode();

      const exists = await tx.property.findFirst({
        where: { propertyCode },
        select: { id: true },
      });

      if (!exists) {
        return propertyCode;
      }
    }

    const existingFourDigitRows = await tx.property.findMany({
      where: {
        propertyCode: {
          gte: "1000",
          lte: "9999",
        },
      },
      select: { propertyCode: true },
    });

    const used = new Set<string>(
      existingFourDigitRows.map(
        (row: { propertyCode: string }) => row.propertyCode
      )
    );

    for (let i = 1000; i <= 9999; i++) {
      const candidate = String(i);
      if (!used.has(candidate)) {
        return candidate;
      }
    }
  }

  for (let attempt = 0; attempt < 500; attempt++) {
    const propertyCode = generateFiveDigitCode();

    const exists = await tx.property.findFirst({
      where: { propertyCode },
      select: { id: true },
    });

    if (!exists) {
      return propertyCode;
    }
  }

  throw new Error("Unable to generate a unique property code.");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyCode = safeTrim(searchParams.get("propertyCode"));

    const properties: PropertyListRow[] = await prisma.property.findMany({
      where: propertyCode
        ? {
            propertyCode: {
              contains: propertyCode,
            },
          }
        : undefined,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        propertyCode: true,
        propertyType: true,
        isActive: true,
        managementUsers: {
          where: {
            role: "OWNER",
          },
          select: {
            displayName: true,
            email: true,
          },
          take: 1,
        },
        _count: {
          select: {
            units: true,
            tiers: true,
          },
        },
        units: {
          select: {
            isActive: true,
            tenantAssignments: {
              where: {
                isCurrent: true,
                moveOutDate: null,
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      properties: properties.map((property: PropertyListRow) => {
        const owner = property.managementUsers[0];

        const inactiveUnits = property.units.filter((u) => !u.isActive).length;

        const occupiedUnits = property.units.filter(
          (u) => u.isActive && u.tenantAssignments.length > 0
        ).length;

        const effectiveUnitCount = Math.max(
          0,
          property._count.units - inactiveUnits
        );

        return {
          id: property.id,
          name: property.name,
          propertyCode: property.propertyCode,
          propertyType: property.propertyType,
          isActive: property.isActive,
          contactName: owner?.displayName ?? "",
          contactEmail: owner?.email ?? "",
          unitCount: effectiveUnitCount,
          occupiedUnits,
          tierCount: property._count.tiers,
        };
      }),
    });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to load properties." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as IncomingWizardPayload;

    const property: IncomingProperty = body.property || {};
    const tiers: IncomingTier[] = Array.isArray(body.tiers) ? body.tiers : [];
    const applySameRulesToAll = Boolean(body.applySameRulesToAll);

    if (!safeTrim(property.name) || !safeTrim(property.address)) {
      return NextResponse.json(
        { error: "Missing property information." },
        { status: 400 }
      );
    }

    if (!tiers.length) {
      return NextResponse.json(
        { error: "At least one tier is required." },
        { status: 400 }
      );
    }

    const normalizedAllLabels = tiers.flatMap((tier: IncomingTier) =>
      parseUnitLabels(tier.unitLabels)
    );

    if (!normalizedAllLabels.length) {
      return NextResponse.json(
        { error: "At least one unit label is required." },
        { status: 400 }
      );
    }

    if (hasDuplicateValues(normalizedAllLabels)) {
      return NextResponse.json(
        {
          error: `Duplicate unit labels found: ${getDuplicateValues(
            normalizedAllLabels
          ).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const firstTier = tiers[0];

    if (!firstTier) {
      return NextResponse.json(
        { error: "At least one tier is required." },
        { status: 400 }
      );
    }

    const account = body.account || {};
    const email = safeTrim(account.email).toLowerCase();
    const password = safeTrim(account.password);
    const fullName = safeTrim(account.fullName);

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: "Missing account setup information." },
        { status: 400 }
      );
    }

    for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
      const tier: IncomingTier | undefined = tiers[tierIndex];

      if (!tier) {
        continue;
      }

      const tierName = safeTrim(tier.name);
      const unitLabels = parseUnitLabels(tier.unitLabels);
      const unitCount = unitLabels.length;
      const baseRent = toNumber(tier.baseRent);
      const ruleSource: IncomingTier = applySameRulesToAll ? firstTier : tier;
      const dueDay = toNumber(ruleSource.dueDay);
      const graceDays = toNumber(ruleSource.graceDays);
      const lateFeeInitial = toNumber(ruleSource.lateFeeInitial);
      const lateFeeDaily = toNumber(ruleSource.lateFeeDaily);
      const lateFeeMaxDays = toNumber(ruleSource.lateFeeMaxDays);
      const monthlySubtotal = getMonthlySubtotal(tier);
      const processingFee = getMinimumProcessingFee(monthlySubtotal);

      if (!tierName) {
        return NextResponse.json(
          { error: `Tier ${tierIndex + 1} must have a description.` },
          { status: 400 }
        );
      }

      if (unitCount <= 0) {
        return NextResponse.json(
          { error: `Tier "${tierName}" must have at least one unit.` },
          { status: 400 }
        );
      }

      if (baseRent < 0) {
        return NextResponse.json(
          { error: `Tier "${tierName}" has an invalid monthly rent.` },
          { status: 400 }
        );
      }

      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        return NextResponse.json(
          { error: `Tier "${tierName}" must have a due day between 1 and 31.` },
          { status: 400 }
        );
      }

      if (!Number.isInteger(graceDays) || graceDays < 0) {
        return NextResponse.json(
          { error: `Tier "${tierName}" has an invalid grace period.` },
          { status: 400 }
        );
      }

      if (lateFeeInitial < 0) {
        return NextResponse.json(
          { error: `Tier "${tierName}" has an invalid late fee amount.` },
          { status: 400 }
        );
      }

      if (lateFeeDaily < 0) {
        return NextResponse.json(
          { error: `Tier "${tierName}" has an invalid daily late fee.` },
          { status: 400 }
        );
      }

      if (
        !Number.isInteger(lateFeeMaxDays) ||
        lateFeeMaxDays < 0 ||
        lateFeeMaxDays > 31
      ) {
        return NextResponse.json(
          {
            error: `Tier "${tierName}" has an invalid max days daily fee is active value.`,
          },
          { status: 400 }
        );
      }

      if (processingFee < 0) {
        return NextResponse.json(
          { error: `Tier "${tierName}" has an invalid processing fee.` },
          { status: 400 }
        );
      }

      const charges: IncomingCharge[] = Array.isArray(tier.charges)
        ? tier.charges
        : [];

      for (const charge of charges) {
        const label = safeTrim(charge.label);
        const amount = toNumber(charge.amount);

        if (!label) {
          return NextResponse.json(
            { error: `Tier "${tierName}" has a charge with no label.` },
            { status: 400 }
          );
        }

        if (amount < 0) {
          return NextResponse.json(
            { error: `Tier "${tierName}" has an invalid charge amount.` },
            { status: 400 }
          );
        }
      }
    }

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const propertyCode = await generateUniquePropertyCode(tx);

        const createdProperty = await tx.property.create({
          data: {
            name: safeTrim(property.name),
            propertyCode,
            status: "SETUP",
            propertyType: safeTrim(property.businessType || "OTHER"),
            addressLine1: safeTrim(property.address),
            isActive: true,
          },
        });

        const passwordHash = await bcrypt.hash(password, 10);

        await tx.managementUser.create({
          data: {
            propertyId: createdProperty.id,
            email,
            username: email,
            passwordHash,
            role: "OWNER",
            isActive: true,
            displayName: fullName,
          },
        });

        await tx.propertySettings.create({
          data: {
            propertyId: createdProperty.id,
            rentDueDay: toNumber(firstTier.dueDay, 1),
            gracePeriodDays: toNumber(firstTier.graceDays, 0),
            lateFeeEnabled: true,
            lateFeeFlatCents: toCents(firstTier.lateFeeInitial),
            convenienceFeeEnabled: true,
            convenienceFeeType: "FLAT",
            convenienceFeeAmountCents: toCents(
              getMinimumProcessingFee(getMonthlySubtotal(firstTier))
            ),
          },
        });

        for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
          const tier: IncomingTier | undefined = tiers[tierIndex];

          if (!tier) {
            continue;
          }

          const unitLabels = parseUnitLabels(tier.unitLabels);
          const recurringTotal = getRecurringChargeTotal(tier.charges || []);
          const ruleSource: IncomingTier = applySameRulesToAll ? firstTier : tier;
          const calculatedProcessingFee = getMinimumProcessingFee(
            getMonthlySubtotal(tier)
          );

          const tierData: Prisma.PropertyTierUncheckedCreateInput = {
            propertyId: createdProperty.id,
            name: safeTrim(tier.name),
            baseRentCents: toCents(tier.baseRent),
            unitCount: unitLabels.length,
            rentDueDay: toNumber(ruleSource.dueDay, 1),
            gracePeriodDays: toNumber(ruleSource.graceDays, 0),
            lateFeeInitialCents: toCents(ruleSource.lateFeeInitial),
            lateFeeDailyCents: toCents(ruleSource.lateFeeDaily),
            maxLateFeeDays: toNumber(ruleSource.lateFeeMaxDays, 0),
            processingFeeCents: toCents(calculatedProcessingFee),
            sortOrder: tierIndex,
            isActive: true,
          };

          const createdTier = await tx.propertyTier.create({
            data: tierData,
          });

          for (const unitLabel of unitLabels) {
            const unitData: Prisma.UnitUncheckedCreateInput = {
              propertyId: createdProperty.id,
              tierId: createdTier.id,
              unitNumber: unitLabel,
              unitType: safeTrim(tier.name),
              baseRentCents: toCents(tier.baseRent),
              isActive: true,
            };

            const createdUnit = await tx.unit.create({
              data: unitData,
            });

            const charges: IncomingCharge[] = Array.isArray(tier.charges)
              ? tier.charges
              : [];

            if (charges.length) {
              const validCharges: Prisma.UnitRecurringFeeCreateManyInput[] =
                charges
                  .filter((charge: IncomingCharge) =>
                    Boolean(safeTrim(charge.label))
                  )
                  .map((charge: IncomingCharge, index: number) => ({
                    propertyId: createdProperty.id,
                    unitId: createdUnit.id,
                    label: safeTrim(charge.label),
                    amountCents: toCents(charge.amount),
                    isActive: true,
                    displayOrder: index,
                  }));

              if (validCharges.length) {
                await tx.unitRecurringFee.createMany({
                  data: validCharges,
                });
              }
            }

            const recurringTotalCents = toCents(recurringTotal);

            if (recurringTotalCents > 0) {
              await tx.ledgerEntry.create({
                data: {
                  propertyId: createdProperty.id,
                  unitId: createdUnit.id,
                  entryType: "CHARGE",
                  chargeType: "RECURRING_FEE",
                  amountCents: recurringTotalCents,
                  effectiveDate: new Date(),
                  memo: "Initial recurring fees setup",
                },
              });
            }
          }
        }

        return createdProperty;
      }
    );

    return NextResponse.json({
      ok: true,
      property: {
        id: result.id,
        name: result.name,
        propertyCode: result.propertyCode,
      },
    });
  } catch (err: unknown) {
    if (isPrismaKnownError(err) && err.code === "P2002") {
      return NextResponse.json(
        { error: "A unique property code could not be assigned." },
        { status: 400 }
      );
    }

    console.error(err);

    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
