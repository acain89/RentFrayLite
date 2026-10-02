import type { PaymentMethod } from "@prisma/client";

import { getBillingCycle } from "@/lib/billingCalendar";
import {
  getFinancialState,
  type FinancialStatePlan,
  type FinancialStateRecurringCharge,
} from "@/lib/financialState";
import {
  getAchPlatformFeeCents,
  getCardPlatformFeeCents,
} from "@/lib/platformFees";

/*
 * Compatibility export.
 *
 * billingCalendar.ts remains the real billing-cycle authority.
 */
export { getBillingCycle };

export type CheckoutPricingCharge =
  FinancialStateRecurringCharge;

export type CheckoutPricingPlan =
  FinancialStatePlan;

export type CheckoutPricingInput = {
  plan: CheckoutPricingPlan;
  paymentMethod: PaymentMethod;
  now?: Date;
};

export type CheckoutPricingLineItem = {
  type:
    | "BASE_AMOUNT"
    | "RECURRING_CHARGE"
    | "INITIAL_LATE_FEE"
    | "DAILY_LATE_FEE"
    | "PLATFORM_FEE";

  label: string;
  amountCents: number;
};

export type CheckoutPricingResult = {
  billingCycle: string;
  dueDate: Date;
  graceEndsAt: Date;

  activeRecurringCharges: CheckoutPricingCharge[];

  daysLateAfterGrace: number;
  dailyLateFeeDays: number;

  baseAmountCents: number;
  recurringChargesCents: number;
  initialLateFeeCents: number;
  dailyLateFeesCents: number;

  subtotalCents: number;
  platformFeeCents: number;
  totalChargedCents: number;

  lineItems: CheckoutPricingLineItem[];
};

export function getPlatformFeeCents(
  paymentMethod: PaymentMethod,
  subtotalCents: number
): number {
  return paymentMethod === "ACH"
    ? getAchPlatformFeeCents(subtotalCents)
    : getCardPlatformFeeCents(subtotalCents);
}

/**
 * Checkout pricing authority.
 *
 * Business-side financial state comes exclusively from financialState.ts.
 * This module adds only the selected payment-method platform fee and
 * produces the final checkout snapshot.
 */
export function calculateCheckoutPricing({
  plan,
  paymentMethod,
  now = new Date(),
}: CheckoutPricingInput): CheckoutPricingResult {
  const financialState = getFinancialState({
    plan,
    now,
  });

  const platformFeeCents =
    getPlatformFeeCents(
      paymentMethod,
      financialState.subtotalCents
    );

  const totalChargedCents =
    financialState.subtotalCents +
    platformFeeCents;

  if (
    !Number.isSafeInteger(totalChargedCents) ||
    totalChargedCents < 0
  ) {
    throw new Error(
      "totalChargedCents must be a non-negative safe integer expressed in cents."
    );
  }

  const lineItems: CheckoutPricingLineItem[] = [
    ...financialState.lineItems,
    {
      type: "PLATFORM_FEE",
      label:
        paymentMethod === "ACH"
          ? "Platform service fee — bank account"
          : "Platform service fee — card",
      amountCents: platformFeeCents,
    },
  ];

  return {
    billingCycle:
      financialState.billingCycle,

    dueDate:
      financialState.calendar.dueDate,

    graceEndsAt:
      financialState.calendar.graceEndsAt,

    activeRecurringCharges:
      financialState.activeRecurringCharges,

    daysLateAfterGrace:
      financialState.calendar.daysLateAfterGrace,

    dailyLateFeeDays:
      financialState.dailyLateFeeDays,

    baseAmountCents:
      financialState.baseAmountCents,

    recurringChargesCents:
      financialState.recurringChargesCents,

    initialLateFeeCents:
      financialState.initialLateFeeCents,

    dailyLateFeesCents:
      financialState.dailyLateFeesCents,

    subtotalCents:
      financialState.subtotalCents,

    platformFeeCents,
    totalChargedCents,

    lineItems,
  };
}