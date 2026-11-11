import type { CheckoutSession, PaymentMethod, Prisma } from "@prisma/client";
import { getFirstStandardBillingDate, getStandardCheckoutEligibility, validatePropertyTimeZone } from "@/lib/propertyBillingCalendar";
import { calculateCheckoutPricing, type CheckoutPricingPlan, type CheckoutPricingResult } from "@/lib/checkoutPricing";

type PropertyCalendar = {
  propertyTimeZone?: string | null;
  firstStandardBillingDate?: Date | null;
  createdAt?: Date;
};

export class CheckoutCalendarError extends Error {
  constructor(public readonly code: "CALENDAR_CONFIGURATION" | "BEFORE_FIRST_CYCLE" | "QUOTE_CHANGED", message: string) { super(message); }
}

/** Only two explicit database NULLs authorize the legacy fallback. Undefined
 * fields (including a stale generated client) must not bypass activation. */
export function getCheckoutCalendar(property: PropertyCalendar, now: Date): { kind: "LEGACY" } | { kind: "LOCAL"; timeZone: string } {
  if (property.propertyTimeZone === null && property.firstStandardBillingDate === null) return { kind: "LEGACY" };
  try {
    if (property.propertyTimeZone == null || property.firstStandardBillingDate == null || !property.createdAt) throw Error("Incomplete calendar");
    const timeZone = validatePropertyTimeZone(property.propertyTimeZone);
    const eligibility = getStandardCheckoutEligibility(property, now);
    if (eligibility.reason === "CALENDAR_UNCONFIGURED" ||
        eligibility.firstStandardBillingDate !== getFirstStandardBillingDate(property.createdAt, timeZone)) throw Error("Inconsistent first cycle");
    if (!eligibility.eligible) {
      const label = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" })
        .format(property.firstStandardBillingDate);
      throw new CheckoutCalendarError("BEFORE_FIRST_CYCLE", `Standard rent payments become available on ${label} (${timeZone}).`);
    }
    return { kind: "LOCAL", timeZone };
  } catch (error) {
    if (error instanceof CheckoutCalendarError) throw error;
    throw new CheckoutCalendarError("CALENDAR_CONFIGURATION", "This property's billing calendar needs attention. Please contact management.");
  }
}

export function quoteStandardCheckout(property: PropertyCalendar, plan: CheckoutPricingPlan, paymentMethod: PaymentMethod, now: Date) {
  const calendar = getCheckoutCalendar(property, now);
  try {
    return calculateCheckoutPricing({ plan, paymentMethod, now,
      propertyTimeZone: calendar.kind === "LOCAL" ? calendar.timeZone : undefined });
  } catch (error) {
    if (calendar.kind === "LEGACY") throw error;
    throw new CheckoutCalendarError("CALENDAR_CONFIGURATION", "This property's billing rules need attention. Please contact management.");
  }
}

export async function loadCurrentCheckoutPlan(tx: Prisma.TransactionClient, businessId: string, planId: string) {
  const plan = await tx.recurringPlan.findFirst({ where: { id: planId, businessId, isActive: true }, include: {
    charges: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
  } });
  if (!plan) throw new CheckoutCalendarError("CALENDAR_CONFIGURATION", "This rent tier is no longer available. Please begin a new checkout.");
  return plan;
}

function sameItems(stored: unknown, expected: CheckoutPricingResult["lineItems"]): boolean {
  return Array.isArray(stored) && stored.length === expected.length && stored.every((item, index) =>
    item !== null && typeof item === "object" && item.type === expected[index].type &&
    item.label === expected[index].label && item.amountCents === expected[index].amountCents);
}

/** Unstarted quotes are compared, never rewritten. Existing Payment records are
 * immutable attempts: resumption is handled by checkoutRetry's ownership checks. */
export async function assertCurrentCheckoutQuote(tx: Prisma.TransactionClient, property: PropertyCalendar,
  checkout: CheckoutSession, now: Date): Promise<void> {
  if (getCheckoutCalendar(property, now).kind === "LEGACY") return;
  const plan = await loadCurrentCheckoutPlan(tx, checkout.businessId, checkout.planId!);
  const quote = quoteStandardCheckout(property, plan, checkout.paymentMethod, now);
  const scalarFields = ["billingCycle", "baseAmountCents", "recurringChargesCents", "initialLateFeeCents", "dailyLateFeesCents", "subtotalCents", "platformFeeCents"] as const;
  if (scalarFields.some(field => checkout[field] !== quote[field]) || checkout.totalCents !== quote.totalChargedCents ||
      checkout.dueDate?.getTime() !== quote.dueDate.getTime() || checkout.graceEndsAt?.getTime() !== quote.graceEndsAt.getTime() ||
      !sameItems(checkout.lineItems, quote.lineItems)) {
    throw new CheckoutCalendarError("QUOTE_CHANGED", "Billing amounts or dates have changed. Begin a new checkout and review the updated summary. This request did not create a new payment.");
  }
}
