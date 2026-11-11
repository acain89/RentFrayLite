import type Stripe from "stripe";

export type StripePaymentMode = "test" | "live";
export type StripePaymentIdentity = Readonly<{ platformAccountId: string; mode: StripePaymentMode }>;

// Nullable historical facts stay unknown. Only a server-loaded RFL record may
// supply this input; metadata and the current business connection are not records.
export type CapturedStripeArchitecture = Readonly<{
  pricingVersion: string | null;
  chargeModel: string | null;
  stripeConnectedAccountId: string | null;
  stripePlatformAccountId?: string | null;
  stripeMode?: string | null;
}>;

const contextBrand: unique symbol = Symbol("RFL persisted payment context");
export type StripePaymentContext = Readonly<{
  [contextBrand]: true;
  chargeModel: "LEGACY_DESTINATION" | "DIRECT";
  pricingVersion: "RFL_LEGACY_V1" | "RFL_DIRECT_V1";
  connectedAccountId: string;
  platformAccountId: string;
  mode: StripePaymentMode;
  scope: "platform" | "connected";
}>;

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("Stripe payment ownership/environment is unverified.");
}
const accountId = (value: unknown): value is string => typeof value === "string" && /^acct_[A-Za-z0-9]+$/.test(value);

export function classifyStripeCredentialMode(key: string): StripePaymentMode | "unknown" {
  if (/^[sr]k_live_.+/.test(key.trim())) return "live";
  if (/^[sr]k_test_.+/.test(key.trim())) return "test";
  return "unknown";
}

// Configuration is supplied explicitly by the server. No environment reads,
// credentials, default account IDs or test/live fallbacks are hidden here.
export function validateStripePaymentIdentity(expected: StripePaymentIdentity,
  observed: { platformAccountId: string; livemode: boolean; credentialMode: StripePaymentMode | "unknown" }): void {
  requireValid(accountId(expected.platformAccountId) && (expected.mode === "test" || expected.mode === "live"));
  requireValid(observed.platformAccountId === expected.platformAccountId &&
    typeof observed.livemode === "boolean" && observed.livemode === (expected.mode === "live") &&
    observed.credentialMode === expected.mode);
}

export function resolveStripePaymentContext(snapshot: CapturedStripeArchitecture,
  identity: StripePaymentIdentity): StripePaymentContext {
  requireValid(accountId(identity.platformAccountId) && (identity.mode === "test" || identity.mode === "live"));
  requireValid(snapshot.stripePlatformAccountId === identity.platformAccountId && snapshot.stripeMode === identity.mode);
  requireValid(accountId(snapshot.stripeConnectedAccountId) && snapshot.stripeConnectedAccountId !== identity.platformAccountId);
  const legacy = snapshot.chargeModel === "LEGACY_DESTINATION" && snapshot.pricingVersion === "RFL_LEGACY_V1";
  const direct = snapshot.chargeModel === "DIRECT" && snapshot.pricingVersion === "RFL_DIRECT_V1";
  requireValid(legacy || direct);
  return Object.freeze({ [contextBrand]: true as const,
    chargeModel: legacy ? "LEGACY_DESTINATION" : "DIRECT",
    pricingVersion: legacy ? "RFL_LEGACY_V1" : "RFL_DIRECT_V1",
    connectedAccountId: snapshot.stripeConnectedAccountId,
    platformAccountId: identity.platformAccountId, mode: identity.mode,
    scope: legacy ? "platform" : "connected" });
}

export function stripePaymentRequestOptions(context: StripePaymentContext): Stripe.RequestOptions {
  requireValid(context[contextBrand] === true);
  return context.scope === "connected" ? { stripeAccount: context.connectedAccountId } : {};
}

// True means account/environment compatibility only, NOT permission to process
// an event. Phase 4.5 must independently verify database and Stripe object IDs.
export function matchesStripePaymentEventContext(context: StripePaymentContext | null,
  event: { account?: string | null; livemode: boolean }, platformAccountId: string): boolean {
  if (!context || context[contextBrand] !== true || context.platformAccountId !== platformAccountId ||
      typeof event.livemode !== "boolean" || event.livemode !== (context.mode === "live")) return false;
  return context.scope === "connected" ? event.account === context.connectedAccountId : event.account == null;
}
