import type { TenantBehavior } from "./behavior";

export type SimulatedUnit = {
  unitNumber: string;
  behavior: TenantBehavior;
};

export type PropertySimulatorPreset =
  | "default"
  | "small-landlord"
  | "average-apartment"
  | "high-delinquency";

export type PropertySimulatorOptions = {
  unitCount?: number;
  preset?: PropertySimulatorPreset;
};

const behaviorPools: Record<PropertySimulatorPreset, TenantBehavior[]> = {
  default: [
    "ALWAYS_PAY",
    "NEVER_PAY",
    "PAY_AFTER_3_MONTHS",
    "PAY_AFTER_4_MONTHS",
    "PARTIAL_EVERY_MONTH",
    "FAILED_THEN_RETRY",
    "PENDING_ACROSS_CYCLE",
    "MANUAL_ONLY",
  ],
  "small-landlord": [
    "ALWAYS_PAY",
    "ALWAYS_PAY",
    "ALWAYS_PAY",
    "ALWAYS_PAY",
    "MANUAL_ONLY",
    "PAY_AFTER_3_MONTHS",
  ],
  "average-apartment": [
    "ALWAYS_PAY",
    "ALWAYS_PAY",
    "ALWAYS_PAY",
    "MANUAL_ONLY",
    "PARTIAL_EVERY_MONTH",
    "FAILED_THEN_RETRY",
    "PAY_AFTER_3_MONTHS",
    "PAY_AFTER_4_MONTHS",
  ],
  "high-delinquency": [
    "NEVER_PAY",
    "NEVER_PAY",
    "PARTIAL_EVERY_MONTH",
    "PAY_AFTER_3_MONTHS",
    "PAY_AFTER_4_MONTHS",
    "FAILED_THEN_RETRY",
    "PENDING_ACROSS_CYCLE",
    "MANUAL_ONLY",
  ],
};

export function buildSimulatedProperty(
  options: PropertySimulatorOptions = {}
): SimulatedUnit[] {
  const unitCount = options.unitCount ?? 20;
  const preset = options.preset ?? "default";
  const pool = behaviorPools[preset];

  return Array.from({ length: unitCount }, (_, index) => {
    const unitNumber = String(101 + index);
    const behavior = pool[index % pool.length];

    return {
      unitNumber,
      behavior,
    };
  });
}