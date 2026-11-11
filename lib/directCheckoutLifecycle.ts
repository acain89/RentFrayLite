import { hasCheckoutQuoteAccess } from "@/lib/checkoutConsent";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type CheckoutSession, type Payment, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { lockActiveCheckoutBusiness } from "@/lib/checkoutBusinessLock";
import { loadCurrentCheckoutPlan, getCheckoutCalendar } from "@/lib/checkoutCalendar";
import { assertCheckoutSource } from "@/lib/customPayment";
import { assertCurrentDirectCheckoutQuote, prepareDirectPaymentRecord, prepareDirectCheckoutRequest } from "@/lib/directPaymentFoundation";
import { directPaymentMatchesCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { resolveStripePaymentContext, stripePaymentRequestOptions, type StripePaymentIdentity } from "@/lib/stripePaymentContext";
import type { DirectReadinessReport } from "@/lib/stripeDirectReadiness";
import { grantPaymentResultAccess, getPaymentResultAccessToken, verifyPaymentResultAccessToken } from "@/lib/paymentResultAccess";
import { directPaymentCreationEnabled, directReservationEnabled } from "@/lib/paymentArchitecturePolicy";

// DORMANT: no active production caller. No env/request/database activation switch.
const TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 };
const READ = { timeout: 5000, maxNetworkRetries: 0 };
const bindingId = (id: string) => `direct-attempt:${id}`;
const requireSafe = (condition: unknown): void => { if (!condition) throw Error("Direct checkout ownership or authorization is unverified."); };

/** Future quote route must grant this only to the browser creating the quote.
 * Reuses the existing HttpOnly, SameSite signed-cookie implementation, with a
 * separate pre-Stripe namespace. Query IDs alone never authorize a review. */
export async function grantDirectReviewAccess(checkoutId: string): Promise<void> {
  requireSafe(typeof checkoutId === "string" && checkoutId.length > 0 && checkoutId.length <= 100);
  await grantPaymentResultAccess(bindingId(checkoutId), checkoutId);
}
async function attemptAccess(checkoutId: string): Promise<boolean> {
  const token = await getPaymentResultAccessToken(bindingId(checkoutId));
  return !!token && verifyPaymentResultAccessToken(token, bindingId(checkoutId), checkoutId);
}
async function resultAccess(sessionId: string, checkoutId: string): Promise<boolean> {
  const token = await getPaymentResultAccessToken(sessionId);
  return !!token && verifyPaymentResultAccessToken(token, sessionId, checkoutId);
}
function paymentFacts(value: Payment) {
  return { ...value, status: null, updatedAt: null, stripeCheckoutSessionId: null, checkoutStartedAt: null,
    stripePaymentIntentId: null, stripeChargeId: null, pendingAt: null, paidAt: null, failedAt: null, expiredAt: null,
    returnedAt: null, disputedAt: null, failureCode: null, failureMessage: null };
}
function checkoutFacts(value: CheckoutSession) { return { ...value, status: null, updatedAt: null, stripeCheckoutSessionId: null }; }
function pair(checkout: CheckoutSession, payment: Payment, identity: StripePaymentIdentity) {
  assertCheckoutSource(checkout);
  resolveStripePaymentContext(payment, identity);
  requireSafe(checkout.paymentId === payment.id && directPaymentMatchesCheckoutArchitecture(payment, checkout) &&
    checkout.paymentMethod === payment.paymentMethod && checkout.firstName === payment.payerFirstName && checkout.lastName === payment.payerLastName &&
    checkout.phone === payment.payerPhone && checkout.unitNumber === payment.referenceLabel &&
    isDeepStrictEqual(checkout.lineItems, payment.lineItemsSnapshot) &&
    (checkout.stripeCheckoutSessionId ?? null) === (payment.stripeCheckoutSessionId ?? null));
}

export async function getDirectReview(prisma: PrismaClient, checkoutId: string, identity: StripePaymentIdentity, now = new Date()) {
  if (!await attemptAccess(checkoutId)) return null;
  const checkout = await prisma.checkoutSession.findUnique({ where: { id: checkoutId } });
  if (!checkout) return null;
  requireSafe(resolveStripePaymentContext(checkout, identity).chargeModel === "DIRECT"); assertCheckoutSource(checkout);
  if (!checkout.paymentId && (checkout.expiresAt <= now || checkout.status !== "REVIEWED")) return null;
  return checkout;
}

/** Business -> Payment -> Checkout lock order matches current checkout writers.
 * Reservation, pointer repair and snapshots are atomic; no provider awaits. */
