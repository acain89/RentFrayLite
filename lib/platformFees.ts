/**
 * RentFrayLite platform fee engine.
 *
 * All monetary values are integer cents.
 * This file is the single source of truth for ACH fees,
 * and the maximum online payment amount.
 */

export const MAX_PAYMENT_AMOUNT_CENTS = 500_000;

export const MAX_PAYMENT_ERROR_MESSAGE =
  "The maximum online payment is $5,000. Please contact the business for larger payments.";

type FeeTier = Readonly<{
  maxAmountCentsExclusive: number;
  feeCents: number;
}>;

const ACH_FEE_TIERS = [
  { maxAmountCentsExclusive: 10_000, feeCents: 295 },
  { maxAmountCentsExclusive: 20_000, feeCents: 395 },
  { maxAmountCentsExclusive: 30_000, feeCents: 495 },
  { maxAmountCentsExclusive: 40_000, feeCents: 595 },
  { maxAmountCentsExclusive: 50_000, feeCents: 695 },
  { maxAmountCentsExclusive: 60_000, feeCents: 795 },
  { maxAmountCentsExclusive: 70_000, feeCents: 845 },
  { maxAmountCentsExclusive: 80_000, feeCents: 895 },
] as const satisfies readonly FeeTier[];

const ACH_MAX_FEE_CENTS = 995;


function assertValidSubtotalCents(subtotalCents: number): void {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new Error(
      "subtotalCents must be a non-negative safe integer expressed in cents."
    );
  }

  if (subtotalCents > MAX_PAYMENT_AMOUNT_CENTS) {
    throw new RangeError(MAX_PAYMENT_ERROR_MESSAGE);
  }
}

function getTieredFeeCents(
  subtotalCents: number,
  tiers: readonly FeeTier[],
  maximumFeeCents: number
): number {
  assertValidSubtotalCents(subtotalCents);

  if (subtotalCents === 0) {
    return 0;
  }

  for (const tier of tiers) {
    if (subtotalCents < tier.maxAmountCentsExclusive) {
      return tier.feeCents;
    }
  }

  return maximumFeeCents;
}

export function getAchPlatformFeeCents(subtotalCents: number): number {
  return getTieredFeeCents(
    subtotalCents,
    ACH_FEE_TIERS,
    ACH_MAX_FEE_CENTS
  );
}

export function getTotalWithAchFeeCents(subtotalCents: number): {
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
} {
  const platformFeeCents = getAchPlatformFeeCents(subtotalCents);

  return {
    subtotalCents,
    platformFeeCents,
    totalCents: subtotalCents + platformFeeCents,
  };
}

export function getMaximumRecurringBalanceCents(input: {
  baseAmountCents: number;
  recurringChargeCents: number;
  initialLateFeeCents: number;
  dailyLateFeeCents: number;
  dailyLateFeeMaxDays: number;
}): number {
  const values = [
    input.baseAmountCents,
    input.recurringChargeCents,
    input.initialLateFeeCents,
    input.dailyLateFeeCents,
    input.dailyLateFeeMaxDays,
  ];

  if (
    values.some(
      (value) =>
        !Number.isSafeInteger(value) ||
        value < 0
    )
  ) {
    throw new Error(
      "Recurring payment values must be non-negative safe integers."
    );
  }

  const totalCents =
    input.baseAmountCents +
    input.recurringChargeCents +
    input.initialLateFeeCents +
    input.dailyLateFeeCents *
      input.dailyLateFeeMaxDays;

  if (!Number.isSafeInteger(totalCents)) {
    throw new Error(
      "Maximum recurring payment exceeds the supported numeric range."
    );
  }

  return totalCents;
}
export function isWithinPaymentLimit(subtotalCents: number): boolean {
  return (
    Number.isSafeInteger(subtotalCents) &&
    subtotalCents >= 0 &&
    subtotalCents <= MAX_PAYMENT_AMOUNT_CENTS
  );
}

