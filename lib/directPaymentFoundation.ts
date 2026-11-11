import { isDeepStrictEqual } from "node:util";
import type { Business, CheckoutSession, Payment, PaymentMethod, Prisma } from "@prisma/client";
import { priceRflDirectV1 } from "@/lib/rflDirectPricing";
import { verifiedDirectOwnership, type DirectReadinessReport } from "@/lib/stripeDirectReadiness";
import { resolveStripePaymentContext, type StripePaymentIdentity } from "@/lib/stripePaymentContext";
import { isDirectCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { assertCheckoutSource, parseCustomPaymentAmount } from "@/lib/customPayment";
import type Stripe from "stripe";
import { getFinancialState, type FinancialStatePlan } from "@/lib/financialState";
import { getCheckoutCalendar } from "@/lib/checkoutCalendar";
import { directPaymentMatchesCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { stripePaymentRequestOptions } from "@/lib/stripePaymentContext";
import { normalizeStripeLineItems, isStripeCheckoutTransportWithinLimit } from "@/lib/stripeCheckoutTransport";
import { directPaymentCreationEnabled } from "@/lib/paymentArchitecturePolicy";

/** DORMANT data preparation only. No active route imports this module; the
 * executor below is hard-disabled. Preparation performs no external calls/writes. */
export function prepareDirectCheckoutOwnership(report: DirectReadinessReport, input: {
  identity: StripePaymentIdentity; connectedAccountId: string; checkoutAttemptId: string;
  managementOwedCents: number; paymentMethod: PaymentMethod;
}) {
  if (!input.checkoutAttemptId || input.checkoutAttemptId.length > 100) throw Error("A durable server checkout attempt ID is required.");
  const owner = verifiedDirectOwnership(report, input.identity, input.connectedAccountId);
  const pricing = priceRflDirectV1({ managementOwedCents: input.managementOwedCents, paymentMethod: input.paymentMethod });
  const snapshot = Object.freeze({ pricingVersion: pricing.pricingVersion, chargeModel: "DIRECT" as const,
    stripePlatformAccountId: owner.platformAccountId, stripeConnectedAccountId: owner.connectedAccountId, stripeMode: owner.mode,
    expectedStripeProcessingFeeCents: pricing.expectedStripeProcessingFeeCents, rflApplicationFeeCents: pricing.rflApplicationFeeCents,
    expectedManagementNetCents: pricing.expectedManagementNetCents });
  resolveStripePaymentContext(snapshot, input.identity);
  return Object.freeze({ checkoutAttemptId: input.checkoutAttemptId, snapshot, pricing });
}

/** Future payment creation must copy the persisted checkout's ownership and
 * snapshots, not today's connection. Returns data, never creates a payment. */
export function prepareDirectPaymentRecord(checkout: CheckoutSession, report: DirectReadinessReport, identity: StripePaymentIdentity): Prisma.PaymentUncheckedCreateInput {
  assertCheckoutSource(checkout);
  const prepared = prepareDirectCheckoutOwnership(report, { identity, connectedAccountId: checkout.stripeConnectedAccountId ?? "", checkoutAttemptId: checkout.id,
    managementOwedCents: checkout.subtotalCents, paymentMethod: checkout.paymentMethod });
  if (checkout.paymentId || !isDirectCheckoutArchitecture(checkout) || checkout.platformFeeCents !== prepared.pricing.tenantProcessingFeeCents ||
      checkout.totalCents !== prepared.pricing.tenantTotalCents || Object.entries(prepared.snapshot).some(([key, value]) => checkout[key as keyof CheckoutSession] !== value)) {
    throw Error("Direct checkout ownership or financial snapshot changed.");
  }
  let total = 0, fees = 0;
  if (!Array.isArray(checkout.lineItems)) throw Error("Invalid direct snapshot.");
  for (const item of checkout.lineItems) {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.amountCents !== "number" || !Number.isSafeInteger(item.amountCents) || item.amountCents < 0) throw Error("Invalid direct snapshot.");
    total += item.amountCents;
    if (item.type === "PLATFORM_FEE") { fees++; if (item.amountCents !== checkout.platformFeeCents) throw Error("Direct fee mismatch."); }
  }
  if (!Number.isSafeInteger(total) || total !== checkout.totalCents || fees !== 1) throw Error("Direct line items do not reconcile.");
  const { expectedManagementNetCents, ...paymentArchitecture } = prepared.snapshot;
  return { businessId: checkout.businessId, checkoutAttemptId: checkout.id, sourceType: checkout.sourceType, sourceId: checkout.planId,
    status: "CREATED", paymentMethod: checkout.paymentMethod, payerFirstName: checkout.firstName, payerLastName: checkout.lastName,
    payerPhone: checkout.phone, referenceLabel: checkout.unitNumber, itemDescription: checkout.sourceType === "CUSTOM_PAYMENT" ? "Custom Payment" : "Rent payment",
    lineItemsSnapshot: checkout.lineItems as Prisma.InputJsonValue, subtotalCents: checkout.subtotalCents, platformFeeCents: checkout.platformFeeCents,
    totalChargedCents: checkout.totalCents, businessProceedsCents: expectedManagementNetCents, billingCycle: checkout.billingCycle,
    ...paymentArchitecture };
}

type DirectProperty = Pick<Business, "id" | "accountCode" | "createdAt" | "propertyTimeZone" | "firstStandardBillingDate">;
type DirectSource = { sourceType: "CUSTOM_PAYMENT"; amount: unknown } |
  { sourceType: "RECURRING_PLAN"; plan: FinancialStatePlan & { businessId: string; isActive: boolean } };

/** Server inputs only. Does not accept tenant-submitted fees, ownership or dates.
 * getFinancialState remains the standard obligation authority; only the surcharge
 * comes from RFL_DIRECT_V1. Custom Payments never evaluate a billing calendar. */
export function prepareDirectCheckoutQuote(report: DirectReadinessReport, input: {
  property: DirectProperty; source: DirectSource; paymentMethod: PaymentMethod; now: Date;
  identity: StripePaymentIdentity; connectedAccountId: string; checkoutAttemptId: string;
}) {
  const { property, source, paymentMethod, now } = input;
  if (!property.id || !property.accountCode || !Number.isFinite(now.getTime())) throw Error("Invalid server quote context.");
  let obligation;
  if (source.sourceType === "CUSTOM_PAYMENT") {
    const amount = parseCustomPaymentAmount(source.amount);
    obligation = { planId: null, billingCycle: null, dueDate: null, graceEndsAt: null,
      baseAmountCents: amount, recurringChargesCents: 0, initialLateFeeCents: 0, dailyLateFeesCents: 0, subtotalCents: amount,
      lineItems: [{ type: "CUSTOM_PAYMENT", label: "Custom Payment", amountCents: amount }] };
  } else if (source.sourceType === "RECURRING_PLAN") {
    if (source.plan.businessId !== property.id || source.plan.isActive !== true) throw Error("Tier ownership or availability changed.");
    const calendar = getCheckoutCalendar(property, now);
    const state = getFinancialState({ plan: source.plan, now, propertyTimeZone: calendar.kind === "LOCAL" ? calendar.timeZone : undefined });
    obligation = { planId: source.plan.id, billingCycle: state.billingCycle, dueDate: state.calendar.dueDate, graceEndsAt: state.calendar.graceEndsAt,
      baseAmountCents: state.baseAmountCents, recurringChargesCents: state.recurringChargesCents, initialLateFeeCents: state.initialLateFeeCents,
      dailyLateFeesCents: state.dailyLateFeesCents, subtotalCents: state.subtotalCents, lineItems: state.lineItems };
  } else throw Error("Unsupported checkout source.");
  const prepared = prepareDirectCheckoutOwnership(report, { ...input, managementOwedCents: obligation.subtotalCents });
  const { lineItems, ...amounts } = obligation;
  return Object.freeze({ id: input.checkoutAttemptId, businessId: property.id, accountCode: property.accountCode, sourceType: source.sourceType,
    paymentMethod, ...amounts, platformFeeCents: prepared.pricing.tenantProcessingFeeCents, totalCents: prepared.pricing.tenantTotalCents,
    ...prepared.snapshot, lineItems: Object.freeze([...lineItems,
      { type: "PLATFORM_FEE", label: paymentMethod === "ACH" ? "ACH processing fee" : "Card processing fee", amountCents: prepared.pricing.tenantProcessingFeeCents },
    ].map(item => Object.freeze({ ...item }))) });
}

/** Unreserved review quotes are rejected, never silently rewritten. A future
 * authenticated reservation must call this under its business/attempt lock.
 * Reserved payments instead keep their original amounts and use the builder below. */
export function assertCurrentDirectCheckoutQuote(checkout: CheckoutSession, report: DirectReadinessReport,
  input: Parameters<typeof prepareDirectCheckoutQuote>[1]): void {
  if (checkout.paymentId || input.checkoutAttemptId !== checkout.id) throw Error("Only the original unreserved checkout can be revalidated.");
  const expected = prepareDirectCheckoutQuote(report, input);
  for (const [field, value] of Object.entries(expected)) {
    if (!isDeepStrictEqual(checkout[field as keyof CheckoutSession], value)) throw Error("Direct quote changed. Begin a new checkout and review the updated summary.");
  }
}

/** Request preparation for an ALREADY durably reserved payment. No reservation,
 * DB writes or provider calls occur here. Account scope and key are derived from
 * immutable records, never current business connection or request parameters. */
export function prepareDirectCheckoutRequest(checkout: CheckoutSession, payment: Payment, report: DirectReadinessReport,
  identity: StripePaymentIdentity, origin: string, now: Date) {
  const age = now.getTime() - payment.createdAt.getTime();
  if (checkout.status !== "REVIEWED" || !checkout.paymentId || checkout.paymentId !== payment.id || payment.status !== "CREATED" ||
      payment.stripeCheckoutSessionId || payment.stripePaymentIntentId || payment.stripeChargeId || checkout.stripeCheckoutSessionId ||
      !Number.isFinite(age) || age < 0 || age >= 23 * 60 * 60 * 1000 || !directPaymentMatchesCheckoutArchitecture(payment, checkout)) {
    throw Error("Direct attempt is not safely creatable. Recover the original provider state; never replace the payment.");
  }
  // Reuse foundation validation without recalculating the obligation/calendar.
  // Persisted pricing version determines the fee engine; reserved amounts stay fixed.
  const expected = prepareDirectPaymentRecord({ ...checkout, paymentId: null }, report, identity);
  for (const [field, value] of Object.entries(expected)) {
    if (!isDeepStrictEqual(payment[field as keyof Payment], value)) throw Error("Direct payment snapshot mismatch.");
  }
  const url = new URL(origin);
  if ((url.protocol !== "https:" && !(identity.mode === "test" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") throw Error("A trusted application origin is required.");
  const items = normalizeStripeLineItems(payment.lineItemsSnapshot);
  if (!items || !isStripeCheckoutTransportWithinLimit(items) || items.reduce((sum, item) => sum + item.price_data.unit_amount, 0) !== payment.totalChargedCents) throw Error("Direct Stripe items do not reconcile.");
  const context = resolveStripePaymentContext(payment, identity);
  const metadata = { product: "RentFrayLite", paymentId: payment.id, checkoutSessionId: checkout.id, checkoutAttemptId: checkout.id,
    businessId: payment.businessId, accountCode: checkout.accountCode, sourceType: payment.sourceType,
    billingCycle: payment.billingCycle ?? "", pricingVersion: payment.pricingVersion!, chargeModel: "DIRECT",
    stripePlatformAccountId: context.platformAccountId, stripeConnectedAccountId: context.connectedAccountId, stripeMode: context.mode };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment", payment_method_types: [payment.paymentMethod === "ACH" ? "us_bank_account" : "card"],
    line_items: items, client_reference_id: payment.id, metadata,
    success_url: `${url.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}&accountCode=${encodeURIComponent(checkout.accountCode)}`,
    cancel_url: `${url.origin}/${encodeURIComponent(checkout.accountCode)}/review?session=${encodeURIComponent(checkout.id)}`,
    payment_intent_data: { application_fee_amount: payment.rflApplicationFeeCents!, metadata },
  };
  const options: Stripe.RequestOptions = { ...stripePaymentRequestOptions(context), idempotencyKey: `rfl-payment-${payment.id}`, timeout: 5000, maxNetworkRetries: 0 };
  // Explicit single-method Checkout: do not combine dynamic configuration selection
  // with payment_method_types. Readiness has verified the scoped default config.
  const freeze = (value: object): void => { for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child); Object.freeze(value); };
  freeze(params); freeze(options);
  return Object.freeze({ params, options });
}

/** Permanently disabled production entry point. No active route imports this
 * module. Enabling execution requires a reviewed policy code change AND future
 * reservation/browser-binding/ownership-aware lifecycle integration. */
export async function createDirectCheckoutSession(stripe: Stripe, ...input: Parameters<typeof prepareDirectCheckoutRequest>): Promise<Stripe.Checkout.Session> {
  if (!directPaymentCreationEnabled()) throw Error("Direct-charge creation is disabled.");
  const request = prepareDirectCheckoutRequest(...input);
  return stripe.checkout.sessions.create(request.params, request.options);
}
