import type { CheckoutSession, Payment } from "@prisma/client";

// Identifies today's old fee engine. Future fee changes require a new version;
// historical snapshots are never recomputed through the current engine.
export const LEGACY_PRICING_VERSION = "RFL_LEGACY_V1" as const;

const architectureFields = [
  "pricingVersion", "chargeModel", "stripeConnectedAccountId",
  "expectedStripeProcessingFeeCents", "rflApplicationFeeCents",
  "stripePlatformAccountId", "stripeMode",
] as const;

type Architecture = Pick<CheckoutSession, typeof architectureFields[number]>;

// Records created before these fields existed retain unknown facts. Undefined
// is equivalent to database null for isolated fixtures, never a guessed value.
export function hasUnknownArchitecture(snapshot: Architecture): boolean {
  return architectureFields.every(field => snapshot[field] == null);
}

export function legacyCheckoutArchitecture(stripeConnectedAccountId: string, managementOwedCents: number, tenantFeeCents: number) {
  if (!/^acct_[A-Za-z0-9_]+$/.test(stripeConnectedAccountId)) throw new Error("Invalid destination account snapshot.");
  if (![managementOwedCents, tenantFeeCents].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Invalid legacy monetary snapshot.");
  }
  return {
    pricingVersion: LEGACY_PRICING_VERSION,
    chargeModel: "LEGACY_DESTINATION" as const,
    stripeConnectedAccountId,
    // The current destination architecture does not calculate this estimate.
    expectedStripeProcessingFeeCents: null,
    rflApplicationFeeCents: tenantFeeCents,
    expectedManagementNetCents: managementOwedCents,
  };
}

export function isLegacyCheckoutArchitecture(checkout: CheckoutSession): boolean {
  return checkout.pricingVersion === LEGACY_PRICING_VERSION && checkout.chargeModel === "LEGACY_DESTINATION" &&
    ((checkout.stripePlatformAccountId == null && checkout.stripeMode == null) ||
      (typeof checkout.stripePlatformAccountId === "string" && /^acct_[A-Za-z0-9]+$/.test(checkout.stripePlatformAccountId) &&
        checkout.stripePlatformAccountId !== checkout.stripeConnectedAccountId && (checkout.stripeMode === "test" || checkout.stripeMode === "live"))) &&
    typeof checkout.stripeConnectedAccountId === "string" && /^acct_[A-Za-z0-9_]+$/.test(checkout.stripeConnectedAccountId) &&
    checkout.expectedStripeProcessingFeeCents === null && checkout.rflApplicationFeeCents === checkout.platformFeeCents &&
    checkout.expectedManagementNetCents === checkout.subtotalCents &&
    Number.isSafeInteger(checkout.subtotalCents) && checkout.subtotalCents >= 0 &&
    Number.isSafeInteger(checkout.platformFeeCents) && checkout.platformFeeCents >= 0 &&
    checkout.totalCents === checkout.subtotalCents + checkout.platformFeeCents;
}

export function isDirectCheckoutArchitecture(checkout: CheckoutSession): boolean {
  return checkout.chargeModel === "DIRECT" && checkout.pricingVersion === "RFL_DIRECT_V1" &&
    typeof checkout.stripePlatformAccountId === "string" && /^acct_[A-Za-z0-9]+$/.test(checkout.stripePlatformAccountId) &&
    typeof checkout.stripeConnectedAccountId === "string" && /^acct_[A-Za-z0-9]+$/.test(checkout.stripeConnectedAccountId) &&
    checkout.stripePlatformAccountId !== checkout.stripeConnectedAccountId && (checkout.stripeMode === "test" || checkout.stripeMode === "live") &&
    [checkout.subtotalCents, checkout.platformFeeCents, checkout.expectedStripeProcessingFeeCents, checkout.rflApplicationFeeCents, checkout.expectedManagementNetCents]
      .every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0) &&
    checkout.totalCents === checkout.subtotalCents + checkout.platformFeeCents && checkout.expectedManagementNetCents === checkout.subtotalCents &&
    checkout.totalCents - checkout.expectedStripeProcessingFeeCents! - checkout.rflApplicationFeeCents! === checkout.expectedManagementNetCents;
}

export function sameCheckoutArchitecture(left: CheckoutSession, right: CheckoutSession): boolean {
  return architectureFields.every(field => (left[field] ?? null) === (right[field] ?? null)) &&
    (left.expectedManagementNetCents ?? null) === (right.expectedManagementNetCents ?? null);
}

export function paymentMatchesCheckoutArchitecture(payment: Payment, checkout: CheckoutSession): boolean {
  if (!architectureFields.every(field => (payment[field] ?? null) === (checkout[field] ?? null))) return false;
  if (hasUnknownArchitecture(payment) && hasUnknownArchitecture(checkout)) {
    return checkout.expectedManagementNetCents == null;
  }
  return isLegacyCheckoutArchitecture(checkout) && payment.businessProceedsCents === checkout.expectedManagementNetCents;
}

// Separate dormant check: active legacy retry/webhook callers do not acquire
// direct-charge permission merely because ownership fields now exist.
export function directPaymentMatchesCheckoutArchitecture(payment: Payment, checkout: CheckoutSession): boolean {
  return isDirectCheckoutArchitecture(checkout) && payment.checkoutAttemptId === checkout.id &&
    architectureFields.every(field => payment[field] === checkout[field]) && payment.businessId === checkout.businessId &&
    payment.sourceType === checkout.sourceType && payment.sourceId === checkout.planId && payment.billingCycle === checkout.billingCycle &&
    payment.subtotalCents === checkout.subtotalCents && payment.platformFeeCents === checkout.platformFeeCents &&
    payment.totalChargedCents === checkout.totalCents && payment.businessProceedsCents === checkout.expectedManagementNetCents;
}
