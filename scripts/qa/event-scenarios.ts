import type { QaEvent } from "./events";

export const paysEveryMonth: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "101", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-01", unitNumber: "101", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "101", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-02", unitNumber: "101", amountCents: 100 },
];

export const skipsThreeMonthsThenPays: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "103", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "103", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-03", unitNumber: "103", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-04", unitNumber: "103", amountCents: 300 },
];

export const skipsFourMonthsThenPays: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "104", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "104", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-03", unitNumber: "104", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-04", unitNumber: "104", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-05", unitNumber: "104", amountCents: 400 },
];

export const pendingAcrossCycle: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "107", amountCents: 100 },
  { type: "PAYMENT_STARTED", cycle: "2026-01", unitNumber: "107", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "107", amountCents: 100 },
];

export const partialEveryMonth: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "105", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-01", unitNumber: "105", amountCents: 50 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "105", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-02", unitNumber: "105", amountCents: 50 },
];

export const failedThenRetry: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "106", amountCents: 100 },
  { type: "PAYMENT_STARTED", cycle: "2026-01", unitNumber: "106", amountCents: 100 },
  { type: "PAYMENT_FAILED", cycle: "2026-01", unitNumber: "106", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-02", unitNumber: "106", amountCents: 100 },
];

export const lateFeesThenPays: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "109", amountCents: 100 },
  { type: "POST_LATE_FEE", cycle: "2026-01", unitNumber: "109", amountCents: 50 },
  { type: "POST_LATE_FEE", cycle: "2026-01", unitNumber: "109", amountCents: 25 },
  { type: "POST_LATE_FEE", cycle: "2026-01", unitNumber: "109", amountCents: 25 },
  { type: "PAYMENT_SETTLED", cycle: "2026-02", unitNumber: "109", amountCents: 200 },
];

export const manualOnly: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "108", amountCents: 100 },
  { type: "MANUAL_PAYMENT", cycle: "2026-01", unitNumber: "108", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "108", amountCents: 100 },
  { type: "MANUAL_PAYMENT", cycle: "2026-02", unitNumber: "108", amountCents: 100 },
];

export const skipsSixMonthsThenPays: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "121", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "121", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-03", unitNumber: "121", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-04", unitNumber: "121", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-05", unitNumber: "121", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-06", unitNumber: "121", amountCents: 100 },
  {
    type: "PAYMENT_SETTLED",
    cycle: "2026-07",
    unitNumber: "121",
    amountCents: 600,
  },
];

export const skipsTwelveMonthsThenPays: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-03", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-04", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-05", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-06", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-07", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-08", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-09", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-10", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-11", unitNumber: "122", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-12", unitNumber: "122", amountCents: 100 },
  {
    type: "PAYMENT_SETTLED",
    cycle: "2027-01",
    unitNumber: "122",
    amountCents: 1200,
  },
];

export const vacantUnitScenario: QaEvent[] = [];

export const moveInAfterDueDateScenario: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "123", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-02", unitNumber: "123", amountCents: 100 },
];

export const moveOutWithBalanceScenario: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "124", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "124", amountCents: 100 },
];

export const rentIncreaseNextCycleScenario: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "125", amountCents: 100 },
  { type: "PAYMENT_SETTLED", cycle: "2026-01", unitNumber: "125", amountCents: 100 },
  { type: "POST_RENT", cycle: "2026-02", unitNumber: "125", amountCents: 125 },
  { type: "PAYMENT_SETTLED", cycle: "2026-02", unitNumber: "125", amountCents: 125 },
];

export const mixedChargesScenario: QaEvent[] = [
  { type: "POST_RENT", cycle: "2026-01", unitNumber: "126", amountCents: 100 },
  {
    type: "POST_RECURRING_CHARGE",
    cycle: "2026-01",
    unitNumber: "126",
    amountCents: 25,
    memo: "QA recurring charge",
  },
  { type: "POST_LATE_FEE", cycle: "2026-01", unitNumber: "126", amountCents: 50 },
  {
    type: "POST_CREDIT",
    cycle: "2026-01",
    unitNumber: "126",
    amountCents: 25,
    memo: "QA credit",
  },
  { type: "PAYMENT_SETTLED", cycle: "2026-02", unitNumber: "126", amountCents: 150 },
];