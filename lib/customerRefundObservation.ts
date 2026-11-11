import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type Payment, type PrismaClient } from "@prisma/client";
import { assertCheckoutSource } from "@/lib/customPayment";
import type Stripe from "stripe";
import { hasUnknownArchitecture, paymentMatchesCheckoutArchitecture, directPaymentMatchesCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { classifyStripeCredentialMode, validateStripePaymentIdentity } from "@/lib/stripePaymentContext";
import { directFinancialSnapshot, FinancialObservationError } from "@/lib/directFinancialObservation";

const READ = { timeout: 5000, maxNetworkRetries: 0 };
const EVENTS = new Set(["charge.refunded", "charge.refund.updated", "refund.created", "refund.updated", "refund.failed"]);
const STATUSES = new Set(["pending", "requires_action", "succeeded", "failed", "canceled"]);
const TERMINAL = new Set(["succeeded", "failed", "canceled"]);
const id = (v: unknown): string | null => typeof v === "string" ? v : v && typeof v === "object" && "id" in v && typeof v.id === "string" ? v.id : null;
function check(v: unknown): asserts v { if (!v) throw Error("Customer refund ownership or observation is unverified."); }
const cents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function isCustomerRefundEvent(event: Stripe.Event) {
  const o = event.data.object as unknown as { amount_refunded?: number; refunded?: boolean };
  return EVENTS.has(event.type) || event.type === "charge.updated" && (o.refunded === true || (o.amount_refunded ?? 0) > 0);
}
export async function assertNoCustomerRefunds(tx: Pick<Prisma.TransactionClient, "customerRefundObservation">, paymentId: string) {
  if (await tx.customerRefundObservation.findFirst({ where: { paymentId, status: { in: ["pending", "requires_action", "succeeded"] } } })) {
    throw new FinancialObservationError("CUSTOMER_REFUND_REVIEW");
  }
}
function snapshot(p: Payment) {
  return { ...directFinancialSnapshot(p), intentId: p.stripePaymentIntentId, chargeId: p.stripeChargeId, items: p.lineItemsSnapshot };
}

/** Provider reads only, in the captured architecture. Null historical facts remain null. */
export async function readRefundParent(db: PrismaClient, stripe: Stripe, p: Payment, event: Stripe.Event, chargeId: string) {
  const direct = p.chargeModel === "DIRECT", unknown = hasUnknownArchitecture(p);
  check(direct || unknown || p.chargeModel === "LEGACY_DESTINATION" && p.pricingVersion === "RFL_LEGACY_V1");
  const mode = classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY ?? "");
  check(mode !== "unknown" && event.livemode === (mode === "live") &&
    (direct ? event.account === p.stripeConnectedAccountId && !!event.account : event.account == null));
  check(p.stripeCheckoutSessionId && (!p.stripeChargeId || p.stripeChargeId === chargeId));
  const c = await db.checkoutSession.findUnique({ where: { stripeCheckoutSessionId: p.stripeCheckoutSessionId } });
  if (c) assertCheckoutSource(c);
  check(c && c.paymentId === p.id && c.businessId === p.businessId && c.paymentMethod === p.paymentMethod &&
    c.sourceType === p.sourceType && c.planId === p.sourceId && c.billingCycle === p.billingCycle && (!p.checkoutAttemptId || p.checkoutAttemptId === c.id) &&
    c.totalCents === p.totalChargedCents && c.subtotalCents === p.subtotalCents && c.platformFeeCents === p.platformFeeCents &&
    isDeepStrictEqual(c.lineItems, p.lineItemsSnapshot) && (direct ? directPaymentMatchesCheckoutArchitecture(p, c) : paymentMatchesCheckoutArchitecture(p, c)));
  check(Array.isArray(c.lineItems) && c.lineItems.every(item => item && typeof item === "object" && !Array.isArray(item) && cents(item.amountCents)) &&
    c.lineItems.reduce<number>((sum, item) => sum + (item as { amountCents: number }).amountCents, 0) === p.totalChargedCents);
  const [platform, balance] = await Promise.all([stripe.accounts.retrieve(READ), stripe.balance.retrieve({}, READ)]);
  const identity = { platformAccountId: platform.id, mode };
  validateStripePaymentIdentity(identity, { platformAccountId: platform.id, livemode: balance.livemode, credentialMode: mode });
  check((p.stripePlatformAccountId == null || p.stripePlatformAccountId === platform.id) && (p.stripeMode == null || p.stripeMode === mode));
  check(!direct || p.stripePlatformAccountId === platform.id && p.stripeMode === mode && p.pricingVersion === "RFL_DIRECT_V1");
  const options = direct ? { ...READ, stripeAccount: p.stripeConnectedAccountId! } : READ;
  const session = await stripe.checkout.sessions.retrieve(p.stripeCheckoutSessionId, {}, options);
  const intentId = id(session.payment_intent); check(intentId && (!p.stripePaymentIntentId || intentId === p.stripePaymentIntentId));
  const [intent, charge] = await Promise.all([stripe.paymentIntents.retrieve(intentId, {}, options), stripe.charges.retrieve(chargeId, {}, options)]);
  check(session.id === p.stripeCheckoutSessionId && session.mode === "payment" && session.currency === "usd" && session.amount_total === p.totalChargedCents &&
    (!session.client_reference_id && !direct || session.client_reference_id === p.id) &&
    intent.id === intentId && intent.currency === "usd" && intent.amount === p.totalChargedCents &&
    intent.application_fee_amount === (direct ? p.rflApplicationFeeCents : p.platformFeeCents) && id(intent.latest_charge) === chargeId &&
    charge.id === chargeId && id(charge.payment_intent) === intentId && charge.currency === "usd" && charge.amount === p.totalChargedCents &&
    [session, intent, charge].every(o => o.livemode === event.livemode) &&
    charge.payment_method_details?.type === (p.paymentMethod === "ACH" ? "us_bank_account" : "card"));
  if (direct) check(!intent.transfer_data && !intent.on_behalf_of);
  else check(id(intent.transfer_data?.destination) && id(intent.transfer_data?.destination) !== platform.id &&
    (!p.stripeConnectedAccountId || id(intent.transfer_data?.destination) === p.stripeConnectedAccountId));
  const metadata: Record<string, string> = { product: "RentFrayLite", paymentId: p.id, checkoutSessionId: c.id, businessId: p.businessId, accountCode: c.accountCode, billingCycle: c.billingCycle ?? "" };
  if (direct) Object.assign(metadata, { checkoutAttemptId: c.id, sourceType: c.sourceType, chargeModel: "DIRECT", pricingVersion: p.pricingVersion, stripePlatformAccountId: p.stripePlatformAccountId, stripeConnectedAccountId: p.stripeConnectedAccountId, stripeMode: p.stripeMode });
  for (const o of [session, intent]) {
    for (const [k, v] of Object.entries(metadata)) check(!direct && !unknown && o.metadata?.[k] === undefined || o.metadata?.[k] === v);
    if (c.sourceType === "CUSTOM_PAYMENT") check(o.metadata?.sourceType === "CUSTOM_PAYMENT");
  }
  return { options, identity, charge, intent, checkout: c, accountId: direct ? p.stripeConnectedAccountId! : platform.id };
}

