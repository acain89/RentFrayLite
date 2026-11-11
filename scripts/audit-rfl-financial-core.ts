import { PaymentMethod } from "@prisma/client";

import {
  getBillingCalendar,
  getBillingCycle,
} from "../lib/billingCalendar";

import {
  getFinancialState,
} from "../lib/financialState";

import {
  calculateCheckoutPricing,
} from "../lib/checkoutPricing";

import {
  getAchPlatformFeeCents,
  getCardPlatformFeeCents,
} from "../lib/platformFees";

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`
    );
  }
}

function assertTrue(
  value: boolean,
  label: string
): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function testBillingCalendar(): void {
  const calendar = getBillingCalendar(
    {
      dueDay: 1,
      gracePeriodDays: 5,
      dailyLateFeeMaxDays: 5,
    },
    new Date("2026-08-07T12:00:00.000Z")
  );

  assertEqual(
    calendar.billingCycle,
    "2026-08",
    "August billing cycle"
  );

  assertEqual(
    isoDate(calendar.dueDate),
    "2026-08-01",
    "August due date"
  );

  assertEqual(
    isoDate(calendar.graceEndsAt),
    "2026-08-05",
    "Grace end date"
  );

  assertTrue(
    calendar.initialLateFeeEligible,
    "Initial late fee eligible"
  );

  assertEqual(
    calendar.dailyLateFeeDays,
    1,
    "First daily late-fee day"
  );
}

function testShortMonthClamp(): void {
  const calendar = getBillingCalendar(
    {
      dueDay: 31,
      gracePeriodDays: 1,
      dailyLateFeeMaxDays: 0,
    },
    new Date("2027-02-28T12:00:00.000Z")
  );

  assertEqual(
    isoDate(calendar.dueDate),
    "2027-02-28",
    "February due-day clamp"
  );
}

function testYearRollover(): void {
  assertEqual(
    getBillingCycle(
      new Date("2027-01-01T00:00:00.000Z")
    ),
    "2027-01",
    "January billing cycle"
  );
}

function testFinancialState(): void {
  const state = getFinancialState({
    plan: {
      id: "plan-1",
      name: "Lot Rent",
      baseAmountCents: 100_000,
      dueDay: 1,
      gracePeriodDays: 5,
      initialLateFeeCents: 7_500,
      dailyLateFeeCents: 1_000,
      dailyLateFeeMaxDays: 5,
      charges: [
        {
          id: "water",
          label: "Water",
          amountCents: 5_000,
          effectiveBillingCycle: null,
          endsAfterBillingCycle: null,
        },
      ],
    },

now: new Date("2026-08-08T12:00:00.000Z"),
  });


  assertEqual(
    state.baseAmountCents,
    100_000,
    "Base amount"
  );

  assertEqual(
    state.recurringChargesCents,
    5_000,
    "Recurring charges"
  );

  assertEqual(
    state.initialLateFeeCents,
    7_500,
    "Initial late fee"
  );

  assertEqual(
    state.dailyLateFeeDays,
    2,
    "Daily late-fee count"
  );

  assertEqual(
    state.dailyLateFeesCents,
    2_000,
    "Daily late-fee amount"
  );

  assertEqual(
    state.subtotalCents,
    114_500,
    "Business-side subtotal"
  );
}

function testRecurringChargeCycles(): void {
  const state = getFinancialState({
    plan: {
      id: "plan-cycle",
      name: "Monthly",
      baseAmountCents: 100_000,
      dueDay: 1,
      gracePeriodDays: 5,
      initialLateFeeCents: 0,
      dailyLateFeeCents: 0,
      dailyLateFeeMaxDays: 0,
      charges: [
        {
          id: "active",
          label: "Active",
          amountCents: 1_000,
          effectiveBillingCycle: "2026-08",
          endsAfterBillingCycle: null,
        },
        {
          id: "future",
          label: "Future",
          amountCents: 2_000,
          effectiveBillingCycle: "2026-09",
          endsAfterBillingCycle: null,
        },
        {
          id: "expired",
          label: "Expired",
          amountCents: 3_000,
          effectiveBillingCycle: null,
          endsAfterBillingCycle: "2026-07",
        },
      ],
    },

    now: new Date("2026-08-03T12:00:00.000Z"),
  });

  assertEqual(
    state.recurringChargesCents,
    1_000,
    "Recurring charge cycle filtering"
  );

  assertEqual(
    state.activeRecurringCharges.length,
    1,
    "Active recurring charge count"
  );
}

function testCheckoutPricing(): void {
  const pricing = calculateCheckoutPricing({
    plan: {
      id: "plan-checkout",
      name: "Rent",
      baseAmountCents: 100_000,
      dueDay: 1,
      gracePeriodDays: 5,
      initialLateFeeCents: 0,
      dailyLateFeeCents: 0,
      dailyLateFeeMaxDays: 0,
      charges: [],
    },

    paymentMethod: PaymentMethod.ACH,

    now: new Date("2026-08-01T12:00:00.000Z"),
  });

  assertEqual(
    pricing.subtotalCents,
    100_000,
    "Checkout subtotal"
  );

  assertEqual(
    pricing.platformFeeCents,
    getAchPlatformFeeCents(100_000),
    "ACH fee authority"
  );

  assertEqual(
    pricing.totalChargedCents,
    pricing.subtotalCents +
      pricing.platformFeeCents,
    "Checkout total"
  );
}

function testFeeAuthorities(): void {
  assertEqual(
    getAchPlatformFeeCents(50_000),
    795,
    "ACH $500 fee"
  );

  assertEqual(
    getCardPlatformFeeCents(50_000),
    2_300,
    "Card $500 fee"
  );
}

function main(): void {
  testBillingCalendar();
  testShortMonthClamp();
  testYearRollover();
  testFinancialState();
  testRecurringChargeCycles();
  testCheckoutPricing();
  testFeeAuthorities();

  console.log(
    "PASS: RFL financial-core regression audit completed successfully."
  );
}

main();