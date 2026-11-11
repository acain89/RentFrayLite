import { PaymentStatus, Prisma } from "@prisma/client";
import type { CheckoutSession, Payment, PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { lockActiveCheckoutBusiness } from "@/lib/checkoutBusinessLock";
import { hasUnknownArchitecture, isLegacyCheckoutArchitecture, paymentMatchesCheckoutArchitecture, sameCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { assertCurrentCheckoutQuote, getCheckoutCalendar } from "@/lib/checkoutCalendar";
import { assertCheckoutSource, assertCustomPaymentQuote } from "@/lib/customPayment";

const STRIPE_READ_OPTIONS: Stripe.RequestOptions = { timeout: 5000, maxNetworkRetries: 0 };
const BLOCKED = "An existing payment cannot safely be replaced. Please try again or contact the business.";

type Reservation =
  | { kind: "create"; payment: Payment }
  | { kind: "resume"; payment: Payment; checkoutId: string; url: string }
  | { kind: "block"; error: string };
type Observation =
  | { kind: "uncollectible" }
  | { kind: "collectible"; checkout: CheckoutSession; url: string | null };

// A failed payment attempt is not proof that its hosted Checkout terminated.
// Linked failure/expiry records may only ask the existing Stripe authority to
// resume their original attempt; this predicate never authorizes collection.
export function isLinkedCheckoutResume(checkout: Pick<CheckoutSession, "status" | "paymentId" | "stripeCheckoutSessionId">): boolean {
  return !!checkout.paymentId && !!checkout.stripeCheckoutSessionId &&
    ["CHECKOUT_STARTED", "FAILED", "EXPIRED"].includes(checkout.status);
}

function usableCheckoutUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com" &&
      !url.username && !url.password && !url.port ? value : null;
  } catch { return null; }
}

function objectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

function requireVerified(condition: unknown): asserts condition {
  if (!condition) throw new Error("Existing checkout ownership or Stripe state could not be verified");
}

function validateMetadata(metadata: Stripe.Metadata | null, payment: Payment, checkout: CheckoutSession) {
  const expected: Record<string, string> = {
    product: "RentFrayLite", paymentId: payment.id, checkoutSessionId: checkout.id,
    businessId: payment.businessId, accountCode: checkout.accountCode, billingCycle: checkout.billingCycle ?? "",
  };
  for (const [key, value] of Object.entries(expected)) {
    requireVerified(metadata?.[key] === undefined || metadata[key] === value);
  }
  if (checkout.sourceType === "CUSTOM_PAYMENT") requireVerified(metadata?.sourceType === "CUSTOM_PAYMENT");
  else requireVerified(metadata?.sourceType === undefined || metadata.sourceType === "RECURRING_PLAN");
}

// Reconcile only the payment owned by this checkout. Another checkout, even
// with identical payer/unit/month details, is always an independent attempt.
async function observeAttempt(
  tx: Prisma.TransactionClient, stripe: Stripe, payment: Payment,
  accountCode: string
): Promise<Observation> {
  requireVerified(payment.stripeCheckoutSessionId);
  const checkout = await tx.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId: payment.stripeCheckoutSessionId },
  });
  requireVerified(checkout && checkout.paymentId === payment.id &&
    checkout.sourceType === payment.sourceType &&
    checkout.businessId === payment.businessId && checkout.accountCode === accountCode &&
    checkout.planId === payment.sourceId && checkout.billingCycle === payment.billingCycle &&
    checkout.unitNumber === payment.referenceLabel && checkout.paymentMethod === payment.paymentMethod &&
    checkout.totalCents === payment.totalChargedCents && checkout.platformFeeCents === payment.platformFeeCents &&
    checkout.subtotalCents === payment.subtotalCents && payment.businessProceedsCents === payment.subtotalCents &&
    paymentMatchesCheckoutArchitecture(payment, checkout));
  // Unknown historical ownership cannot be substituted from today's business
  // connection. Such payments stay readable/webhook-settleable, but cannot be
  // resumed/replaced without independently established historical facts.
  requireVerified(!hasUnknownArchitecture(payment));
  const ownedDestination = payment.stripeConnectedAccountId;
  const session = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId, {}, STRIPE_READ_OPTIONS);
  requireVerified(session.id === payment.stripeCheckoutSessionId && session.mode === "payment" &&
    (!session.client_reference_id || session.client_reference_id === payment.id) &&
    session.currency === "usd" && session.amount_total === payment.totalChargedCents &&
    ["open", "complete", "expired"].includes(session.status ?? ""));
  validateMetadata(session.metadata, payment, checkout);
  const expectedMethod = payment.paymentMethod === "ACH" ? "us_bank_account" : "card";
  requireVerified(session.payment_method_types?.length === 1 && session.payment_method_types[0] === expectedMethod);
  const intentId = objectId(session.payment_intent);
  requireVerified(session.payment_intent === null || intentId);
  requireVerified(!payment.stripePaymentIntentId || payment.stripePaymentIntentId === intentId);
  requireVerified(intentId || !payment.stripeChargeId);
  let canceled = false;
  let resumableIntent = true;
  if (intentId) {
    const intent = await stripe.paymentIntents.retrieve(intentId, {}, STRIPE_READ_OPTIONS);
    requireVerified(intent.id === intentId && intent.currency === "usd" &&
      intent.amount === payment.totalChargedCents && intent.application_fee_amount === payment.platformFeeCents &&
      objectId(intent.transfer_data?.destination) === ownedDestination);
    validateMetadata(intent.metadata, payment, checkout);
    canceled = intent.status === "canceled" && intent.amount_received === 0;
    resumableIntent = ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status) &&
      intent.amount_received === 0;
  }
  // A processing/retryable intent can settle after Checkout closes. Never
  // create another hosted session for this attempt, even after expiration.
  const closed = session.status === "expired" || session.status === "complete";
  if (closed && session.payment_status === "unpaid" && !session.after_expiration?.recovery?.enabled &&
    (canceled || (session.status === "expired" && !intentId))) {
    return { kind: "uncollectible" };
  }
  return {
    kind: "collectible", checkout,
    url: session.status === "open" && session.payment_status === "unpaid" && resumableIntent && !canceled ? usableCheckoutUrl(session.url) : null,
  };
}

