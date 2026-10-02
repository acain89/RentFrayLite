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