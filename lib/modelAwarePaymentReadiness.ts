import type Stripe from "stripe";
import { getLegacyBusinessPaymentReadiness } from "@/lib/businessPaymentReadiness";
import { getPaymentReadinessWithStripeReasons, type ReadinessBusiness } from "@/lib/paymentReadiness";
import { readDirectChargeReadiness, verifiedDirectOwnership } from "@/lib/stripeDirectReadiness";
import type { StripePaymentIdentity } from "@/lib/stripePaymentContext";

type Business = ReadinessBusiness & { stripeConnection: { stripeAccountId: string } | null };
/** Server configuration only. Never bind this selection to request JSON/query data.
 * Active checkout continues to call the unchanged legacy adapter directly.
 * DIRECT_CONNECTED is an adapter selection; persisted direct snapshots remain DIRECT. */
export type PaymentReadinessArchitecture =
  | { chargeModel: "LEGACY_DESTINATION" }
  | { chargeModel: "DIRECT_CONNECTED"; stripe: Stripe; identity: StripePaymentIdentity;
      credentialMode: "test" | "live" | "unknown"; applicationId: string; production: boolean };

export async function getModelAwareBusinessPaymentReadiness(
  business: Business, architecture: PaymentReadinessArchitecture, planId?: string,
  sourceType: "RECURRING_PLAN" | "CUSTOM_PAYMENT" = "RECURRING_PLAN",
) {
  if (architecture.chargeModel === "LEGACY_DESTINATION") {
    return getLegacyBusinessPaymentReadiness(business, planId, sourceType);
  }
  // Do not silently turn an unknown runtime model into legacy eligibility.
  if (architecture.chargeModel !== "DIRECT_CONNECTED") throw Error("Unsupported payment readiness architecture.");
  const connectedAccountId = business.stripeConnection?.stripeAccountId;
  let codes: readonly string[] = [connectedAccountId ? "DIRECT_STRIPE_EVIDENCE_UNVERIFIED" : "NO_CONNECTED_ACCOUNT"];
  if (connectedAccountId) {
    try {
      const report = await readDirectChargeReadiness(architecture.stripe, {
        identity: architecture.identity, credentialMode: architecture.credentialMode,
        connectedAccountId, applicationId: architecture.applicationId, production: architecture.production,
      });
      if (report.ready) {
        verifiedDirectOwnership(report, architecture.identity, connectedAccountId);
        codes = [];
      } else if (report.reasonCodes.length) codes = report.reasonCodes;
    } catch { /* No persisted setup flag or unverifiable report can authorize payment. */ }
  }
  return getPaymentReadinessWithStripeReasons(business, codes.map(code => ({
    code, message: "Your payment account needs verification before payments are available.", route: "/setup/stripe",
  })), architecture.identity.mode, planId, sourceType);
}
