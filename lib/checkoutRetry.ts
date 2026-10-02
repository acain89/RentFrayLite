import { PaymentSourceType, PaymentStatus, Prisma } from "@prisma/client";
import type { CheckoutSession, Payment, PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { canApplyStripePaymentState } from "@/lib/paymentStatus";
import { lockActiveCheckoutBusiness } from "@/lib/checkoutBusinessLock";

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
    businessId: payment.businessId, accountCode: checkout.accountCode, billingCycle: checkout.billingCycle,
  };
  for (const [key, value] of Object.entries(expected)) {
    requireVerified(metadata?.[key] === undefined || metadata[key] === value);
  }
}

// Only immutable Stripe terminal evidence releases an obligation. Local FAILED
// or EXPIRED, a decline, and the age of a reservation are never sufficient.
async function observeAttempt(
  tx: Prisma.TransactionClient, stripe: Stripe, payment: Payment,
  accountCode: string, destination: string
): Promise<Observation> {
  requireVerified(payment.stripeCheckoutSessionId);
  const checkout = await tx.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId: payment.stripeCheckoutSessionId },
  });
  requireVerified(checkout && checkout.paymentId === payment.id &&
    checkout.businessId === payment.businessId && checkout.accountCode === accountCode &&
    checkout.planId === payment.sourceId && checkout.billingCycle === payment.billingCycle &&
    checkout.unitNumber === payment.referenceLabel && checkout.paymentMethod === payment.paymentMethod &&
    checkout.totalCents === payment.totalChargedCents && checkout.platformFeeCents === payment.platformFeeCents &&
    checkout.subtotalCents === payment.subtotalCents && payment.businessProceedsCents === payment.subtotalCents);
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
      objectId(intent.transfer_data?.destination) === destination);
    validateMetadata(intent.metadata, payment, checkout);
    canceled = intent.status === "canceled" && intent.amount_received === 0;
    resumableIntent = ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status) &&
      intent.amount_received === 0;
  }
  // Recovery can create a copy even after expiration, so it cannot release the
  // obligation. A processing/retryable intent can settle after Checkout closes.
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
    original.firstName === request.firstName && original.lastName === request.lastName && original.phone === request.phone;
}

export async function reserveCheckoutAttempt(
  prisma: PrismaClient, stripe: Stripe, request: CheckoutSession, businessName: string, destination: string,
  resumeAccess: (stripeSessionId: string, checkoutId: string) => Promise<boolean> = async () => false
): Promise<Reservation> {
  return prisma.$transaction(async (tx): Promise<Reservation> => {
    if (!await lockActiveCheckoutBusiness(tx, request.businessId)) {
      return { kind: "block", error: "This business is no longer accepting payments." };
    }
    // Serialize the entire inspect/reserve decision, including when no rows yet
    // exist. Hash collisions only serialize unrelated obligations unnecessarily.
    const obligation = JSON.stringify([request.businessId, request.planId, request.billingCycle, request.unitNumber]);
    await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${obligation}, 0))`);
    // Share Payment row locks with webhook reconciliation and reread afterwards.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment"
      WHERE "businessId" = ${request.businessId} AND "sourceType" = 'RECURRING_PLAN'::"PaymentSourceType"
        AND "sourceId" = ${request.planId} AND "billingCycle" = ${request.billingCycle}
        AND "referenceLabel" = ${request.unitNumber} ORDER BY "id" FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CheckoutSession" WHERE "id" = ${request.id} FOR UPDATE`);
    const current = await tx.checkoutSession.findUnique({ where: { id: request.id } });
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
    requireVerified(current.businessId === request.businessId && current.planId === request.planId &&
      current.billingCycle === request.billingCycle && current.unitNumber === request.unitNumber &&
      current.accountCode === request.accountCode && current.paymentMethod === request.paymentMethod &&
      current.firstName === request.firstName && current.lastName === request.lastName && current.phone === request.phone &&
      current.subtotalCents === request.subtotalCents && current.platformFeeCents === request.platformFeeCents &&
      current.totalCents === request.totalCents && sameSnapshot(current.lineItems, request.lineItems));
    const payments = await tx.payment.findMany({
      where: {
        businessId: request.businessId, sourceType: PaymentSourceType.RECURRING_PLAN,
        sourceId: request.planId, billingCycle: request.billingCycle, referenceLabel: request.unitNumber,
      }, orderBy: { id: "asc" },
    });
    // Scan ALL history, not just the newest record or statuses in the index.
    const collectible: { payment: Payment; observation: Extract<Observation, { kind: "collectible" }> }[] = [];
    const expired: Payment[] = [];
    for (const payment of payments) {
      if (payment.paidAt || [PaymentStatus.PAID, PaymentStatus.PENDING, PaymentStatus.DISPUTED, PaymentStatus.RETURNED]
        .includes(payment.status as "PAID" | "PENDING" | "DISPUTED" | "RETURNED")) {
        return { kind: "block", error: "This billing cycle already has a settled, processing, or disputed payment." };
      }
      // Missing IDs may represent an in-flight create or an ambiguous network
      // failure after Stripe created the session. Never expire these by age.
      if (!payment.stripeCheckoutSessionId) return { kind: "block", error: BLOCKED };
      const observation = await observeAttempt(tx, stripe, payment, request.accountCode, destination);
      if (observation.kind === "collectible") collectible.push({ payment, observation });
      else if (canApplyStripePaymentState(payment.status, PaymentStatus.EXPIRED, { settled: false, disputeResolved: false })) expired.push(payment);
    }
    if (collectible.length) {
      const attempt = collectible[0];
      if (collectible.length === 1 && !expired.length && attempt.observation.url &&
        (!current.paymentId || current.paymentId === attempt.payment.id) &&
        (current.status === "REVIEWED" ||
          (current.id === attempt.observation.checkout.id &&
           current.stripeCheckoutSessionId === attempt.payment.stripeCheckoutSessionId)) &&
        canResume(attempt.payment, attempt.observation.checkout, current) &&
        await resumeAccess(attempt.payment.stripeCheckoutSessionId!, attempt.observation.checkout.id)) {
        return { kind: "resume", payment: attempt.payment, checkoutId: attempt.observation.checkout.id, url: attempt.observation.url };
      }
      return { kind: "block", error: BLOCKED };
    }
    // A linked checkout must use its original Payment, never bind another one.
    if (current.paymentId || current.status === "CHECKOUT_STARTED" || current.stripeCheckoutSessionId) return { kind: "block", error: "Please begin a new payment checkout." };
    for (const payment of expired) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.EXPIRED, expiredAt: new Date() } });
    }
    const payment = await tx.payment.create({
      data: {
        businessId: request.businessId, sourceType: PaymentSourceType.RECURRING_PLAN, sourceId: request.planId,
        status: PaymentStatus.CREATED, paymentMethod: request.paymentMethod,
        payerFirstName: request.firstName, payerLastName: request.lastName, payerPhone: request.phone,
        referenceLabel: request.unitNumber, itemDescription: `${businessName} payment`,
        lineItemsSnapshot: request.lineItems as Prisma.InputJsonValue,
        subtotalCents: request.subtotalCents, platformFeeCents: request.platformFeeCents,
        totalChargedCents: request.totalCents, businessProceedsCents: request.subtotalCents, billingCycle: request.billingCycle,
      },
    });
    await tx.checkoutSession.update({ where: { id: request.id }, data: { paymentId: payment.id } });
    return { kind: "create", payment };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
}
