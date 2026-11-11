import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type CheckoutSession, type Payment } from "@prisma/client";
import type Stripe from "stripe";
import { withAdminMutation } from "@/lib/adminMutation";
import type { SessionAuthority } from "@/lib/sessionAuthority";
import { assertCheckoutSource } from "@/lib/customPayment";
import { directPaymentMatchesCheckoutArchitecture, paymentMatchesCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { resolveStripePaymentContext, stripePaymentRequestOptions, validateStripePaymentIdentity, type StripePaymentIdentity, type StripePaymentMode } from "@/lib/stripePaymentContext";

// Trusted maintenance host only. No route, browser binding, creation or money API.
export type RecoveryReader = {
  accounts: Pick<Stripe["accounts"], "retrieve">;
  balance: Pick<Stripe["balance"], "retrieve">;
  checkout: { sessions: Pick<Stripe["checkout"]["sessions"], "retrieve"> };
  paymentIntents: Pick<Stripe["paymentIntents"], "retrieve">;
  charges: Pick<Stripe["charges"], "retrieve">;
};
export type OriginalCheckoutRecovery = Readonly<{
  businessId: string; paymentId: string; checkoutAttemptId: string; stripeSessionId: string;
}>;
export class OriginalCheckoutRecoveryBlocked extends Error {
  constructor() { super("Original checkout recovery is unverified. Preserve the attempt and escalate; do not create another payment."); }
}
function check(value: unknown): asserts value { if (!value) throw new OriginalCheckoutRecoveryBlocked(); }
const READ = { timeout: 5000, maxNetworkRetries: 0 };
const providerId = (value: unknown): string | null => typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;

function pair(p: Payment, c: CheckoutSession, request: OriginalCheckoutRecovery, identity: StripePaymentIdentity) {
  assertCheckoutSource(c);
  check(p.id === request.paymentId && c.id === request.checkoutAttemptId && p.checkoutAttemptId === c.id &&
    p.businessId === request.businessId && c.businessId === p.businessId && (!c.paymentId || c.paymentId === p.id) &&
    (!p.stripeCheckoutSessionId || p.stripeCheckoutSessionId === request.stripeSessionId) &&
    (!c.stripeCheckoutSessionId || c.stripeCheckoutSessionId === request.stripeSessionId) &&
    p.sourceType === c.sourceType && p.sourceId === c.planId && p.billingCycle === c.billingCycle &&
    p.referenceLabel === c.unitNumber && p.paymentMethod === c.paymentMethod &&
    ["ACH", "CARD"].includes(p.paymentMethod ?? "") && p.payerFirstName === c.firstName && p.payerLastName === c.lastName && p.payerPhone === c.phone &&
    p.subtotalCents === c.subtotalCents && p.platformFeeCents === c.platformFeeCents && p.totalChargedCents === c.totalCents &&
    p.totalChargedCents === p.subtotalCents + p.platformFeeCents && isDeepStrictEqual(p.lineItemsSnapshot, c.lineItems));
  const direct = p.chargeModel === "DIRECT";
  check(direct ? directPaymentMatchesCheckoutArchitecture(p, c) : p.chargeModel === "LEGACY_DESTINATION" && paymentMatchesCheckoutArchitecture(p, c));
  // Legacy captured destination records may predate platform/mode snapshots.
  // Verify those against the named original objects; never backfill from today's connection.
  if (direct || p.stripePlatformAccountId != null || p.stripeMode != null) resolveStripePaymentContext(p, identity);
  check(identity.platformAccountId !== p.stripeConnectedAccountId);
  const items = p.lineItemsSnapshot;
  check(Array.isArray(items) && items.length > 0 && items.every(item => item && typeof item === "object" && !Array.isArray(item) &&
    Number.isSafeInteger(item.amountCents) && Number(item.amountCents) >= 0));
  check(items.reduce<number>((sum, item) => sum + Number((item as Prisma.JsonObject).amountCents), 0) === p.totalChargedCents);
}

function metadata(actual: Stripe.Metadata | null, p: Payment, c: CheckoutSession, identity: StripePaymentIdentity) {
  const required = { product: "RentFrayLite", paymentId: p.id, checkoutSessionId: c.id, businessId: p.businessId, accountCode: c.accountCode };
  check(Object.entries(required).every(([key, value]) => actual?.[key] === value));
  check((actual?.billingCycle ?? "") === (p.billingCycle ?? ""));
  const architecture = { checkoutAttemptId: c.id, sourceType: p.sourceType, pricingVersion: p.pricingVersion, chargeModel: p.chargeModel,
    stripeConnectedAccountId: p.stripeConnectedAccountId, stripePlatformAccountId: identity.platformAccountId, stripeMode: identity.mode };
  for (const [key, value] of Object.entries(architecture)) {
    const required = p.chargeModel === "DIRECT" || key === "sourceType" && p.sourceType === "CUSTOM_PAYMENT";
    check(required ? actual?.[key] === value : actual?.[key] === undefined || actual[key] === value);
  }
}

async function lockedSnapshot(tx: Prisma.TransactionClient, request: OriginalCheckoutRecovery, identity: StripePaymentIdentity) {
  // withAdminMutation already holds AdminAccess -> Session -> Business.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${request.paymentId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CheckoutSession" WHERE "id" = ${request.checkoutAttemptId} FOR UPDATE`);
  const p = await tx.payment.findUnique({ where: { id: request.paymentId } });
  const c = await tx.checkoutSession.findUnique({ where: { id: request.checkoutAttemptId } });
  const business = await tx.business.findUnique({ where: { id: request.businessId } });
  const original = await tx.payment.findUnique({ where: { checkoutAttemptId: request.checkoutAttemptId } });
  check(p && c && business && original?.id === p.id);
  pair(p, c, request, identity);
  return { p, c };
}

function version(snapshot: { p: Payment; c: CheckoutSession }) {
  return { p: { ...snapshot.p, stripeCheckoutSessionId: null, updatedAt: null },
    c: { ...snapshot.c, paymentId: null, stripeCheckoutSessionId: null, updatedAt: null } };
}

/** Bounded preview/apply of ONE known original session. Preview is the default.
 * The only writes are missing local identity pointers and an atomic safe audit.
 * No payment/checkout lifecycle, failure, financial or consent fields are reset. */
export async function recoverOriginalCheckoutSession(reader: RecoveryReader, requestInput: OriginalCheckoutRecovery,
  operatorInput: SessionAuthority, identityInput: StripePaymentIdentity, credentialMode: StripePaymentMode | "unknown", apply = false) {
  try {
    const request = Object.freeze({ businessId: requestInput.businessId, paymentId: requestInput.paymentId,
      checkoutAttemptId: requestInput.checkoutAttemptId, stripeSessionId: requestInput.stripeSessionId });
    const identity = Object.freeze({ platformAccountId: identityInput.platformAccountId, mode: identityInput.mode }), operator = structuredClone(operatorInput);
    check(credentialMode !== "unknown" && credentialMode === identity.mode);
    check([request.businessId, request.paymentId, request.checkoutAttemptId].every(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id)) &&
      typeof request.stripeSessionId === "string" && /^cs_[A-Za-z0-9_]{1,250}$/.test(request.stripeSessionId) && typeof apply === "boolean");
    const before = await withAdminMutation(operator, request.businessId, tx => lockedSnapshot(tx, request, identity));
    const { p, c } = before, direct = p.chargeModel === "DIRECT";
    // All provider awaits are OUTSIDE transactions/locks, with explicit timeouts.
    const platform = await reader.accounts.retrieve(READ), balance = await reader.balance.retrieve({}, READ);
    validateStripePaymentIdentity(identity, { platformAccountId: platform.id, livemode: balance.livemode, credentialMode });
    const options = { ...READ, ...(direct ? stripePaymentRequestOptions(resolveStripePaymentContext(p, identity)) : {}) };
    const session = await reader.checkout.sessions.retrieve(request.stripeSessionId, {}, options);
    const method = p.paymentMethod === "ACH" ? "us_bank_account" : "card";
    check(session.id === request.stripeSessionId && session.object === "checkout.session" && session.mode === "payment" &&
      session.livemode === (identity.mode === "live") && session.currency === "usd" && session.amount_total === p.totalChargedCents &&
      session.client_reference_id === p.id && ["open", "complete", "expired"].includes(session.status ?? "") &&
      ["unpaid", "paid", "no_payment_required"].includes(session.payment_status) &&
      session.payment_method_types?.length === 1 && session.payment_method_types[0] === method);
    metadata(session.metadata, p, c, identity);
    const intentId = providerId(session.payment_intent);
    check(session.payment_intent === null || intentId);
    check(session.payment_status !== "paid" || intentId);
    check((!p.stripePaymentIntentId || p.stripePaymentIntentId === intentId) && (intentId || !p.stripeChargeId));
    if (intentId) {
      const intent = await reader.paymentIntents.retrieve(intentId, {}, options);
      check(intent.id === intentId && intent.object === "payment_intent" && intent.livemode === session.livemode && intent.currency === "usd" &&
        intent.amount === p.totalChargedCents && intent.application_fee_amount === (direct ? p.rflApplicationFeeCents : p.platformFeeCents) &&
        ["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture", "processing", "succeeded", "canceled"].includes(intent.status) &&
        Number.isSafeInteger(intent.amount_received) && intent.amount_received >= 0 && intent.amount_received <= p.totalChargedCents &&
        intent.payment_method_types?.length === 1 && intent.payment_method_types[0] === method && !intent.on_behalf_of &&
        (direct ? !intent.transfer_data : providerId(intent.transfer_data?.destination) === p.stripeConnectedAccountId));
      metadata(intent.metadata, p, c, identity);
      const chargeId = providerId(intent.latest_charge);
      check(!p.stripeChargeId || p.stripeChargeId === chargeId);
      if (chargeId) {
        const charge = await reader.charges.retrieve(chargeId, {}, options);
        check(charge.id === chargeId && charge.object === "charge" && charge.livemode === session.livemode && charge.currency === "usd" &&
          charge.amount === p.totalChargedCents && providerId(charge.payment_intent) === intentId && charge.payment_method_details?.type === method);
      }
    }
    return await withAdminMutation(operator, request.businessId, async tx => {
      const current = await lockedSnapshot(tx, request, identity);
      // A webhook, operator or administrator may have changed history while we read.
      // Retry inspection rather than applying a stale proof to any changed record.
      check(isDeepStrictEqual(version(current), version(before)));
      const { p, c } = current;
      const changed = !p.stripeCheckoutSessionId || !c.stripeCheckoutSessionId || !c.paymentId;
      if (apply) {
        if (!p.stripeCheckoutSessionId) {
          const write = await tx.payment.updateMany({ where: { id: p.id, businessId: p.businessId, checkoutAttemptId: c.id,
            status: p.status, stripeCheckoutSessionId: null, stripePaymentIntentId: p.stripePaymentIntentId, stripeChargeId: p.stripeChargeId },
            data: { stripeCheckoutSessionId: request.stripeSessionId } });
          check(write.count === 1);
        }
        if (!c.stripeCheckoutSessionId || !c.paymentId) {
          const write = await tx.checkoutSession.updateMany({ where: { id: c.id, businessId: c.businessId, paymentId: c.paymentId, stripeCheckoutSessionId: c.stripeCheckoutSessionId },
            data: { paymentId: p.id, stripeCheckoutSessionId: request.stripeSessionId } });
          check(write.count === 1);
        }
        const auditId = "checkout-recovery-" + createHash("sha256").update(p.id + ":" + request.stripeSessionId).digest("hex");
        if (!await tx.auditLog.findUnique({ where: { id: auditId } })) await tx.auditLog.create({ data: {
          id: auditId, businessId: p.businessId, actorType: "ADMIN", actorId: operator.adminAccessId, action: "ORIGINAL_CHECKOUT_IDENTITY_VERIFIED",
          targetType: "PAYMENT", targetId: p.id, summary: "Original Checkout identity verified; lifecycle remains webhook-authoritative.",
          metadata: { checkoutAttemptId: c.id, stripeSessionId: request.stripeSessionId, chargeModel: p.chargeModel,
            stripePlatformAccountId: identity.platformAccountId, stripeConnectedAccountId: p.stripeConnectedAccountId, stripeMode: identity.mode,
            restoredMissingPointers: changed, originalCreationKey: `rfl-payment-${p.id}` },
        } });
      }
      return { kind: apply ? changed ? "RESTORED" as const : "ALREADY_LINKED" as const : "VERIFIED_PREVIEW" as const,
        ...request, chargeModel: p.chargeModel, providerStatus: session.status, providerPaymentStatus: session.payment_status,
        providerIntentObserved: !!intentId, localPaymentStatus: p.status, settlementAuthority: "SIGNED_WEBHOOK" as const };
    });
  } catch { throw new OriginalCheckoutRecoveryBlocked(); }
}
