import { directReservationEnabled } from "@/lib/paymentArchitecturePolicy";
import type { CheckoutSession, PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { hasUnknownArchitecture, LEGACY_PRICING_VERSION, isDirectCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { hasCheckoutQuoteAccess } from "@/lib/checkoutConsent";
import { grantDirectReviewAccess, reserveDirectAttempt, getDirectResult, recoverDirectSession } from "@/lib/directCheckoutLifecycle";
import { prepareDirectCheckoutRequest } from "@/lib/directPaymentFoundation";
import type { DirectReadinessReport } from "@/lib/stripeDirectReadiness";
import type { StripePaymentIdentity } from "@/lib/stripePaymentContext";

/** Only a server-loaded immutable snapshot selects dispatch, never request JSON. */
export function checkoutDispatchModel(checkout: CheckoutSession): "LEGACY_DESTINATION" | "DIRECT" | null {
  if (isDirectCheckoutArchitecture(checkout)) return "DIRECT";
  // Keep legacy financial validation and its existing responses in its backend.
  if ((checkout.chargeModel === "LEGACY_DESTINATION" && checkout.pricingVersion === LEGACY_PRICING_VERSION) || hasUnknownArchitecture(checkout)) return "LEGACY_DESTINATION";
  return null;
}

export async function reserveLegacyCheckoutDispatch<T>(checkout: CheckoutSession, reserve: () => Promise<T>): Promise<T> {
  if (checkoutDispatchModel(checkout) !== "LEGACY_DESTINATION") throw Error("Checkout architecture is unavailable.");
  return reserve();
}

type DirectContext = Readonly<{ identity: StripePaymentIdentity; report: DirectReadinessReport | null; origin: string }>;
/** Server-only preparation/observation. There is deliberately NO create call or
 * execution callback here. Existing policy-gated executors remain disabled.
 * Public checkout has no direct context configured and rejects direct dispatch. */
export async function prepareDirectCheckoutDispatch(db: PrismaClient, stripe: Stripe, checkoutId: string, context: DirectContext) {
  const { identity, report, origin } = context;
  const checkout = await db.checkoutSession.findUnique({ where: { id: checkoutId } });
  if (!checkout || checkoutDispatchModel(checkout) !== "DIRECT") throw Error("Checkout architecture is unavailable.");
  const orphan = checkout.paymentId ? null : await db.payment.findUnique({ where: { checkoutAttemptId: checkoutId } });
  if (!directReservationEnabled() && !checkout.paymentId && !orphan) throw Error("New direct reservations are disabled.");
  // A fresh issuing-browser binding may establish the durable recovery namespace.
  // First reservation ALSO rechecks quote ownership under its final write lock.
  if (await hasCheckoutQuoteAccess(checkoutId)) await grantDirectReviewAccess(checkoutId);
  if (checkout.paymentId && checkout.stripeCheckoutSessionId) {
    const result = await getDirectResult(db, stripe, checkout.accountCode, checkout.stripeCheckoutSessionId, identity);
    if (!result) throw Error("Checkout authorization unavailable.");
    return { kind: "existing" as const, result };
  }
  if (!report && !checkout.paymentId && !orphan) throw Error("Fresh direct readiness evidence is required.");
  const reservation = await reserveDirectAttempt(db, checkoutId, report, identity);
  if (reservation.kind === "existing") {
    const result = await getDirectResult(db, stripe, reservation.checkout.accountCode, reservation.payment.stripeCheckoutSessionId!, identity);
    if (!result) throw Error("Checkout authorization unavailable.");
    return { kind: "existing" as const, result };
  }
  if (reservation.kind !== "reserved") return { kind: "unconfirmed" as const, checkout: reservation.checkout, payment: reservation.payment };
  // Rollback retains a reservation whose provider result may be unknown, but
  // does not prepare another creation request. Known-ID recovery stays separate.
  if (!directReservationEnabled()) return { kind: "unconfirmed" as const, checkout: reservation.checkout, payment: reservation.payment };
  if (!report) throw Error("Fresh direct readiness evidence is required.");
  const request = prepareDirectCheckoutRequest(reservation.checkout, reservation.payment, report, identity, origin, new Date());
  return { kind: "prepared" as const, checkout: reservation.checkout, payment: reservation.payment, request, creationEnabled: false as const };
}

/** Known-ID recovery only, in the original persisted account. No tenant search,
 * replacement attempt, status settlement, provider creation or money movement. */
export async function recoverDirectCheckoutDispatch(db: PrismaClient, stripe: Stripe, checkoutId: string, sessionId: string, identity: StripePaymentIdentity) {
  const checkout = await db.checkoutSession.findUnique({ where: { id: checkoutId } });
  if (!checkout || checkoutDispatchModel(checkout) !== "DIRECT") throw Error("Checkout architecture is unavailable.");
  return recoverDirectSession(db, stripe, checkoutId, sessionId, identity);
}
