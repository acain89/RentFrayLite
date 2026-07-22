import type { PaymentMethod } from "@prisma/client";

export type CheckoutPricingCharge = {
  id: string;
  label: string;
  amountCents: number;
  effectiveBillingCycle: string | null;
  endsAfterBillingCycle: string | null;
};

export type CheckoutPricingOneTimeCharge = {
  id: string;
  label: string;
  amountCents: number;
};

export type CheckoutPricingPlan = {
  id: string;
  name: string;
  baseAmountCents: number;
  dueDay: number;
  gracePeriodDays: number;
  initialLateFeeCents: number;
  dailyLateFeeCents: number;
  dailyLateFeeMaxDays: number;
  charges: CheckoutPricingCharge[];
};

export type CheckoutPricingInput = {
  plan: CheckoutPricingPlan;
  paymentMethod: PaymentMethod;
  oneTimeCharges?: CheckoutPricingOneTimeCharge[];
  now?: Date;
};

export type CheckoutPricingLineItem = {
  type:
    | "BASE_AMOUNT"
    | "RECURRING_CHARGE"
    | "ONE_TIME_CHARGE"
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
  activeOneTimeCharges: CheckoutPricingOneTimeCharge[];
  daysLateAfterGrace: number;
  dailyLateFeeDays: number;
  baseAmountCents: number;
  recurringChargesCents: number;
  oneTimeChargesCents: number;
  initialLateFeeCents: number;
  dailyLateFeesCents: number;
  subtotalCents: number;
  platformFeeCents: number;
  totalChargedCents: number;
  lineItems: CheckoutPricingLineItem[];
};

function getUtcMonthLength(
  year: number,
  monthIndex: number
): number {
  return new Date(
    Date.UTC(year, monthIndex + 1, 0)
  ).getUTCDate();
}

function clampDueDay(
  year: number,
  monthIndex: number,
  dueDay: number
): number {
  return Math.min(
    Math.max(Math.trunc(dueDay), 1),
    getUtcMonthLength(year, monthIndex)
  );
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    )
  );
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function differenceInUtcCalendarDays(
  laterDate: Date,
  earlierDate: Date
): number {
  const millisecondsPerDay = 86_400_000;

  return Math.floor(
    (startOfUtcDay(laterDate).getTime() -
      startOfUtcDay(earlierDate).getTime()) /
      millisecondsPerDay
  );
}

export function getBillingCycle(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(
    value.getUTCMonth() + 1
  ).padStart(2, "0");

  return `${year}-${month}`;
}

function isChargeActiveForBillingCycle(
  charge: CheckoutPricingCharge,
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

export function getPlatformFeeCents(
  paymentMethod: PaymentMethod,
  subtotalCents: number
): number {
  if (paymentMethod === "ACH") {
    return 995;
  }

  if (subtotalCents <= 0) {
    return 0;
  }

  if (subtotalCents <= 9_999) {
    return 500;
  }

  if (subtotalCents <= 19_999) {
    return 800;
  }

  if (subtotalCents <= 29_999) {
    return 1_200;
  }

  if (subtotalCents <= 39_999) {
    return 1_600;
  }

  if (subtotalCents <= 49_999) {
    return 2_000;
  }

  if (subtotalCents <= 74_999) {
    return 3_000;
  }

  if (subtotalCents <= 99_999) {
    return 4_000;
  }

  if (subtotalCents <= 149_999) {
    return 5_500;
  }

  if (subtotalCents <= 199_999) {
    return 7_900;
  }

  return 9_900;
}

export function calculateCheckoutPricing({
  plan,
  paymentMethod,
  oneTimeCharges = [],
  now = new Date(),
}: CheckoutPricingInput): CheckoutPricingResult {
  const billingCycle = getBillingCycle(now);

  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  const dueDay = clampDueDay(
    year,
    monthIndex,
    plan.dueDay
  );

  const dueDate = new Date(
    Date.UTC(year, monthIndex, dueDay)
  );

  const graceDays = Math.max(
    Math.trunc(plan.gracePeriodDays),
    1
  );

  const graceEndsAt = addUtcDays(
    dueDate,
    graceDays - 1
  );

  const daysLateAfterGrace = Math.max(
    differenceInUtcCalendarDays(
      now,
      graceEndsAt
    ),
    0
  );

  const hasInitialLateFee =
    daysLateAfterGrace >= 1;

  const dailyLateFeeDays = hasInitialLateFee
    ? Math.min(
        Math.max(
          daysLateAfterGrace - 1,
          0
        ),
        Math.max(
          Math.trunc(
            plan.dailyLateFeeMaxDays
          ),
          0
        )
      )
    : 0;

  const activeRecurringCharges =
    plan.charges.filter((charge) =>
      isChargeActiveForBillingCycle(
        charge,
        billingCycle
      )
    );

  const activeOneTimeCharges =
    oneTimeCharges.filter(
      (charge) =>
        Number.isInteger(charge.amountCents) &&
        charge.amountCents > 0
    );

  const recurringChargesCents =
    activeRecurringCharges.reduce(
      (total, charge) =>
        total +
        Math.max(charge.amountCents, 0),
      0
    );

  const oneTimeChargesCents =
    activeOneTimeCharges.reduce(
      (total, charge) =>
        total + charge.amountCents,
      0
    );

  const initialLateFeeCents =
    hasInitialLateFee
      ? Math.max(
          plan.initialLateFeeCents,
          0
        )
      : 0;

  const dailyLateFeesCents =
    dailyLateFeeDays *
    Math.max(
      plan.dailyLateFeeCents,
      0
    );

  const baseAmountCents = Math.max(
    plan.baseAmountCents,
    0
  );

  const subtotalCents =
    baseAmountCents +
    recurringChargesCents +
    oneTimeChargesCents +
    initialLateFeeCents +
    dailyLateFeesCents;

  const platformFeeCents =
    getPlatformFeeCents(
      paymentMethod,
      subtotalCents
    );

  const lineItems: CheckoutPricingLineItem[] = [
    {
      type: "BASE_AMOUNT",
      label: plan.name,
      amountCents: baseAmountCents,
    },

    ...activeRecurringCharges.map(
      (charge) => ({
        type: "RECURRING_CHARGE" as const,
        label: charge.label,
        amountCents: Math.max(
          charge.amountCents,
          0
        ),
      })
    ),

    ...activeOneTimeCharges.map(
      (charge) => ({
        type: "ONE_TIME_CHARGE" as const,
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

  lineItems.push({
    type: "PLATFORM_FEE",
    label:
      paymentMethod === "ACH"
        ? "Platform service fee — bank account"
        : "Platform service fee — card",
    amountCents: platformFeeCents,
  });

  return {
    billingCycle,
    dueDate,
    graceEndsAt,
    activeRecurringCharges,
    activeOneTimeCharges,
    daysLateAfterGrace,
    dailyLateFeeDays,
    baseAmountCents,
    recurringChargesCents,
    oneTimeChargesCents,
    initialLateFeeCents,
    dailyLateFeesCents,
    subtotalCents,
    platformFeeCents,
    totalChargedCents:
      subtotalCents +
      platformFeeCents,
    lineItems,
  };
}