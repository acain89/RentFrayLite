import { prisma } from "@/lib/prisma";
import { getUnitLedgerSummary } from "@/lib/ledger";
import {
  getRentDateSummary,
  resolveEffectiveBillingSettings,
} from "@/lib/rentDates";

function diffDays(later: Date, earlier: Date) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(
    0,
    Math.floor((later.getTime() - earlier.getTime()) / msPerDay)
  );
}

function toDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function getUnitDelinquencySummary(
  unitId: string,
  asOf = new Date()
) {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      property: { include: { settings: true } },
      tier: true,
      tenantAssignments: {
        where: { isCurrent: true },
        orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
      ledgerEntries: {
       where: { voidedAt: null },
       select: {
       entryType: true,
       chargeType: true,
       amountCents: true,
       billingCycle: true,
      },
     },
    },
  });

  if (!unit) throw new Error("Unit not found");

  const ledger = await getUnitLedgerSummary(unit.id);

  const activeAssignment = unit.tenantAssignments[0] ?? null;

  const effective = resolveEffectiveBillingSettings({
    tier: unit.tier,
    propertySettings: unit.property.settings,
  });

 const rentDates = getRentDateSummary({
  ...effective,
  now: asOf,
  billingCycleStartDate: unit.property.billingCycleStartDate,
});

  const dueDate = toDateOnly(rentDates.dueDate);
  const graceEndsOn = toDateOnly(rentDates.graceEndsOn);
  const initialLateFeeDate = rentDates.initialLateFeeDate
    ? toDateOnly(rentDates.initialLateFeeDate)
    : null;
  const dailyLateFeeStartDate = rentDates.dailyLateFeeStartDate
    ? toDateOnly(rentDates.dailyLateFeeStartDate)
    : null;

  if (!activeAssignment) {
    return {
      unitId: unit.id,
      propertyId: unit.propertyId,
      billingDay: effective.dueDay,
      gracePeriodDays: effective.gracePeriodDays,
      dueDate: null,
      graceEndsOn: null,
      initialLateFeeDate: null,
      dailyLateFeeStartDate: null,
      amountDueNowCents: 0,
      totalBalanceCents: 0,
      totalChargesCents: 0,
      totalPaidCents: 0,
      lastPaymentDate: null,
      lastPaymentAmountCents: null,
      unpaidRentCents: 0,
      lateFeesOwedCents: 0,
      projectedLateFeesCents: 0,
      daysPastDue: 0,
      isDelinquent: false,
      isPastGrace: false,
      hasPropertySettings: !!unit.property.settings,
      tier: null,
    };
  }

  let rentChargesCents = 0;

 for (const entry of unit.ledgerEntries) {
  if (
    entry.entryType === "CHARGE" &&
    entry.chargeType === "RENT" &&
    entry.billingCycle === rentDates.billingCycle
  ) {
    rentChargesCents += entry.amountCents ?? 0;
  }
}

  const totalBalanceCents = ledger.balanceCents;

  const unpaidRentCents = Math.min(totalBalanceCents, rentChargesCents);
  const lateFeesOwedCents = Math.max(0, totalBalanceCents - unpaidRentCents);

  const amountDueNowCents = Math.max(totalBalanceCents, 0);

  const isDelinquent =
    amountDueNowCents > 0 && rentDates.isDelinquent;

  const today = new Date(
    asOf.getFullYear(),
    asOf.getMonth(),
    asOf.getDate()
  );

  const daysPastDue = isDelinquent ? diffDays(today, dueDate) : 0;

  let projectedLateFeesCents = 0;

  if (isDelinquent && initialLateFeeDate) {
    let projectedInitial = effective.lateFeeInitialCents;
    let projectedDaily = 0;

    if (
      dailyLateFeeStartDate &&
      today >= dailyLateFeeStartDate &&
      effective.lateFeeDailyCents > 0
    ) {
      const days = diffDays(today, dailyLateFeeStartDate) + 1;
      const allowedDays = Math.min(days, effective.maxLateFeeDays);
      projectedDaily = effective.lateFeeDailyCents * allowedDays;
    }

    projectedLateFeesCents = projectedInitial + projectedDaily;
  }

  return {
    unitId: unit.id,
    propertyId: unit.propertyId,
    billingDay: effective.dueDay,
    gracePeriodDays: effective.gracePeriodDays,
    dueDate,
    graceEndsOn,
    initialLateFeeDate,
    dailyLateFeeStartDate,
    amountDueNowCents,
    totalBalanceCents,
    totalChargesCents: ledger.totalChargesCents,
    totalPaidCents: ledger.totalPaidCents,
    lastPaymentDate: ledger.lastPaymentDate,
    lastPaymentAmountCents: ledger.lastPaymentAmountCents,
    unpaidRentCents,
    lateFeesOwedCents,
    projectedLateFeesCents,
    daysPastDue,
    isDelinquent,
    isPastGrace: isDelinquent,
    hasPropertySettings: !!unit.property.settings,
    tier: unit.tier
      ? {
          id: unit.tier.id,
          name: unit.tier.name,
          rentDueDay: unit.tier.rentDueDay,
          gracePeriodDays: unit.tier.gracePeriodDays,
          lateFeeInitial: unit.tier.lateFeeInitialCents,
          lateFeeDaily: unit.tier.lateFeeDailyCents,
          lateFeeMaxDays: unit.tier.maxLateFeeDays,
        }
      : null,
  };
}