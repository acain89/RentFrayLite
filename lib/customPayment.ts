import { priceRflDirectV1 } from "@/lib/rflDirectPricing";
import { isDirectCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import type { CheckoutSession, PaymentMethod } from "@prisma/client";
import { getPlatformFeeCents } from "@/lib/checkoutPricing";
import { MAX_PAYMENT_AMOUNT_CENTS } from "@/lib/platformFees";

/** Dollar text only: no floating-point multiplication, coercion or rounding. */
export function parseCustomPaymentAmount(value: unknown): number {
  if (typeof value !== "string" || value.trim() !== value || !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(value)) {
    throw new RangeError("Enter an amount from $1.00 to $5,000.00 with at most two decimal places.");
  }
  const [dollars, fraction = ""] = value.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > MAX_PAYMENT_AMOUNT_CENTS) {
    throw new RangeError("Custom Payments must be between $1.00 and $5,000.00.");
  }
  return cents;
}

export function quoteCustomPayment(amountCents: number, paymentMethod: PaymentMethod, chargeModel: "LEGACY_DESTINATION" | "DIRECT" = "LEGACY_DESTINATION") {
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > MAX_PAYMENT_AMOUNT_CENTS ||
      (paymentMethod !== "ACH" && paymentMethod !== "CARD")) throw new RangeError("Invalid Custom Payment.");
  if (chargeModel !== "LEGACY_DESTINATION" && chargeModel !== "DIRECT") throw Error("Unsupported quote architecture.");
  const platformFeeCents = chargeModel === "DIRECT"
    ? priceRflDirectV1({ managementOwedCents: amountCents, paymentMethod }).tenantProcessingFeeCents
    : getPlatformFeeCents(paymentMethod, amountCents);
  return {
    baseAmountCents: amountCents, recurringChargesCents: 0, initialLateFeeCents: 0, dailyLateFeesCents: 0,
    subtotalCents: amountCents, platformFeeCents, totalCents: amountCents + platformFeeCents,
    lineItems: [
      { type: "CUSTOM_PAYMENT", label: "Custom Payment", amountCents },
      { type: "PLATFORM_FEE", label: chargeModel === "DIRECT" ? (paymentMethod === "ACH" ? "ACH processing fee" : "Card processing fee") : paymentMethod === "ACH" ? "Platform service fee — bank account" : "Platform service fee — card", amountCents: platformFeeCents },
    ],
  };
}

/** No checkout type can borrow the other's tier/calendar shape. */
export function assertCheckoutSource(checkout: CheckoutSession): void {
  if (checkout.sourceType === "CUSTOM_PAYMENT") {
    if (checkout.planId !== null || checkout.billingCycle !== null || checkout.dueDate !== null || checkout.graceEndsAt !== null ||
        checkout.recurringChargesCents !== 0 || checkout.initialLateFeeCents !== 0 || checkout.dailyLateFeesCents !== 0 ||
        checkout.baseAmountCents !== checkout.subtotalCents) throw Error("Invalid Custom Payment snapshot.");
  } else if (checkout.sourceType !== "RECURRING_PLAN" || !checkout.planId || !checkout.billingCycle || !checkout.dueDate || !checkout.graceEndsAt) {
    throw Error("Invalid standard payment snapshot.");
  } else if (Array.isArray(checkout.lineItems) && checkout.lineItems.some(item => item && typeof item === "object" && !Array.isArray(item) && item.type === "CUSTOM_PAYMENT")) {
    throw Error("Custom Payment items cannot be used for standard rent.");
  }
}

/** Recompute from the stored entered amount; never accept submitted totals. */
export function assertCustomPaymentQuote(checkout: CheckoutSession): void {
  assertCheckoutSource(checkout);
  if (checkout.sourceType !== "CUSTOM_PAYMENT") throw Error("Wrong checkout type.");
  if (checkout.chargeModel === "DIRECT" && !isDirectCheckoutArchitecture(checkout)) throw Error("Invalid direct quote snapshot.");
  const expected = quoteCustomPayment(checkout.baseAmountCents, checkout.paymentMethod, checkout.chargeModel === "DIRECT" ? "DIRECT" : "LEGACY_DESTINATION");
  if (checkout.subtotalCents !== expected.subtotalCents || checkout.platformFeeCents !== expected.platformFeeCents ||
      checkout.totalCents !== expected.totalCents || !Array.isArray(checkout.lineItems) || checkout.lineItems.length !== 2 ||
      checkout.lineItems.some((item, index) => !item || typeof item !== "object" || Array.isArray(item) ||
        item.type !== expected.lineItems[index].type || item.label !== expected.lineItems[index].label ||
        item.amountCents !== expected.lineItems[index].amountCents)) throw Error("Custom Payment quote changed. Begin a new checkout and review the amount.");
}
