import { queuePaymentSms } from "@/lib/smsNotifications";
import { isCustomerRefundEvent, processCustomerRefundEvent } from "@/lib/customerRefundObservation";
import { queueDirectReconciliation, queueDirectFinancialEvent, DIRECT_FINANCIAL_EVENTS } from "@/lib/directFinancialReconciliation";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { CheckoutSessionStatus, PaymentMethod, PaymentStatus, Prisma, SmsReceiptStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { canApplyStripePaymentState } from "@/lib/paymentStatus";
import { assertCheckoutSource } from "@/lib/customPayment";
import { hasUnknownArchitecture, paymentMatchesCheckoutArchitecture, directPaymentMatchesCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { classifyStripeCredentialMode, resolveStripePaymentContext, matchesStripePaymentEventContext, stripePaymentRequestOptions, validateStripePaymentIdentity } from "@/lib/stripePaymentContext";

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
  "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated",
]);
const BANK_RETURN_REASONS = new Set(["insufficient_funds", "incorrect_account_details", "bank_cannot_process"]);
// Bounded provider reads happen outside write transactions.
const STRIPE_READ_OPTIONS: Stripe.RequestOptions = { timeout: 5000, maxNetworkRetries: 0 };

class OwnershipMismatch extends Error {}
class ProcessingFailure extends Error { constructor(public readonly classification: string) { super(classification); } }
function requireOwnership(condition: unknown, message: string): asserts condition {
  if (!condition) throw new OwnershipMismatch(message);
}

function objectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

type Notification = {
  kind: "checkout" | "intent" | "dispute" | "charge";
  checkoutId: string | null;
  intentId: string | null;
  chargeId: string | null;
  disputeId: string | null;
  metadata: Stripe.Metadata | null;
};

function notification(event: Stripe.Event): Notification | null {
  if (CHECKOUT_EVENTS.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    requireOwnership(session.object === "checkout.session" && typeof session.id === "string" && session.id.startsWith("cs_"), "Invalid Checkout object");
    return { kind: "checkout", checkoutId: session.id, intentId: objectId(session.payment_intent), chargeId: null, disputeId: null, metadata: session.metadata };
  }
  if (INTENT_EVENTS.has(event.type)) {
    const intent = event.data.object as Stripe.PaymentIntent;
    requireOwnership(intent.object === "payment_intent" && typeof intent.id === "string" && intent.id.startsWith("pi_"), "Invalid PaymentIntent object");
    return { kind: "intent", checkoutId: null, intentId: intent.id, chargeId: objectId(intent.latest_charge), disputeId: null, metadata: intent.metadata };
  }
  if (DISPUTE_EVENTS.has(event.type)) {
    const dispute = event.data.object as Stripe.Dispute;
    requireOwnership(dispute.object === "dispute" && typeof dispute.id === "string" && dispute.id.startsWith("dp_"), "Invalid Dispute object");
    return { kind: "dispute", checkoutId: null, intentId: objectId(dispute.payment_intent), chargeId: objectId(dispute.charge), disputeId: dispute.id, metadata: null };
  }
  if (["charge.succeeded", "charge.failed", "charge.updated"].includes(event.type)) {
    const charge = event.data.object as Stripe.Charge;
    requireOwnership(charge.object === "charge" && typeof charge.id === "string" && charge.id.startsWith("ch_"), "Invalid Charge object");
    return { kind: "charge", checkoutId: null, intentId: objectId(charge.payment_intent), chargeId: charge.id, disputeId: null, metadata: charge.metadata };
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
    businessId: payment.businessId, accountCode: checkout.accountCode, billingCycle: checkout.billingCycle ?? "",
  };
  if (payment.chargeModel === "DIRECT") Object.assign(expected, { checkoutAttemptId: checkout.id, sourceType: checkout.sourceType, chargeModel: "DIRECT", pricingVersion: payment.pricingVersion, stripePlatformAccountId: payment.stripePlatformAccountId, stripeConnectedAccountId: payment.stripeConnectedAccountId, stripeMode: payment.stripeMode });
  for (const [key, value] of Object.entries(expected)) {
    if (payment.chargeModel === "DIRECT" || hasUnknownArchitecture(payment) || metadata?.[key] !== undefined) requireOwnership(metadata?.[key] === value, "Stripe metadata ownership conflict");
  }
  requireOwnership(checkout.sourceType !== "CUSTOM_PAYMENT" || metadata?.sourceType === "CUSTOM_PAYMENT", "Custom Payment source conflict");
  requireOwnership(checkout.sourceType !== "RECURRING_PLAN" || metadata?.sourceType === undefined || metadata.sourceType === "RECURRING_PLAN", "Standard payment source conflict");
}