/** Observation only: never create/refund/cancel an object or rewrite Payment financial/state fields. */
export async function processCustomerRefundEvent(db: PrismaClient, stripe: Stripe, event: Stripe.Event) {
  const object = event.data.object as unknown as { object?: string; id?: string; charge?: unknown; payment_intent?: unknown };
  const chargeEvent = event.type === "charge.refunded" || event.type === "charge.updated";
  check(object.object === (chargeEvent ? "charge" : "refund"));
  const chargeId = chargeEvent ? object.id : id(object.charge); check(chargeId && /^ch_[A-Za-z0-9_-]+$/.test(chargeId));
  if (!chargeEvent) check(object.id && /^re_[A-Za-z0-9_-]+$/.test(object.id));
  const byCharge = await db.payment.findUnique({ where: { stripeChargeId: chargeId } });
  const intentId = id(object.payment_intent);
  const byIntent = intentId ? await db.payment.findUnique({ where: { stripePaymentIntentId: intentId } }) : null;
  check(!byCharge || !byIntent || byCharge.id === byIntent.id); const p = byCharge ?? byIntent; check(p);
  const before = await db.customerRefundObservation.findMany({ where: { paymentId: p.id }, orderBy: { stripeRefundId: "asc" } });
  const observed = await readRefundParent(db, stripe, p, event, chargeId);
  const list = await stripe.refunds.list({ charge: chargeId, limit: 100 }, observed.options);
  check(list.has_more === false && list.data.length > 0 && (chargeEvent || list.data.some(r => r.id === object.id)));
  const seen = new Set<string>(); let succeeded = 0, active = 0;
  const records = list.data.map(refund => {
    check(refund.object === "refund" && /^re_[A-Za-z0-9_-]+$/.test(refund.id) && !seen.has(refund.id) &&
      id(refund.charge) === chargeId && id(refund.payment_intent) === observed.intent.id && refund.currency === "usd" &&
      cents(refund.amount) && refund.amount > 0 && refund.amount <= p.totalChargedCents && STATUSES.has(refund.status ?? "") && Number.isSafeInteger(refund.created));
    seen.add(refund.id); if (refund.status === "succeeded") succeeded += refund.amount;
    if (!["failed", "canceled"].includes(refund.status!)) active += refund.amount;
    const created = new Date(refund.created * 1000); check(Number.isFinite(created.getTime()));
    return { paymentId: p.id, stripeRefundId: refund.id, stripePlatformAccountId: observed.identity.platformAccountId,
      stripeAccountId: observed.accountId, stripeMode: observed.identity.mode, chargeModel: p.chargeModel, pricingVersion: p.pricingVersion,
      stripeChargeId: chargeId, stripePaymentIntentId: observed.intent.id, amountCents: refund.amount, currency: "usd", status: refund.status!, stripeCreatedAt: created };
  });
  check(Number.isSafeInteger(active) && active <= p.totalChargedCents && Number.isSafeInteger(succeeded) && succeeded <= p.totalChargedCents);
  check(cents(observed.charge.amount_refunded) && observed.charge.amount_refunded >= succeeded && observed.charge.amount_refunded <= active);
  check(before.every(row => seen.has(row.stripeRefundId))); // A truncated/history-lagged observation must not erase facts.
  await db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${p.id} FOR UPDATE`);
    const current = await tx.payment.findUnique({ where: { id: p.id } }); check(current && isDeepStrictEqual(snapshot(current), snapshot(p)));
    const eventWhere = { actorType: "STRIPE_WEBHOOK", targetType: "PAYMENT", targetId: p.id, metadata: { path: ["stripeEventId"], equals: event.id } };
    if (await tx.auditLog.findFirst({ where: eventWhere })) return;
    check(isDeepStrictEqual(await tx.customerRefundObservation.findMany({ where: { paymentId: p.id }, orderBy: { stripeRefundId: "asc" } }), before));
    for (const record of records) {
      const key = { stripePlatformAccountId: record.stripePlatformAccountId, stripeAccountId: record.stripeAccountId, stripeMode: record.stripeMode, stripeRefundId: record.stripeRefundId };
      const where = { stripePlatformAccountId_stripeAccountId_stripeMode_stripeRefundId: key };
      const previous = await tx.customerRefundObservation.findUnique({ where });
      if (previous) {
        const { status: _s, ...facts } = record; void _s;
        check(Object.entries(facts).every(([k, v]) => isDeepStrictEqual(previous[k as keyof typeof previous], v)) && (!TERMINAL.has(previous.status) || previous.status === record.status));
      }
      await tx.customerRefundObservation.upsert({ where, create: record, update: { status: record.status, observedAt: new Date() } });
    }
    if (current.chargeModel === "DIRECT") await tx.directFinancialReconciliation.upsert({ where: { paymentId: p.id },
      create: { paymentId: p.id, status: "EXCEPTION", reasonCode: "CUSTOMER_REFUND_REVIEW", refreshRequested: true, expectedSnapshot: directFinancialSnapshot(current) },
      update: { status: "EXCEPTION", reasonCode: "CUSTOMER_REFUND_REVIEW", refreshRequested: true } });
    await tx.auditLog.create({ data: { id: "stripe-event-" + createHash("sha256").update(event.id).digest("hex"), businessId: p.businessId, actorType: "STRIPE_WEBHOOK",
      action: "CUSTOMER_REFUND_OBSERVED", targetType: "PAYMENT", targetId: p.id,
      metadata: { stripeEventId: event.id, stripeEventType: event.type, stripeAccount: event.account ?? null, stripeMode: observed.identity.mode, refundIds: records.map(r => r.stripeRefundId) } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
}
