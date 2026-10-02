import { CheckoutSessionStatus, PaymentMethod, PaymentStatus, Prisma, SmsReceiptStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { canApplyStripePaymentState } from "@/lib/paymentStatus";

const CHECKOUT_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
]);
const INTENT_EVENTS = new Set([
  "payment_intent.processing", "payment_intent.succeeded",
  "payment_intent.payment_failed", "payment_intent.canceled",
]);
const DISPUTE_EVENTS = new Set([
  "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
]);
const BANK_RETURN_REASONS = new Set(["insufficient_funds", "incorrect_account_details", "bank_cannot_process"]);
// Bound read time while holding a DB lock. Stripe retries the webhook if a
// read fails; internal HTTP retries must not outlive this transaction.
const STRIPE_READ_OPTIONS: Stripe.RequestOptions = { timeout: 5000, maxNetworkRetries: 0 };

class OwnershipMismatch extends Error {}
function requireOwnership(condition: unknown, message: string): asserts condition {
  if (!condition) throw new OwnershipMismatch(message);
}

function objectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

type Notification = {
  kind: "checkout" | "intent" | "dispute";
  checkoutId: string | null;
  intentId: string | null;
  chargeId: string | null;
  disputeId: string | null;
  metadata: Stripe.Metadata | null;
};

function notification(event: Stripe.Event): Notification | null {
  if (CHECKOUT_EVENTS.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    requireOwnership(session.object === "checkout.session" && session.id.startsWith("cs_"), "Invalid Checkout object");
    return { kind: "checkout", checkoutId: session.id, intentId: objectId(session.payment_intent), chargeId: null, disputeId: null, metadata: session.metadata };
  }
  if (INTENT_EVENTS.has(event.type)) {
    const intent = event.data.object as Stripe.PaymentIntent;
    requireOwnership(intent.object === "payment_intent" && intent.id.startsWith("pi_"), "Invalid PaymentIntent object");
    return { kind: "intent", checkoutId: null, intentId: intent.id, chargeId: objectId(intent.latest_charge), disputeId: null, metadata: intent.metadata };
  }
  if (DISPUTE_EVENTS.has(event.type)) {
    const dispute = event.data.object as Stripe.Dispute;
    requireOwnership(dispute.object === "dispute" && dispute.id.startsWith("dp_"), "Invalid Dispute object");
    return { kind: "dispute", checkoutId: null, intentId: objectId(dispute.payment_intent), chargeId: objectId(dispute.charge), disputeId: dispute.id, metadata: null };
  }
  return null;
}

// Metadata only finds a candidate. It never authorizes binding an unknown
// PaymentIntent: the stored Checkout must independently reference that intent.
async function candidatePaymentId(note: Notification): Promise<string | null> {
  const candidates = new Set<string>();
  for (const [field, value] of [
    ["stripeCheckoutSessionId", note.checkoutId],
    ["stripePaymentIntentId", note.intentId],
    ["stripeChargeId", note.chargeId],
  ] as const) {
    if (!value) continue;
    const where: Prisma.PaymentWhereUniqueInput = field === "stripeCheckoutSessionId"
      ? { stripeCheckoutSessionId: value }
      : field === "stripePaymentIntentId" ? { stripePaymentIntentId: value } : { stripeChargeId: value };
    const payment = await prisma.payment.findUnique({ where, select: { id: true } });
    if (payment) candidates.add(payment.id);
  }
  const metadataPaymentId = note.metadata?.paymentId?.trim();
  if (metadataPaymentId) {
    const payment = await prisma.payment.findUnique({ where: { id: metadataPaymentId }, select: { id: true } });
    requireOwnership(!candidates.size || (payment && candidates.has(payment.id)), "Metadata conflicts with stored Stripe ownership");
    if (payment) candidates.add(payment.id);
  }
  requireOwnership(candidates.size <= 1, "Stripe identifiers resolve to different payments");
  return [...candidates][0] ?? null;
}

