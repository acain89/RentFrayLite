import {
  getBillingCalendar,
  type BillingCalendarState,
} from "@/lib/billingCalendar";
import { getPropertyBillingCalendar } from "@/lib/propertyBillingCalendar";

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
  propertyTimeZone?: string;
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
  propertyTimeZone,
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

  let calendar: BillingCalendarState;
  if (propertyTimeZone !== undefined) {
    if (plan.dueDay !== 1 || (plan.gracePeriodDays !== 3 && plan.gracePeriodDays !== 4 && plan.gracePeriodDays !== 5) ||
        !Number.isSafeInteger(plan.dailyLateFeeMaxDays) || plan.dailyLateFeeMaxDays < 0 || plan.dailyLateFeeMaxDays > 365) {
      throw new RangeError("Invalid property-local billing rules.");
    }
    const local = getPropertyBillingCalendar({ timeZone: propertyTimeZone, gracePeriodDays: plan.gracePeriodDays,
      dailyLateFeesEnabled: plan.dailyLateFeeCents > 0, now });
    // Existing snapshot Date fields carry date-only tokens at UTC midnight,
    // not real UTC due instants. Review formats those tokens without shifting them.
    const dateToken = (value: string) => new Date(`${value}T00:00:00.000Z`);
    calendar = {
      billingCycle: local.billingCycle, dueDay: 1, dueDate: dateToken(local.dueDate),
      gracePeriodDays: plan.gracePeriodDays, graceEndsAt: dateToken(local.graceLastDate),
      isBeforeDueDate: false, isDue: local.localDate === local.dueDate,
      isWithinGracePeriod: local.isWithinGracePeriod, isPastGracePeriod: !local.isWithinGracePeriod,
      daysLateAfterGrace: local.daysLateAfterGrace, initialLateFeeEligible: local.initialLateFeeEligible,
      dailyLateFeeStartDate: dateToken(local.dailyLateFeeStartsOn),
      dailyLateFeeDays: Math.min(local.dailyLateFeeDays, plan.dailyLateFeeMaxDays), evaluatedAt: dateToken(local.localDate),
    };
  } else {
    calendar = getBillingCalendar(
    {
      dueDay: plan.dueDay,
      gracePeriodDays: plan.gracePeriodDays,
      dailyLateFeeMaxDays:
        plan.dailyLateFeeMaxDays,
    },
    now
  );
  }

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