function sameSnapshot(left: Prisma.JsonValue, right: Prisma.JsonValue): boolean {
  // PostgreSQL JSONB does not preserve object key order. Compare the immutable
  // customer-facing fields rather than serializing entire objects.
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return item !== null && typeof item === "object" && !Array.isArray(item) &&
      other !== null && typeof other === "object" && !Array.isArray(other) &&
      item.type === other.type && item.label === other.label && item.amountCents === other.amountCents;
  });
}

function canResume(payment: Payment, original: CheckoutSession, request: CheckoutSession): boolean {
  return payment.payerFirstName === request.firstName && payment.payerLastName === request.lastName &&
    payment.payerPhone === request.phone && payment.paymentMethod === request.paymentMethod &&
    payment.subtotalCents === request.subtotalCents && payment.platformFeeCents === request.platformFeeCents &&
    payment.totalChargedCents === request.totalCents && sameSnapshot(payment.lineItemsSnapshot, request.lineItems) &&
    original.firstName === request.firstName && original.lastName === request.lastName && original.phone === request.phone &&
    sameCheckoutArchitecture(original, request) && paymentMatchesCheckoutArchitecture(payment, request);
}

export async function reserveCheckoutAttempt(
  prisma: PrismaClient, stripe: Stripe, request: CheckoutSession, businessName: string,
  resumeAccess: (stripeSessionId: string, checkoutId: string) => Promise<boolean> = async () => false,
  quoteAccess: (checkoutId: string) => Promise<boolean> = async () => false
): Promise<Reservation> {
  return prisma.$transaction(async (tx): Promise<Reservation> => {
    const lockedBusiness = await lockActiveCheckoutBusiness(tx, request.businessId);
    if (!lockedBusiness) {
      return { kind: "block", error: "This business is no longer accepting payments." };
    }
    assertCheckoutSource(request);
    if (request.sourceType === "RECURRING_PLAN") getCheckoutCalendar(lockedBusiness, new Date());
    // Business serializes initial reservation; the checkout row is its durable
    // identity. Payment first agrees with webhook/lifecycle lock ordering.
    const initial = await tx.checkoutSession.findUnique({ where: { id: request.id } });
    if (initial?.paymentId) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${initial.paymentId} FOR UPDATE`);
    }
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CheckoutSession" WHERE "id" = ${request.id} FOR UPDATE`);
    const current = await tx.checkoutSession.findUnique({ where: { id: request.id } });
    if (current) assertCheckoutSource(current);
    const linkedResume = current && isLinkedCheckoutResume(current);
    if (!current || (!["REVIEWED", "CHECKOUT_STARTED"].includes(current.status) && !linkedResume) ||
      (current.expiresAt <= new Date() && !linkedResume)) {
      return { kind: "block", error: "Checkout session is no longer available." };
    }
    // A cancellation return is resume-only and must belong to the browser that
    // received the original signed result binding. Query IDs alone do not grant access.
    if (current.status !== "REVIEWED" &&
      (!current.paymentId || !current.stripeCheckoutSessionId ||
       !await resumeAccess(current.stripeCheckoutSessionId, current.id))) {
      return { kind: "block", error: BLOCKED };
    }
    requireVerified(current.sourceType === request.sourceType && current.businessId === request.businessId && current.planId === request.planId &&
      current.billingCycle === request.billingCycle && current.unitNumber === request.unitNumber &&
      current.accountCode === request.accountCode && current.paymentMethod === request.paymentMethod &&
      current.firstName === request.firstName && current.lastName === request.lastName && current.phone === request.phone &&
      current.subtotalCents === request.subtotalCents && current.platformFeeCents === request.platformFeeCents &&
      current.totalCents === request.totalCents && sameSnapshot(current.lineItems, request.lineItems) &&
      sameCheckoutArchitecture(current, request));
    if (current.paymentId) {
      const payment = await tx.payment.findUnique({ where: { id: current.paymentId } });
      requireVerified(payment && payment.businessId === current.businessId &&
        payment.sourceType === current.sourceType &&
        (!payment.checkoutAttemptId || payment.checkoutAttemptId === current.id) &&
        canResume(payment, current, current));
      if (payment.paidAt || [PaymentStatus.PAID, PaymentStatus.PENDING, PaymentStatus.DISPUTED, PaymentStatus.RETURNED]
        .includes(payment.status as "PAID" | "PENDING" | "DISPUTED" | "RETURNED")) {
        return { kind: "block", error: "This checkout already has a settled, processing, or disputed payment." };
      }
      // Missing IDs may represent an in-flight create or an ambiguous network
      // failure after Stripe created the session. Never expire these by age.
      if (!payment.stripeCheckoutSessionId) return { kind: "block", error: BLOCKED };
      const observation = await observeAttempt(tx, stripe, payment, current.accountCode);
      if (observation.kind === "collectible" && observation.checkout.id === current.id && observation.url &&
        canResume(payment, observation.checkout, current) &&
        await resumeAccess(payment.stripeCheckoutSessionId, current.id)) {
        return { kind: "resume", payment, checkoutId: current.id, url: observation.url };
      }
      return { kind: "block", error: BLOCKED };
    }
    // A linked checkout must use its original Payment, never bind another one.
    if (current.paymentId || current.status === "CHECKOUT_STARTED" || current.stripeCheckoutSessionId) return { kind: "block", error: "Please begin a new payment checkout." };
    // An unstarted pre-Phase-2 checkout has no provable pricing version. Ask for
    // a fresh snapshot rather than backfilling history or inventing ownership.
    if (!isLegacyCheckoutArchitecture(current)) return { kind: "block", error: "Please begin a new payment checkout." };
    // A lost/mismatched local pointer must never produce another Payment.
    if (await tx.payment.findUnique({ where: { checkoutAttemptId: current.id } })) return { kind: "block", error: BLOCKED };
    // Last decision before reserving a new immutable Payment. Management writers
    // share the Business lock. A stale quote rolls back, rather than repricing it.
    if (current.sourceType === "CUSTOM_PAYMENT") assertCustomPaymentQuote(current);
    else await assertCurrentCheckoutQuote(tx, lockedBusiness, current, new Date());
    if (!await quoteAccess(current.id)) return { kind: "block", error: "Checkout authorization unavailable. Please begin again." };
    const payment = await tx.payment.create({
      data: {
        checkoutAttemptId: current.id,
        businessId: request.businessId, sourceType: current.sourceType, sourceId: request.planId,
        status: PaymentStatus.CREATED, paymentMethod: request.paymentMethod,
        payerFirstName: request.firstName, payerLastName: request.lastName, payerPhone: request.phone,
        referenceLabel: request.unitNumber, itemDescription: `${businessName} ${current.sourceType === "CUSTOM_PAYMENT" ? "Custom Payment" : "payment"}`,
        lineItemsSnapshot: request.lineItems as Prisma.InputJsonValue,
        subtotalCents: request.subtotalCents, platformFeeCents: request.platformFeeCents,
        totalChargedCents: request.totalCents, businessProceedsCents: request.subtotalCents, billingCycle: request.billingCycle,
        pricingVersion: current.pricingVersion, chargeModel: current.chargeModel,
        stripeConnectedAccountId: current.stripeConnectedAccountId,
        expectedStripeProcessingFeeCents: current.expectedStripeProcessingFeeCents,
        rflApplicationFeeCents: current.rflApplicationFeeCents,
      },
    });
    await tx.checkoutSession.update({ where: { id: request.id }, data: { paymentId: payment.id } });
    return { kind: "create", payment };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
}