async function observeStripe(
  stripe: Stripe, note: Notification, payment: OwnedPayment, checkout: OwnedCheckout, options: Stripe.RequestOptions, mode: boolean, platformId: string
) {
  const session = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId!, {}, options);
  requireOwnership(session.id === payment.stripeCheckoutSessionId && session.mode === "payment" && session.livemode === mode, "Wrong Stripe Checkout");
  requireOwnership(!note.checkoutId || note.checkoutId === session.id, "Stale Checkout identifier");
  requireOwnership((payment.chargeModel !== "DIRECT" && !hasUnknownArchitecture(payment) && !session.client_reference_id) || session.client_reference_id === payment.id, "Wrong Checkout reference");
  requireOwnership(payment.chargeModel !== "DIRECT" || (session.payment_method_types?.length === 1 && session.payment_method_types[0] === (payment.paymentMethod === PaymentMethod.ACH ? "us_bank_account" : "card")), "Checkout payment method conflict");
  validateMetadata(session.metadata, payment, checkout);
  // Disputes carry no checkout metadata. Their charge/intent ownership is
  // verified below against the independently retrieved Stripe objects.
  if (note.kind === "checkout" || note.kind === "intent") validateMetadata(note.metadata, payment, checkout);
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

  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] }, options);
  requireOwnership(intent.id === intentId && intent.currency === "usd" &&
    intent.amount === payment.totalChargedCents &&
    intent.livemode === mode && intent.application_fee_amount === (payment.chargeModel === "DIRECT" ? payment.rflApplicationFeeCents : payment.platformFeeCents) &&
    (payment.chargeModel === "DIRECT" ? !intent.transfer_data && !intent.on_behalf_of :
      !!objectId(intent.transfer_data?.destination) && objectId(intent.transfer_data?.destination) !== platformId &&
      (!payment.stripeConnectedAccountId || objectId(intent.transfer_data?.destination) === payment.stripeConnectedAccountId)),
  "PaymentIntent amount or destination ownership conflict");
  requireOwnership(payment.chargeModel !== "DIRECT" || (intent.payment_method_types?.length === 1 && intent.payment_method_types[0] === (payment.paymentMethod === PaymentMethod.ACH ? "us_bank_account" : "card")), "Intent payment method conflict");
  validateMetadata(intent.metadata, payment, checkout);

  const chargeId = objectId(intent.latest_charge);
  const charge = chargeId
    ? typeof intent.latest_charge === "object"
      ? intent.latest_charge
      : await stripe.charges.retrieve(chargeId, {}, options)
    : null;
  if (charge) {
    requireOwnership(charge.id === chargeId && objectId(charge.payment_intent) === intentId &&
      charge.livemode === mode && charge.currency === "usd" && charge.amount === payment.totalChargedCents,
    "Charge does not belong to the current PaymentIntent");
    requireOwnership(charge.payment_method_details?.type === (payment.paymentMethod === PaymentMethod.ACH ? "us_bank_account" : "card"),
      "Charge payment method conflict");
  }
  if (note.kind === "charge" && note.chargeId !== chargeId) {
    const historical = await stripe.charges.retrieve(note.chargeId!, {}, options);
    requireOwnership(historical.livemode === mode && objectId(historical.payment_intent) === intentId && historical.amount === payment.totalChargedCents && historical.currency === "usd" && historical.status === "failed" && historical.payment_method_details?.type === (payment.paymentMethod === PaymentMethod.ACH ? "us_bank_account" : "card"), "Unexpected historical charge");
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
    const list = await stripe.disputes.list({ charge: chargeId, limit: 100 }, options);
    if (list.has_more) throw new Error("Dispute history exceeds the reconciliation limit");
    disputes = list.data;
    for (const dispute of disputes) {
      requireOwnership(dispute.livemode === mode && objectId(dispute.charge) === chargeId && objectId(dispute.payment_intent) === intentId, "Dispute ownership conflict");
    }
    requireOwnership(!note.disputeId || disputes.some((dispute) => dispute.id === note.disputeId), "Unknown dispute");
    if (charge?.disputed && disputes.length === 0) throw new Error("Disputed charge has no available dispute history");
  }
  const active = disputes.filter((dispute) => !["won", "warning_closed", "prevented"].includes(dispute.status));
  const bankReturn = active.find((dispute) => payment.paymentMethod === PaymentMethod.ACH &&
    !dispute.status.startsWith("warning_") && BANK_RETURN_REASONS.has(dispute.reason));
  const disputeResolved = disputes.some((dispute) => ["won", "warning_closed", "prevented"].includes(dispute.status)) && active.length === 0;
  const lateBankFailure = payment.paymentMethod === PaymentMethod.ACH && !!payment.paidAt && chargeId === payment.stripeChargeId &&
    intent.status === "requires_payment_method" && charge?.status === "failed" &&
    [intent.last_payment_error?.code, intent.last_payment_error?.decline_code, charge.failure_code].some(code => !!code && BANK_RETURN_REASONS.has(code));
  const status = bankReturn || lateBankFailure ? PaymentStatus.RETURNED
    : active.length ? PaymentStatus.DISPUTED
    : settled ? PaymentStatus.PAID
    : intent.status === "processing" ? PaymentStatus.PENDING
    : session.status === "expired" ? PaymentStatus.EXPIRED
    : intent.status === "canceled" || (intent.status === "requires_payment_method" && intent.last_payment_error)
      ? PaymentStatus.FAILED : null;
  return {
    status, settled: Boolean(settled || lateBankFailure), disputeResolved, intentId, chargeId,
    reportingDisputeOutcome: disputes.some(d => d.status === "lost") ? "LOST" : active.length ? "ACTIVE" : disputes.some(d => d.status === "won") ? "WON" : disputes.length ? "CLOSED" : null,
    reportingDisputes: disputes.map(d => ({ id: d.id, status: d.status })),
    failureCode: bankReturn?.reason ?? intent.last_payment_error?.code ?? intent.last_payment_error?.decline_code ?? null,
    failureMessage: bankReturn ? "The bank returned this payment." : intent.last_payment_error?.message ?? null,
  };
}