export async function reserveDirectAttempt(prisma: PrismaClient, checkoutId: string, report: DirectReadinessReport | null,
  identity: StripePaymentIdentity, now?: Date) {
  requireSafe(await attemptAccess(checkoutId));
  const initial = await prisma.checkoutSession.findUnique({ where: { id: checkoutId } });
  requireSafe(initial);
  return prisma.$transaction(async tx => {
    const business = await lockActiveCheckoutBusiness(tx, initial!.businessId);
    requireSafe(business);
    const before = await tx.checkoutSession.findUnique({ where: { id: checkoutId } });
    requireSafe(before && before.businessId === business!.id);
    const orphan = await tx.payment.findUnique({ where: { checkoutAttemptId: checkoutId } });
    const paymentId = before!.paymentId ?? orphan?.id;
    if (paymentId) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CheckoutSession" WHERE "id" = ${checkoutId} FOR UPDATE`);
    const checkout = await tx.checkoutSession.findUnique({ where: { id: checkoutId } });
    requireSafe(checkout && checkout.businessId === business!.id && await attemptAccess(checkoutId));
    const evaluatedAt = now ?? new Date();
    resolveStripePaymentContext(checkout!, identity); assertCheckoutSource(checkout!);
    if (paymentId) {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } }); requireSafe(payment);
      const linked = { ...checkout!, paymentId };
      pair(linked, payment!, identity);
      if (!checkout!.paymentId) await tx.checkoutSession.update({ where: { id: checkoutId }, data: { paymentId } });
      const age = evaluatedAt.getTime() - payment!.createdAt.getTime();
      const kind = payment!.stripeCheckoutSessionId ? "existing" : payment!.status === "CREATED" && Number.isFinite(age) && age >= 0 && age < 23 * 3600000 ? "reserved" : "unconfirmed";
      return { kind, checkout: linked, payment: payment! } as const;
    }
    if (!directReservationEnabled()) throw Error("New direct reservations are disabled.");
    if (!report) throw Error("Fresh direct readiness evidence is required.");
    requireSafe(checkout!.status === "REVIEWED" && checkout!.expiresAt > evaluatedAt && !checkout!.stripeCheckoutSessionId);
    if (checkout!.sourceType === "RECURRING_PLAN") getCheckoutCalendar(business!, evaluatedAt);
    const source = checkout!.sourceType === "CUSTOM_PAYMENT"
      ? { sourceType: "CUSTOM_PAYMENT" as const, amount: `${Math.floor(checkout!.baseAmountCents / 100)}.${String(checkout!.baseAmountCents % 100).padStart(2, "0")}` }
      : { sourceType: "RECURRING_PLAN" as const, plan: await loadCurrentCheckoutPlan(tx, business!.id, checkout!.planId!) };
    assertCurrentDirectCheckoutQuote(checkout!, report, { property: business!, source, paymentMethod: checkout!.paymentMethod, now: evaluatedAt,
      identity, connectedAccountId: checkout!.stripeConnectedAccountId!, checkoutAttemptId: checkoutId });
    requireSafe(checkout!.expiresAt > (now ?? new Date()) && await hasCheckoutQuoteAccess(checkoutId));
    if (!directReservationEnabled()) throw Error("New direct reservations are disabled.");
    const payment = await tx.payment.create({ data: prepareDirectPaymentRecord(checkout!, report, identity) });
    const linked = await tx.checkoutSession.update({ where: { id: checkoutId }, data: { paymentId: payment.id } });
    return { kind: "reserved", checkout: linked, payment } as const;
  }, TX);
}

function metadata(checkout: CheckoutSession, payment: Payment, actual: Stripe.Metadata | null) {
  const fields = { product: "RentFrayLite", paymentId: payment.id, checkoutSessionId: checkout.id, checkoutAttemptId: checkout.id,
    businessId: payment.businessId, accountCode: checkout.accountCode, sourceType: payment.sourceType, billingCycle: payment.billingCycle ?? "",
    pricingVersion: payment.pricingVersion, chargeModel: "DIRECT", stripePlatformAccountId: payment.stripePlatformAccountId,
    stripeConnectedAccountId: payment.stripeConnectedAccountId, stripeMode: payment.stripeMode };
  requireSafe(Object.entries(fields).every(([key, value]) => actual?.[key] === value));
}
function providerId(value: unknown): string | null {
  return typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
}

/** Read existing provider objects only, always in the ORIGINAL account scope.
 * No status writes: signed webhooks remain the future settlement authority. */