type OwnedPayment = Prisma.PaymentGetPayload<{
  include: { business: { include: { stripeConnection: true } } };
}>;
type OwnedCheckout = Prisma.CheckoutSessionGetPayload<Record<string, never>>;

function validateMetadata(metadata: Stripe.Metadata | null, payment: OwnedPayment, checkout: OwnedCheckout) {
  const expected: Record<string, string> = {
    product: "RentFrayLite", paymentId: payment.id, checkoutSessionId: checkout.id,
    businessId: payment.businessId, accountCode: checkout.accountCode, billingCycle: checkout.billingCycle,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (metadata?.[key] !== undefined) requireOwnership(metadata[key] === value, "Stripe metadata ownership conflict");
  }
}

async function observeStripe(
  stripe: Stripe, note: Notification, payment: OwnedPayment, checkout: OwnedCheckout
) {
  const session = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId!, {}, STRIPE_READ_OPTIONS);
  requireOwnership(session.id === payment.stripeCheckoutSessionId && session.mode === "payment", "Wrong Stripe Checkout");
  requireOwnership(!note.checkoutId || note.checkoutId === session.id, "Stale Checkout identifier");
  requireOwnership(!session.client_reference_id || session.client_reference_id === payment.id, "Wrong Checkout reference");
  validateMetadata(session.metadata, payment, checkout);
  validateMetadata(note.metadata, payment, checkout);
  requireOwnership(session.currency === "usd" && session.amount_total === payment.totalChargedCents, "Checkout amount does not match its stored payment");

  const intentId = objectId(session.payment_intent);
  requireOwnership(!note.intentId || note.intentId === intentId, "Checkout does not own the event PaymentIntent");
  requireOwnership(!payment.stripePaymentIntentId || payment.stripePaymentIntentId === intentId, "Stored PaymentIntent conflict");
  if (!intentId) {
    requireOwnership(note.kind === "checkout", "Missing parent PaymentIntent");
    return {
      status: session.status === "expired" ? PaymentStatus.EXPIRED : null,
      settled: false, disputeResolved: false, intentId: null, chargeId: null,
      failureCode: null, failureMessage: null,
    };
  }

  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] }, STRIPE_READ_OPTIONS);
  requireOwnership(intent.id === intentId && intent.currency === "usd" &&
    intent.amount === payment.totalChargedCents &&
    intent.application_fee_amount === payment.platformFeeCents &&
    objectId(intent.transfer_data?.destination) === payment.business.stripeConnection?.stripeAccountId,
  "PaymentIntent amount or destination ownership conflict");
  validateMetadata(intent.metadata, payment, checkout);

  const chargeId = objectId(intent.latest_charge);
  const charge = chargeId
    ? typeof intent.latest_charge === "object"
      ? intent.latest_charge
      : await stripe.charges.retrieve(chargeId, {}, STRIPE_READ_OPTIONS)
    : null;
  if (charge) {
    requireOwnership(charge.id === chargeId && objectId(charge.payment_intent) === intentId &&
      charge.currency === "usd" && charge.amount === payment.totalChargedCents,
    "Charge does not belong to the current PaymentIntent");
    requireOwnership(charge.payment_method_details?.type === (payment.paymentMethod === PaymentMethod.ACH ? "us_bank_account" : "card"),
      "Charge payment method conflict");
  }
  if (payment.paidAt || [PaymentStatus.PAID, PaymentStatus.DISPUTED, PaymentStatus.RETURNED].includes(payment.status as "PAID" | "DISPUTED" | "RETURNED")) {
    requireOwnership(!payment.stripeChargeId || payment.stripeChargeId === chargeId, "Settled charge identity changed");
  }
  requireOwnership(note.kind !== "dispute" || (chargeId && note.chargeId === chargeId), "Dispute is for a different charge");

  const settled = intent.status === "succeeded" && charge?.status === "succeeded" && charge.paid;
  requireOwnership(intent.status !== "succeeded" || settled, "Settlement lacks a successful owned charge");
  requireOwnership(!settled || intent.amount_received === payment.totalChargedCents, "Settlement did not receive the full stored customer total");
  let disputes: Stripe.Dispute[] = [];
  if (chargeId && (charge?.disputed || note.kind === "dispute" || payment.status === PaymentStatus.DISPUTED || payment.status === PaymentStatus.RETURNED)) {
    const list = await stripe.disputes.list({ charge: chargeId, limit: 100 }, STRIPE_READ_OPTIONS);
    if (list.has_more) throw new Error("Dispute history exceeds the reconciliation limit");
    disputes = list.data;
    for (const dispute of disputes) {
      requireOwnership(objectId(dispute.charge) === chargeId && objectId(dispute.payment_intent) === intentId, "Dispute ownership conflict");
    }
    requireOwnership(!note.disputeId || disputes.some((dispute) => dispute.id === note.disputeId), "Unknown dispute");
    if (charge?.disputed && disputes.length === 0) throw new Error("Disputed charge has no available dispute history");
  }
  const active = disputes.filter((dispute) => !["won", "warning_closed", "prevented"].includes(dispute.status));
  const bankReturn = active.find((dispute) => payment.paymentMethod === PaymentMethod.ACH &&
    !dispute.status.startsWith("warning_") && BANK_RETURN_REASONS.has(dispute.reason));
  const disputeResolved = disputes.some((dispute) => ["won", "warning_closed", "prevented"].includes(dispute.status)) && active.length === 0;
  const status = bankReturn ? PaymentStatus.RETURNED
    : active.length ? PaymentStatus.DISPUTED
    : settled ? PaymentStatus.PAID
    : intent.status === "processing" ? PaymentStatus.PENDING
    : session.status === "expired" ? PaymentStatus.EXPIRED
    : intent.status === "canceled" || (intent.status === "requires_payment_method" && intent.last_payment_error)
      ? PaymentStatus.FAILED : null;
  return {
    status, settled: Boolean(settled), disputeResolved, intentId, chargeId,
    failureCode: bankReturn?.reason ?? intent.last_payment_error?.code ?? intent.last_payment_error?.decline_code ?? null,
    failureMessage: bankReturn ? "The bank returned this payment." : intent.last_payment_error?.message ?? null,
  };
}

