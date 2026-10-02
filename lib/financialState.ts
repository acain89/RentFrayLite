import {
  getBillingCalendar,
  type BillingCalendarState,
} from "@/lib/billingCalendar";

export type FinancialStateRecurringCharge = {
  id: string;
  label: string;
  amountCents: number;
  effectiveBillingCycle: string | null;
  endsAfterBillingCycle: string | null;
};

export type FinancialStatePlan = {
  id: string;
  name: string;
  baseAmountCents: number;

  dueDay: number;
  gracePeriodDays: number;

  initialLateFeeCents: number;
  dailyLateFeeCents: number;
  dailyLateFeeMaxDays: number;

  charges: FinancialStateRecurringCharge[];
};

export type FinancialStateLineItem = {
  type:
    | "BASE_AMOUNT"
    | "RECURRING_CHARGE"
    | "INITIAL_LATE_FEE"
    | "DAILY_LATE_FEE";

  label: string;
  amountCents: number;
};

export type FinancialState = {
  billingCycle: string;

  calendar: BillingCalendarState;

  activeRecurringCharges: FinancialStateRecurringCharge[];

  baseAmountCents: number;
  recurringChargesCents: number;

  initialLateFeeCents: number;
  dailyLateFeeDays: number;
  dailyLateFeesCents: number;

  subtotalCents: number;

  lineItems: FinancialStateLineItem[];
};

export type GetFinancialStateInput = {
  plan: FinancialStatePlan;
  now?: Date;
};

function assertSafeNonNegativeCents(
  value: number,
  fieldName: string
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative safe integer expressed in cents.`
    );
  }
}

function isRecurringChargeActive(
  charge: FinancialStateRecurringCharge,
  billingCycle: string
): boolean {
  if (
    charge.effectiveBillingCycle &&
    billingCycle < charge.effectiveBillingCycle
  ) {
    return false;
  }

  if (
    charge.endsAfterBillingCycle &&
    billingCycle > charge.endsAfterBillingCycle
  ) {
    return false;
  }

  return true;
}

/**
 * Canonical RFL business-side financial state.
 *
 * This function owns the determination of what is owed BEFORE
 * RentFrayLite's platform/payment-method fee is applied.
 *
 * Consumers should not independently calculate:
 * - base recurring amount
 * - applicable recurring charges
 * - initial late fee
 * - daily late fees
 * - business-side subtotal
 */
export function getFinancialState({
  plan,
  now = new Date(),
}: GetFinancialStateInput): FinancialState {
  assertSafeNonNegativeCents(
    plan.baseAmountCents,
    "plan.baseAmountCents"
  );

  assertSafeNonNegativeCents(
    plan.initialLateFeeCents,
    "plan.initialLateFeeCents"
  );

  assertSafeNonNegativeCents(
    plan.dailyLateFeeCents,
    "plan.dailyLateFeeCents"
  );

  for (const charge of plan.charges) {
    assertSafeNonNegativeCents(
      charge.amountCents,
      `recurring charge ${charge.id}`
    );
  }

  const calendar = getBillingCalendar(
    {
      dueDay: plan.dueDay,
      gracePeriodDays: plan.gracePeriodDays,
      dailyLateFeeMaxDays:
        plan.dailyLateFeeMaxDays,
    },
    now
  );

  const billingCycle =
    calendar.billingCycle;

  const activeRecurringCharges =
    plan.charges.filter((charge) =>
      isRecurringChargeActive(
        charge,
        billingCycle
      )
    );

  const baseAmountCents =
    plan.baseAmountCents;

  const recurringChargesCents =
    activeRecurringCharges.reduce(
      (total, charge) =>
        total + charge.amountCents,
      0
    );

  const initialLateFeeCents =
    calendar.initialLateFeeEligible
      ? plan.initialLateFeeCents
      : 0;

  const dailyLateFeeDays =
    calendar.dailyLateFeeDays;

  const dailyLateFeesCents =
    dailyLateFeeDays *
    plan.dailyLateFeeCents;

  const subtotalCents =
    baseAmountCents +
    recurringChargesCents +
    initialLateFeeCents +
    dailyLateFeesCents;

  assertSafeNonNegativeCents(
    subtotalCents,
    "subtotalCents"
  );

  const lineItems: FinancialStateLineItem[] = [
    {
      type: "BASE_AMOUNT",
      label: plan.name,
      amountCents: baseAmountCents,
    },

    ...activeRecurringCharges.map(
      (charge): FinancialStateLineItem => ({
        type: "RECURRING_CHARGE",
        label: charge.label,
        amountCents: charge.amountCents,
      })
    ),
  ];

  if (initialLateFeeCents > 0) {
    lineItems.push({
      type: "INITIAL_LATE_FEE",
      label: "Initial late fee",
      amountCents: initialLateFeeCents,
    });
  }

  if (dailyLateFeesCents > 0) {
    lineItems.push({
      type: "DAILY_LATE_FEE",
      label:
        dailyLateFeeDays === 1
          ? "Daily late fee"
          : `Daily late fees (${dailyLateFeeDays} days)`,
      amountCents: dailyLateFeesCents,
    });
  }

  return {
    billingCycle,

    calendar,

    activeRecurringCharges,

    baseAmountCents,
    recurringChargesCents,

    initialLateFeeCents,
    dailyLateFeeDays,
    dailyLateFeesCents,

    subtotalCents,

    lineItems,
  };
}