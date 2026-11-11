import { isDeepStrictEqual } from "node:util";
import type { CheckoutSession, Prisma } from "@prisma/client";
import { selectedCheckoutChargeModel, directQuoteIssuanceEnabled } from "@/lib/paymentArchitecturePolicy";
import { legacyCheckoutArchitecture, isDirectCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { prepareDirectCheckoutQuote } from "@/lib/directPaymentFoundation";
import { assertCustomPaymentQuote } from "@/lib/customPayment";
import { priceRflDirectV1 } from "@/lib/rflDirectPricing";
import { getCheckoutCalendar, loadCurrentCheckoutPlan, CheckoutCalendarError } from "@/lib/checkoutCalendar";
import { getFinancialState } from "@/lib/financialState";

type LegacyPricing = { subtotalCents: number; platformFeeCents: number };
type LegacyInput<T extends LegacyPricing> = { chargeModel: "LEGACY_DESTINATION"; connectedAccountId: string; quote: () => T };
type DirectArchitecture = Pick<ReturnType<typeof prepareDirectCheckoutQuote>, "pricingVersion" | "chargeModel" | "stripePlatformAccountId" | "stripeConnectedAccountId" | "stripeMode" | "expectedStripeProcessingFeeCents" | "rflApplicationFeeCents" | "expectedManagementNetCents">;
type DirectInput = { chargeModel: "DIRECT"; report: Parameters<typeof prepareDirectCheckoutQuote>[0]; input: Parameters<typeof prepareDirectCheckoutQuote>[1] };

/** Public issuance is deliberately legacy-only. No request field or environment
 * toggle can opt into the dormant direct preparation branch. */
export function publicQuoteArchitecture(connectedAccountId: string): Omit<LegacyInput<LegacyPricing>, "quote"> {
  if (selectedCheckoutChargeModel() !== "LEGACY_DESTINATION" || directQuoteIssuanceEnabled()) throw Error("Direct quote issuance is disabled.");
  return { chargeModel: "LEGACY_DESTINATION", connectedAccountId };
}

export function prepareVersionedCheckoutQuote<T extends LegacyPricing>(input: LegacyInput<T>): { pricing: T; architecture: ReturnType<typeof legacyCheckoutArchitecture> };
export function prepareVersionedCheckoutQuote(input: DirectInput): { pricing: ReturnType<typeof prepareDirectCheckoutQuote>; architecture: DirectArchitecture };
/** Trusted server preparation only; never an HTTP/test-mode bypass. Direct
 * preparation remains unissued data until deliberately integrated and activated. */
export function prepareVersionedCheckoutQuote<T extends LegacyPricing>(input: LegacyInput<T> | DirectInput) {
  if (input.chargeModel === "LEGACY_DESTINATION") {
    const pricing = input.quote();
    return { pricing, architecture: legacyCheckoutArchitecture(input.connectedAccountId, pricing.subtotalCents, pricing.platformFeeCents) };
  }
  if (input.chargeModel !== "DIRECT") throw Error("Unsupported quote architecture.");
  const pricing = prepareDirectCheckoutQuote(input.report, input.input);
  const { pricingVersion, chargeModel, stripePlatformAccountId, stripeConnectedAccountId, stripeMode, expectedStripeProcessingFeeCents, rflApplicationFeeCents, expectedManagementNetCents } = pricing;
  return { pricing, architecture: Object.freeze({ pricingVersion, chargeModel, stripePlatformAccountId, stripeConnectedAccountId, stripeMode, expectedStripeProcessingFeeCents, rflApplicationFeeCents, expectedManagementNetCents }) };
}

/** Local review validation only, NOT provider eligibility or authorization to
 * reserve a payment. Reserved snapshots are never repriced. Package 3 must
 * revalidate under reservation locks using fresh direct ownership evidence. */
export async function assertCurrentVersionedReviewQuote(tx: Prisma.TransactionClient, checkout: CheckoutSession, now: Date): Promise<void> {
  if (checkout.paymentId || checkout.chargeModel !== "DIRECT") return;
  const changed = () => { throw new CheckoutCalendarError("QUOTE_CHANGED", "Payment quote changed. Begin a new checkout and review the updated summary."); };
  if (!isDirectCheckoutArchitecture(checkout)) changed();
  const price = priceRflDirectV1({ managementOwedCents: checkout.subtotalCents, paymentMethod: checkout.paymentMethod });
  if (checkout.platformFeeCents !== price.tenantProcessingFeeCents || checkout.totalCents !== price.tenantTotalCents ||
      checkout.expectedStripeProcessingFeeCents !== price.expectedStripeProcessingFeeCents || checkout.rflApplicationFeeCents !== price.rflApplicationFeeCents) changed();
  if (checkout.sourceType === "CUSTOM_PAYMENT") { assertCustomPaymentQuote(checkout); return; }
  const property = await tx.business.findUnique({ where: { id: checkout.businessId } });
  if (!property || !property.isActive || property.status !== "ACTIVE" || property.accountCode !== checkout.accountCode) changed();
  const calendar = getCheckoutCalendar(property!, now);
  const plan = await loadCurrentCheckoutPlan(tx, checkout.businessId, checkout.planId!);
  const state = getFinancialState({ plan, now, propertyTimeZone: calendar.kind === "LOCAL" ? calendar.timeZone : undefined });
  const fields = ["billingCycle", "baseAmountCents", "recurringChargesCents", "initialLateFeeCents", "dailyLateFeesCents", "subtotalCents"] as const;
  const items = [...state.lineItems, { type: "PLATFORM_FEE", label: checkout.paymentMethod === "ACH" ? "ACH processing fee" : "Card processing fee", amountCents: price.tenantProcessingFeeCents }];
  if (fields.some(field => checkout[field] !== state[field]) || checkout.dueDate?.getTime() !== state.calendar.dueDate.getTime() ||
      checkout.graceEndsAt?.getTime() !== state.calendar.graceEndsAt.getTime() || !isDeepStrictEqual(checkout.lineItems, items)) changed();
}