export async function processStripePaymentEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  // Destination charges are created on the platform. Connected-account events
  // cannot authorize mutations of these platform-owned payment objects.
  if (event.account) return;
  try {
    const note = notification(event);
    if (!note) return;
    const paymentId = await candidatePaymentId(note);
    if (!paymentId) return;

    await prisma.$transaction(async (tx) => {
      // Parameterized PostgreSQL row lock; reread only AFTER acquiring it.
      // Every webhook writer and its durable event marker share this lock.
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`);
      const payment = await tx.payment.findUnique({
        where: { id: paymentId }, include: { business: { include: { stripeConnection: true } } },
      });
      if (!payment) return;
      const duplicate = await tx.auditLog.findFirst({
        where: {
          actorType: "STRIPE_WEBHOOK", targetType: "PAYMENT", targetId: payment.id,
          metadata: { path: ["stripeEventId"], equals: event.id },
        }, select: { id: true },
      });
      if (duplicate) return;
      // A webhook can beat checkout-start's persistence transaction. Retry it;
      // do not bind Stripe objects on the strength of metadata alone.
      if (!payment.stripeCheckoutSessionId) throw new Error("Checkout ownership is not yet persisted");
      const checkout = await tx.checkoutSession.findUnique({
        where: { stripeCheckoutSessionId: payment.stripeCheckoutSessionId },
      });
      requireOwnership(checkout && checkout.paymentId === payment.id &&
        checkout.businessId === payment.businessId && payment.business.id === payment.businessId &&
        checkout.accountCode === payment.business.accountCode &&
        checkout.totalCents === payment.totalChargedCents && checkout.platformFeeCents === payment.platformFeeCents &&
        checkout.paymentMethod === payment.paymentMethod && payment.business.stripeConnection,
      "RFL checkout/payment ownership conflict");
      const observed = await observeStripe(stripe, note, payment, checkout);
      const transition = observed.status !== null && canApplyStripePaymentState(payment.status, observed.status, observed);
      const now = new Date();
      const data: Prisma.PaymentUpdateManyMutationInput = {
        stripePaymentIntentId: observed.intentId,
        stripeChargeId: observed.chargeId,
      };
      if (transition) {
        data.status = observed.status!;
        switch (observed.status) {
          case PaymentStatus.PENDING: data.pendingAt = payment.pendingAt ?? now; break;
          case PaymentStatus.PAID:
            data.paidAt = payment.paidAt ?? now;
            data.failureCode = null; data.failureMessage = null;
            break;
          case PaymentStatus.FAILED:
            data.failedAt = payment.failedAt ?? now;
            data.failureCode = observed.failureCode; data.failureMessage = observed.failureMessage;
            break;
          case PaymentStatus.EXPIRED: data.expiredAt = payment.expiredAt ?? now; break;
          case PaymentStatus.RETURNED:
            data.returnedAt = payment.returnedAt ?? now;
            data.failureCode = observed.failureCode; data.failureMessage = observed.failureMessage;
            break;
          case PaymentStatus.DISPUTED: data.disputedAt = payment.disputedAt ?? now; break;
        }
      }
      if (transition || payment.stripePaymentIntentId !== observed.intentId || payment.stripeChargeId !== observed.chargeId) {
        const updated = await tx.payment.updateMany({
          where: {
            id: payment.id, status: payment.status, stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
            stripePaymentIntentId: payment.stripePaymentIntentId, stripeChargeId: payment.stripeChargeId,
          }, data,
        });
        if (updated.count !== 1) throw new Error("Payment changed during webhook reconciliation");
      }
      if (transition) {
        const checkoutStatus = observed.settled ? CheckoutSessionStatus.PAID
          : observed.status === PaymentStatus.FAILED ? CheckoutSessionStatus.FAILED
          : observed.status === PaymentStatus.EXPIRED ? CheckoutSessionStatus.EXPIRED
          : CheckoutSessionStatus.CHECKOUT_STARTED;
        const updatedCheckout = await tx.checkoutSession.updateMany({
          where: { id: checkout.id, paymentId: payment.id, businessId: payment.businessId, stripeCheckoutSessionId: payment.stripeCheckoutSessionId },
          data: { status: checkoutStatus },
        });
        if (updatedCheckout.count !== 1) throw new Error("Checkout ownership changed during reconciliation");
        if (observed.status === PaymentStatus.PAID) {
          await tx.smsReceipt.upsert({
            where: { paymentId: payment.id },
            create: { paymentId: payment.id, phone: payment.payerPhone, status: SmsReceiptStatus.QUEUED },
            update: {},
          });
        }
      }
      // Existing indexed audit storage is the durable per-payment event ledger.
      // No timestamp ordering: Stripe event timestamps have only second precision.
      await tx.auditLog.create({
        data: {
          businessId: payment.businessId, actorType: "STRIPE_WEBHOOK",
          action: transition ? `PAYMENT_${observed.status}` : "STRIPE_EVENT_RECONCILED",
          targetType: "PAYMENT", targetId: payment.id,
          summary: transition ? `Stripe payment state changed to ${observed.status}.` : "Stripe event reconciled without a payment status change.",
          metadata: {
            stripeEventId: event.id, stripeEventType: event.type,
            previousStatus: payment.status, observedStatus: observed.status, applied: transition,
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
  } catch (error) {
    if (!(error instanceof OwnershipMismatch)) throw error;
    console.warn("Stripe payment event rejected because ownership could not be verified.", { stripeEventId: event.id, reason: error.message });
  }
}
