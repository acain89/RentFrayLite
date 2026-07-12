export type QaResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

export type PaymentStrategy =
  | "ALWAYS_PAY"
  | "NEVER_PAY"
  | "PAY_AFTER_3_MONTHS"
  | "PAY_AFTER_4_MONTHS"
  | "PARTIAL_EVERY_MONTH"
  | "FAILED_THEN_RETRY"
  | "PENDING_ACROSS_CYCLE"
  | "MANUAL_ONLY";

export type UnitScenario = {
  unitNumber: string;
  label: string;
  strategy: PaymentStrategy;
};