function exceptionId(event: Stripe.Event) { return "stripe-exception-" + createHash("sha256").update(event.id).digest("hex"); }
function safeEvent(event: Stripe.Event, classification: string): Prisma.InputJsonObject {
  return { stripeEventId: event.id, stripeEventType: typeof event.type === "string" && /^[a-z][a-z0-9_.]{0,199}$/.test(event.type) ? event.type : "unknown", stripeAccount: typeof event.account === "string" && /^acct_[A-Za-z0-9]+$/.test(event.account) ? event.account : null,
    stripeMode: typeof event.livemode === "boolean" ? event.livemode ? "live" : "test" : "unknown", classification };
}
async function resolved(event: Stripe.Event) {
  await prisma.auditLog.updateMany({ where: { id: exceptionId(event) }, data: {
    action: "STRIPE_WEBHOOK_EXCEPTION_RESOLVED", metadata: safeEvent(event, "RESOLVED"),
  } });
}
function paymentVersion(payment: OwnedPayment) {
  const { business: _business, ...record } = payment; void _business;
  return record;
}
function validatePair(payment: OwnedPayment, checkout: OwnedCheckout) {
  assertCheckoutSource(checkout);
  requireOwnership(Array.isArray(checkout.lineItems) && checkout.lineItems.every(item => item && typeof item === "object" && !Array.isArray(item) && typeof item.amountCents === "number" && Number.isSafeInteger(item.amountCents) && item.amountCents >= 0) &&
    checkout.lineItems.reduce<number>((total, item) => total + (item as { amountCents: number }).amountCents, 0) === payment.totalChargedCents, "Financial line items do not reconcile");
  requireOwnership(payment.chargeModel !== "DIRECT" || payment.subtotalCents >= 100 && payment.subtotalCents <= 500000, "Direct obligation outside contract");
  requireOwnership(checkout.paymentId === payment.id && checkout.sourceType === payment.sourceType && checkout.planId === payment.sourceId &&
    checkout.billingCycle === payment.billingCycle && checkout.businessId === payment.businessId && payment.business.id === payment.businessId &&
    checkout.accountCode === payment.business.accountCode && checkout.totalCents === payment.totalChargedCents && checkout.subtotalCents === payment.subtotalCents &&
    checkout.platformFeeCents === payment.platformFeeCents && checkout.paymentMethod === payment.paymentMethod &&
    (!payment.checkoutAttemptId || payment.checkoutAttemptId === checkout.id) && isDeepStrictEqual(checkout.lineItems, payment.lineItemsSnapshot), "RFL payment snapshots conflict");
  requireOwnership(payment.chargeModel === "DIRECT" ? directPaymentMatchesCheckoutArchitecture(payment, checkout) :
    paymentMatchesCheckoutArchitecture(payment, checkout) && (hasUnknownArchitecture(payment) || payment.chargeModel === "LEGACY_DESTINATION"), "Charge architecture conflict");
}
function validateEnvelope(event: Stripe.Event, payment: OwnedPayment) {
  const mode = classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY ?? "");
  if (typeof event.livemode !== "boolean" || mode === "unknown" || event.livemode !== (mode === "live") ||
      (payment.chargeModel === "DIRECT" ? event.account !== payment.stripeConnectedAccountId || payment.stripeMode !== mode : event.account != null)) {
    throw new ProcessingFailure("ACCOUNT_MODE_MISMATCH");
  }
}
export async function processStripePaymentEvent(event: Stripe.Event, stripe: Stripe): Promise<void> {
  try {
    requireOwnership(event.object === "event" && typeof event.id === "string" && /^evt_[A-Za-z0-9_-]{1,250}$/.test(event.id) && typeof event.type === "string" && !!event.data?.object, "Malformed event");
    if (isCustomerRefundEvent(event)) { await processCustomerRefundEvent(prisma, stripe, event); await resolved(event); return; }
    if (DIRECT_FINANCIAL_EVENTS.has(event.type)) { await queueDirectFinancialEvent(prisma,stripe,event); await resolved(event); return; }
    const note = notification(event);
    if (!note) {
      if (/^(?:checkout\.session\.|payment_intent\.|charge\.|refund\.|application_fee\.)/.test(event.type)) throw new ProcessingFailure("UNSUPPORTED_FINANCIAL_EVENT");
      return;
    }
    const paymentId = await candidatePaymentId(note);
    if (!paymentId) throw new ProcessingFailure("UNKNOWN_PAYMENT_OWNERSHIP");
    const snapshot = await prisma.payment.findUnique({ where: { id: paymentId }, include: { business: { include: { stripeConnection: true } } } });
    if (!snapshot) throw new ProcessingFailure("UNKNOWN_PAYMENT_OWNERSHIP");
    validateEnvelope(event, snapshot);
    if (!snapshot.stripeCheckoutSessionId) throw new ProcessingFailure("CHECKOUT_OWNERSHIP_NOT_PERSISTED");
    const initialCheckout = await prisma.checkoutSession.findUnique({ where: { stripeCheckoutSessionId: snapshot.stripeCheckoutSessionId } });
    requireOwnership(initialCheckout, "Missing owned Checkout"); validatePair(snapshot, initialCheckout);
    const eventWhere = { actorType: "STRIPE_WEBHOOK", targetType: "PAYMENT", targetId: paymentId, metadata: { path: ["stripeEventId"], equals: event.id } };
    if (await prisma.auditLog.findFirst({ where: eventWhere, select: { id: true } })) { await resolved(event); return; }
    const [platform, balance] = await Promise.all([stripe.accounts.retrieve(STRIPE_READ_OPTIONS), stripe.balance.retrieve({}, STRIPE_READ_OPTIONS)]);
    const mode = classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY ?? "");
    const identity = { platformAccountId: platform.id, mode: mode === "live" ? "live" as const : "test" as const };
    validateStripePaymentIdentity(identity, { platformAccountId: platform.id, livemode: balance.livemode, credentialMode: mode });
    let options: Stripe.RequestOptions = STRIPE_READ_OPTIONS;
    if (snapshot.chargeModel === "DIRECT" || snapshot.stripePlatformAccountId != null || snapshot.stripeMode != null) {
      requireOwnership(snapshot.stripePlatformAccountId === platform.id && snapshot.stripeMode === mode, "Captured platform/mode mismatch");
      const context = resolveStripePaymentContext(snapshot, identity);
      if (!matchesStripePaymentEventContext(context, event, platform.id)) throw new ProcessingFailure("ACCOUNT_MODE_MISMATCH");
      options = { ...STRIPE_READ_OPTIONS, ...stripePaymentRequestOptions(context) };
    }
    const platformId = platform.id;
    const observed = await observeStripe(stripe, note, snapshot, initialCheckout, options, event.livemode, platformId);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`);
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { business: { include: { stripeConnection: true } } } });
      if (!payment) throw new ProcessingFailure("UNKNOWN_PAYMENT_OWNERSHIP");
      const duplicate = await tx.auditLog.findFirst({ where: eventWhere, select: { id: true } });
      if (duplicate) return;
      const checkout = await tx.checkoutSession.findUnique({ where: { stripeCheckoutSessionId: payment.stripeCheckoutSessionId! } });
      requireOwnership(checkout, "Missing owned Checkout"); validatePair(payment, checkout); validateEnvelope(event, payment);
      requireOwnership(isDeepStrictEqual({ ...paymentVersion(payment), status: null, updatedAt: null, pendingAt: null, paidAt: null, failedAt: null, expiredAt: null, disputedAt: null, returnedAt: null, failureCode: null, failureMessage: null, stripePaymentIntentId: null, stripeChargeId: null },
        { ...paymentVersion(snapshot), status: null, updatedAt: null, pendingAt: null, paidAt: null, failedAt: null, expiredAt: null, disputedAt: null, returnedAt: null, failureCode: null, failureMessage: null, stripePaymentIntentId: null, stripeChargeId: null }), "Payment ownership changed during Stripe observation");
      const transition = observed.status !== null && canApplyStripePaymentState(payment.status, observed.status, observed);
      const changed = !isDeepStrictEqual(paymentVersion(payment), paymentVersion(snapshot));
      if (changed && (observed.status !== payment.status || observed.intentId !== payment.stripePaymentIntentId || observed.chargeId !== payment.stripeChargeId)) throw new ProcessingFailure("RETRYABLE_STATE_CHANGED");
      const now = new Date();
      const data: Prisma.PaymentUpdateManyMutationInput = {
        stripePaymentIntentId: observed.intentId,
        stripeChargeId: observed.chargeId,
      };
      if (observed.reportingDisputes?.length && !payment.disputedAt) data.disputedAt = now;
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
      if (transition || payment.stripePaymentIntentId !== observed.intentId || payment.stripeChargeId !== observed.chargeId || data.disputedAt) {
        const updated = await tx.payment.updateMany({
          where: {
            id: payment.id, status: payment.status, stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
            stripePaymentIntentId: payment.stripePaymentIntentId, stripeChargeId: payment.stripeChargeId,
          }, data,
        });
        if (updated.count !== 1) throw new Error("Payment changed during webhook reconciliation");
      }
      if (transition) {
        try { await queuePaymentSms(tx, payment, checkout, payment.business, observed.status!, event.id); }
        catch { throw new ProcessingFailure("SMS_OUTBOX_PERSISTENCE_FAILED"); }
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
      if (payment.chargeModel === "DIRECT" && observed.status && [PaymentStatus.PAID,PaymentStatus.RETURNED,PaymentStatus.DISPUTED].includes(observed.status as "PAID"|"RETURNED"|"DISPUTED")) {
        await queueDirectReconciliation(tx,{...payment,status:observed.status,stripePaymentIntentId:observed.intentId,stripeChargeId:observed.chargeId});
      }
      // Existing indexed audit storage is the durable per-payment event ledger.
      // No timestamp ordering: Stripe event timestamps have only second precision.
      await tx.auditLog.create({
        data: {
          id: "stripe-event-" + createHash("sha256").update(event.id).digest("hex"), businessId: payment.businessId, actorType: "STRIPE_WEBHOOK",
          action: transition ? `PAYMENT_${observed.status}` : "STRIPE_EVENT_RECONCILED",
          targetType: "PAYMENT", targetId: payment.id,
          summary: transition ? `Stripe payment state changed to ${observed.status}.` : "Stripe event reconciled without a payment status change.",
          metadata: {
            stripeEventId: event.id, stripeEventType: event.type, stripeAccount: event.account ?? null, stripeMode: event.livemode ? "live" : "test", stripePlatformAccountId: platformId,
            previousStatus: payment.status, observedStatus: observed.status, applied: transition,
            reportingDisputeOutcome: observed.reportingDisputeOutcome ?? null,
            reportingDisputes: observed.reportingDisputes ?? [],
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
    await resolved(event);
  } catch (error) {
    const classification = error instanceof ProcessingFailure ? error.classification : error instanceof OwnershipMismatch ? "OWNERSHIP_MISMATCH" : "RETRYABLE_PROCESSING_FAILURE";
    if (typeof event.id === "string" && /^evt_[A-Za-z0-9_-]{1,250}$/.test(event.id)) {
      await prisma.auditLog.upsert({ where: { id: exceptionId(event) }, create: { id: exceptionId(event), actorType: "STRIPE_WEBHOOK_EXCEPTION",
        action: "STRIPE_WEBHOOK_EXCEPTION", targetType: "STRIPE_EVENT", targetId: event.id, summary: classification, metadata: safeEvent(event, classification) },
        update: { action: "STRIPE_WEBHOOK_EXCEPTION", summary: classification, metadata: safeEvent(event, classification) } });
    }
    throw error;
  }
}