async function observe(stripe: Stripe, checkout: CheckoutSession, payment: Payment, identity: StripePaymentIdentity, sessionId: string) {
  pair(checkout, payment, identity);
  requireSafe(/^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId) && (!payment.stripeCheckoutSessionId || payment.stripeCheckoutSessionId === sessionId));
  const context = resolveStripePaymentContext(payment, identity), options = { ...READ, ...stripePaymentRequestOptions(context) };
  const session = await stripe.checkout.sessions.retrieve(sessionId, {}, options);
  requireSafe(session.id === sessionId && session.livemode === (context.mode === "live") && session.mode === "payment" && session.currency === "usd" &&
    session.amount_total === payment.totalChargedCents && session.client_reference_id === payment.id &&
    ["open", "complete", "expired"].includes(session.status ?? "") && ["paid", "unpaid", "no_payment_required"].includes(session.payment_status) &&
    session.payment_method_types?.length === 1 && session.payment_method_types[0] === (payment.paymentMethod === "ACH" ? "us_bank_account" : "card"));
  metadata(checkout, payment, session.metadata);
  const intentId = providerId(session.payment_intent);
  requireSafe(session.payment_intent === null || intentId);
  requireSafe(!payment.stripePaymentIntentId || payment.stripePaymentIntentId === intentId);
  requireSafe(intentId || !payment.stripeChargeId);
  let intentResumable = true;
  let latestCharge: string | null = null;
  if (intentId) {
    const intent = await stripe.paymentIntents.retrieve(intentId, {}, options);
    requireSafe(intent.id === intentId && intent.livemode === (context.mode === "live") && intent.currency === "usd" &&
      intent.amount === payment.totalChargedCents && intent.application_fee_amount === payment.rflApplicationFeeCents &&
      !intent.transfer_data && !intent.on_behalf_of && (!payment.stripeChargeId || providerId(intent.latest_charge) === payment.stripeChargeId));
    metadata(checkout, payment, intent.metadata);
    requireSafe(["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture", "processing", "succeeded", "canceled"].includes(intent.status));
    intentResumable = ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status);
    latestCharge = providerId(intent.latest_charge);
  }
  let url: string | null = null;
  if (intentResumable && session.status === "open" && session.payment_status === "unpaid" && session.url) {
    const parsed = new URL(session.url);
    requireSafe(parsed.protocol === "https:" && parsed.hostname === "checkout.stripe.com" && !parsed.username && !parsed.password && !parsed.port);
    url = session.url;
  }
  return { session, url, intentId, latestCharge };
}

/** Explicit recovery of a known provider ID, never a search by payer/unit/month.
 * This is also the normal post-create persistence boundary. A failed local write
 * leaves the original reservation intact; a repeat only verifies this same ID. */
export async function recoverDirectSession(prisma: PrismaClient, stripe: Stripe, checkoutId: string, sessionId: string, identity: StripePaymentIdentity) {
  requireSafe(await attemptAccess(checkoutId));
  const checkout = await prisma.checkoutSession.findUnique({ where: { id: checkoutId } }); requireSafe(checkout?.paymentId);
  const payment = await prisma.payment.findUnique({ where: { id: checkout!.paymentId! } }); requireSafe(payment);
  const observation = await observe(stripe, checkout!, payment!, identity, sessionId);
  const persisted = await prisma.$transaction(async tx => {
    requireSafe(await lockActiveCheckoutBusiness(tx, checkout!.businessId));
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${payment!.id} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CheckoutSession" WHERE "id" = ${checkoutId} FOR UPDATE`);
    const p = await tx.payment.findUnique({ where: { id: payment!.id } }), c = await tx.checkoutSession.findUnique({ where: { id: checkoutId } });
    requireSafe(p && c && await attemptAccess(checkoutId)); pair(c!, p!, identity);
    // Check every immutable fact again after provider awaits and row locks.
    requireSafe(isDeepStrictEqual(paymentFacts(p!), paymentFacts(payment!)) && isDeepStrictEqual(checkoutFacts(c!), checkoutFacts(checkout!)) &&
      (!p!.stripePaymentIntentId || p!.stripePaymentIntentId === observation.intentId) &&
      (!p!.stripeChargeId || p!.stripeChargeId === observation.latestCharge));
    if (p!.stripeCheckoutSessionId) { requireSafe(p!.stripeCheckoutSessionId === sessionId); return p!; }
    requireSafe(p!.status === "CREATED" && c!.status === "REVIEWED");
    const started = await tx.payment.update({ where: { id: p!.id }, data: { stripeCheckoutSessionId: sessionId, status: "CHECKOUT_STARTED", checkoutStartedAt: p!.checkoutStartedAt ?? new Date() } });
    await tx.checkoutSession.update({ where: { id: checkoutId }, data: { stripeCheckoutSessionId: sessionId, status: "CHECKOUT_STARTED" } });
    return started;
  }, TX);
  await grantPaymentResultAccess(sessionId, checkoutId);
  return { payment: persisted, url: observation.url, providerStatus: observation.session.status };
}

