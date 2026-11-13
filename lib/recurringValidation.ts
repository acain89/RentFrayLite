import {
  getMaximumRecurringBalanceCents,
  MAX_PAYMENT_AMOUNT_CENTS,
} from "@/lib/platformFees";

export type RecurringValidationInput = {
  planName: string;
  baseAmountCents: number;
  recurringChargeCents: number;
  initialLateFeeCents: number;
  dailyLateFeeCents: number;
  dailyLateFeeMaxDays: number;
};

export type RecurringValidationResult =
  | {
      ok: true;
      maximumConfiguredCents: number;
    }
  | {
      ok: false;
      maximumConfiguredCents: number;
      error: string;
    };

export function validateRecurringPaymentConfiguration(
  input: RecurringValidationInput
): RecurringValidationResult {
  const maximumConfiguredCents =
    getMaximumRecurringBalanceCents({
      baseAmountCents: input.baseAmountCents,
      recurringChargeCents:
        input.recurringChargeCents,
      initialLateFeeCents:
        input.initialLateFeeCents,
      dailyLateFeeCents:
        input.dailyLateFeeCents,
      dailyLateFeeMaxDays:
        input.dailyLateFeeMaxDays,
    });

  if (
    maximumConfiguredCents <=
    MAX_PAYMENT_AMOUNT_CENTS
  ) {
    return {
      ok: true,
      maximumConfiguredCents,
    };
  }

  const formattedTotal =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(
      maximumConfiguredCents / 100
    );

  return {
    ok: false,
    maximumConfiguredCents,
    error:
      `${input.planName} could reach ${formattedTotal} ` +
      "after recurring charges and late fees. " +
      "The maximum payment is $5,000.",
  };
}

// Configuration-input policy only; historical billing arithmetic is unchanged.
export const MAX_DAILY_LATE_FEE_DAYS = 25;
export const DAILY_LATE_FEE_DAYS_ERROR = "Enter a whole number from 0 to 25 for daily late-fee days.";
export function isValidDailyLateFeeDays(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_DAILY_LATE_FEE_DAYS;
}
export function parseDailyLateFeeDays(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const days = Number(value);
  return isValidDailyLateFeeDays(days) ? days : null;
}
