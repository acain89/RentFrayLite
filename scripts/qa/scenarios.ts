import type { UnitScenario } from "./types";

export const unitScenarios: UnitScenario[] = [
  { unitNumber: "101", label: "Pays every month", strategy: "ALWAYS_PAY" },
  { unitNumber: "102", label: "Never pays", strategy: "NEVER_PAY" },
  { unitNumber: "103", label: "Pays after 3 months", strategy: "PAY_AFTER_3_MONTHS" },
  { unitNumber: "104", label: "Pays after 4 months", strategy: "PAY_AFTER_4_MONTHS" },
  { unitNumber: "105", label: "Partial every month", strategy: "PARTIAL_EVERY_MONTH" },
  { unitNumber: "106", label: "Failed then retry", strategy: "FAILED_THEN_RETRY" },
  { unitNumber: "107", label: "Pending across cycle", strategy: "PENDING_ACROSS_CYCLE" },
  { unitNumber: "108", label: "Manual only", strategy: "MANUAL_ONLY" },
];