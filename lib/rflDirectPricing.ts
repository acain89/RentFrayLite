/**
 * INACTIVE Phase 1 contract from RFL FINAL. No checkout imports this module.
 * Prices an already-authoritative obligation; it does not determine what is owed.
 * Estimates are planning amounts, never observations of actual Stripe fees.
 * Persist this version with future snapshots; never reprice historical payments.
 */
export const RFL_DIRECT_PRICING_VERSION = "RFL_DIRECT_V1" as const;
export const PLANNING_PERCENTAGE_ROUNDING = "HALF_UP_NON_NEGATIVE" as const;

export type RflDirectPaymentMethod = "ACH" | "CARD";
export type RflDirectPricing = Readonly<{
  pricingVersion: typeof RFL_DIRECT_PRICING_VERSION;
  paymentMethod: RflDirectPaymentMethod;
  managementOwedCents: number;
  bandNumber: number;
  tenantProcessingFeeCents: number;
  tenantTotalCents: number;
  expectedStripeProcessingFeeCents: number;
  rflApplicationFeeCents: number;
  expectedManagementNetCents: number;
}>;

function requireInteger(value: number, name: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer of at least ${minimum}.`);
  }
}

function requireObligation(value: number): void {
  requireInteger(value, "managementOwedCents", 100);
  if (value > 500_000) throw new RangeError("managementOwedCents must not exceed 500000.");
}

function safeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError("Calculated cents exceed the safe integer range.");
  return result;
}

/**
 * Central planning policy: nearest whole cent, exact halves rounded upward.
 * Nonnegative integer cents and rational rates only. BigInt keeps multiplication
 * and division exact, including at rounding ties. No floating-point percentages.
 * Stripe rounding still requires later sandbox verification. A policy change
 * must receive a new pricing version; RFL_DIRECT_V1 snapshots remain immutable.
 */
export function roundPlanningPercentageCents(amountCents: number, numerator: number, denominator: number): number {
  requireInteger(amountCents, "amountCents");
  requireInteger(numerator, "numerator");
  requireInteger(denominator, "denominator", 1);
  const divisor = BigInt(denominator);
  return safeNumber((BigInt(amountCents) * BigInt(numerator) + divisor / BigInt(2)) / divisor);
}

export function priceRflDirectV1(input: Readonly<{
  managementOwedCents: number;
  paymentMethod: RflDirectPaymentMethod;
}>): RflDirectPricing {
  const { managementOwedCents, paymentMethod } = input;
  requireObligation(managementOwedCents);
  if (paymentMethod !== "ACH" && paymentMethod !== "CARD") throw new TypeError("Unsupported payment method.");
  const bandNumber = safeNumber((BigInt(managementOwedCents) + BigInt(2499)) / BigInt(2500));
  const tenantProcessingFeeCents = paymentMethod === "CARD"
    ? 200 + 100 * (bandNumber - 1)
    : Math.min(995, 100 + 50 * (bandNumber - 1));
  const tenantTotalCents = managementOwedCents + tenantProcessingFeeCents;
  const expectedStripeProcessingFeeCents = paymentMethod === "CARD"
    ? roundPlanningPercentageCents(tenantTotalCents, 29, 1000) + 30
    : Math.min(500, roundPlanningPercentageCents(tenantTotalCents, 8, 1000));
  const rflApplicationFeeCents = tenantProcessingFeeCents - expectedStripeProcessingFeeCents;
  const expectedManagementNetCents = tenantTotalCents - expectedStripeProcessingFeeCents - rflApplicationFeeCents;
  if (rflApplicationFeeCents < 0 || expectedManagementNetCents !== managementOwedCents) {
    throw new Error("RFL_DIRECT_V1 pricing invariant failed.");
  }
  return Object.freeze({
    pricingVersion: RFL_DIRECT_PRICING_VERSION, paymentMethod, managementOwedCents,
    bandNumber, tenantProcessingFeeCents, tenantTotalCents,
    expectedStripeProcessingFeeCents, rflApplicationFeeCents, expectedManagementNetCents,
  });
}

export type ManagementNetReconciliationPlan = Readonly<{
  action: "NONE" | "APPLICATION_FEE_REFUND_REQUIRED" | "FINANCIAL_EXCEPTION";
  shortfallCents: number;
  applicationFeeRefundCents: number;
  unresolvedShortfallCents: number;
  managementOverageCents: number;
}>;

/** Pure policy only: performs no refund, transfer, persistence or provider read. */
export function planManagementNetReconciliation(input: Readonly<{
  managementOwedCents: number;
  actualManagementNetCents: number;
  remainingApplicationFeeCents: number;
}>): ManagementNetReconciliationPlan {
  const { managementOwedCents, actualManagementNetCents, remainingApplicationFeeCents } = input;
  requireObligation(managementOwedCents);
  // Actual net may be negative; do not silently clamp a real financial shortfall.
  if (!Number.isSafeInteger(actualManagementNetCents)) throw new RangeError("actualManagementNetCents must be a safe integer.");
  requireInteger(remainingApplicationFeeCents, "remainingApplicationFeeCents");
  const difference = safeNumber(BigInt(managementOwedCents) - BigInt(actualManagementNetCents));
  const shortfallCents = Math.max(0, difference);
  const applicationFeeRefundCents = Math.min(shortfallCents, remainingApplicationFeeCents);
  const unresolvedShortfallCents = shortfallCents - applicationFeeRefundCents;
  return Object.freeze({
    action: unresolvedShortfallCents > 0 ? "FINANCIAL_EXCEPTION"
      : applicationFeeRefundCents > 0 ? "APPLICATION_FEE_REFUND_REQUIRED" : "NONE",
    shortfallCents, applicationFeeRefundCents, unresolvedShortfallCents,
    // Intentional asymmetry: management keeps cheaper-processing overages.
    managementOverageCents: Math.max(0, -difference),
  });
}