/** Authorized read-only receipt/resume observation. Provider success never
 * manufactures PAID, failure, receipts or reconciliation from a return URL. */
export async function getDirectResult(prisma: PrismaClient, stripe: Stripe, accountCode: string, sessionId: string, identity: StripePaymentIdentity) {
  if (!/^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId) || typeof accountCode !== "string") return null;
  const checkout = await prisma.checkoutSession.findUnique({ where: { stripeCheckoutSessionId: sessionId } });
  if (!checkout?.paymentId || checkout.accountCode !== accountCode ||
      !(await resultAccess(sessionId, checkout.id) || await attemptAccess(checkout.id))) return null;
  const payment = await prisma.payment.findUnique({ where: { id: checkout.paymentId } }); if (!payment) return null;
  const observation = await observe(stripe, checkout, payment, identity, sessionId);
  const current = await prisma.payment.findUnique({ where: { id: payment.id } }); if (!current) return null;
  const currentCheckout = await prisma.checkoutSession.findUnique({ where: { id: checkout.id } });
  if (!currentCheckout) return null;
  pair(currentCheckout, current, identity);
  requireSafe(currentCheckout.accountCode === accountCode && currentCheckout.stripeCheckoutSessionId === sessionId &&
    (!current.stripePaymentIntentId || current.stripePaymentIntentId === observation.intentId) &&
    (!current.stripeChargeId || current.stripeChargeId === observation.latestCharge));
  requireSafe(isDeepStrictEqual(paymentFacts(current), paymentFacts(payment)) && isDeepStrictEqual(checkoutFacts(currentCheckout), checkoutFacts(checkout)));
  const business = await prisma.business.findUnique({ where: { id: current.businessId } });
  requireSafe(business && business.accountCode === accountCode);
  const resumable = business!.isActive && business!.status !== "DISABLED" && ["CHECKOUT_STARTED", "CREATED", "FAILED", "EXPIRED"].includes(current.status) && !current.paidAt;
  return { accountCode, stripeSessionId: sessionId, payment: { business: { id: business!.id, name: business!.name, accountCode: business!.accountCode }, id: current.id, status: current.status, paymentMethod: current.paymentMethod,
    itemDescription: current.itemDescription, referenceLabel: current.referenceLabel, subtotalCents: current.subtotalCents,
    platformFeeCents: current.platformFeeCents, totalChargedCents: current.totalChargedCents, lineItemsSnapshot: current.lineItemsSnapshot,
    createdAt: current.createdAt, pendingAt: current.pendingAt, paidAt: current.paidAt, failedAt: current.failedAt, expiredAt: current.expiredAt,
    returnedAt: current.returnedAt, disputedAt: current.disputedAt, checkoutStartedAt: current.checkoutStartedAt },
    checkoutUrl: resumable ? observation.url : null, providerStatus: observation.session.status };
}

/** Only this function can create Stripe objects, and its gate is permanently
 * false. Future activation requires a reviewed code change, not configuration. */
export async function startDirectCheckout(prisma: PrismaClient, stripe: Stripe, checkoutId: string, report: DirectReadinessReport,
  identity: StripePaymentIdentity, origin: string) {
  if (!directPaymentCreationEnabled()) throw Error("Direct-charge creation is disabled.");
  const reserved = await reserveDirectAttempt(prisma, checkoutId, report, identity);
  if (reserved.kind === "existing") return getDirectResult(prisma, stripe, reserved.checkout.accountCode, reserved.payment.stripeCheckoutSessionId!, identity);
  if (reserved.kind !== "reserved") return reserved;
  const request = prepareDirectCheckoutRequest(reserved.checkout, reserved.payment, report, identity, origin, new Date());
  // A timeout leaves CREATED with the same key. Never mark failed or replace it.
  const session = await stripe.checkout.sessions.create(request.params, request.options);
  return recoverDirectSession(prisma, stripe, checkoutId, session.id, identity);
}
