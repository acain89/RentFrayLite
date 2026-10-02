import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getPaymentReadiness, type ReadinessBusiness, type StripeReadinessFacts } from "@/lib/paymentReadiness";

export const readinessBusinessInclude = {
  stripeConnection: true,
  recurringPlans: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const }, include: {
    charges: { where: { isActive: true }, orderBy: { sortOrder: "asc" as const } },
  } },
};

export function getStripeMode(): "live" | "test" | "unknown" {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (/^[sr]k_live_.+/.test(key)) return "live";
  if (/^[sr]k_test_.+/.test(key)) return "test";
  return "unknown";
}

export async function readStripeReadinessFacts(stripeAccountId: string): Promise<{ facts: StripeReadinessFacts; account: Stripe.Account }> {
  const stripe = getStripeClient();
  const options = { timeout: 5000, maxNetworkRetries: 0 };
  const [account, platform, configurations] = await Promise.all([
    stripe.accounts.retrieve(stripeAccountId, options),
    stripe.accounts.retrieve(options),
    stripe.paymentMethodConfigurations.list({ limit: 100 }, options),
  ]);
  if (Object.hasOwn(account, "deleted") || Object.hasOwn(platform, "deleted") || account.id !== stripeAccountId) throw new Error("Stripe account unavailable");
  const defaults = configurations.data.filter((entry) => entry.is_default && !entry.application);
  const configuration = defaults.length === 1 && !configurations.has_more &&
    defaults[0].livemode === (getStripeMode() === "live") ? defaults[0] : null;
  const restricted = Boolean(account.requirements?.disabled_reason || account.requirements?.past_due?.length || account.requirements?.currently_due?.length);
  return { account, facts: {
    connected: true, onboardingComplete: account.details_submitted,
    chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled,
    transfersActive: account.capabilities?.transfers === "active", restricted,
    platformChargesEnabled: platform.charges_enabled && !platform.requirements?.disabled_reason,
    cardAvailable: Boolean(configuration?.active && configuration.card?.available),
    achAvailable: Boolean(configuration?.active && configuration.us_bank_account?.available),
    destinationSupported: account.country === platform.country,
  } };
}

export async function getBusinessPaymentReadiness(business: ReadinessBusiness & { stripeConnection: { stripeAccountId: string } | null }, planId?: string) {
  let facts: StripeReadinessFacts | null = null;
  if (!business.stripeConnection) facts = {
    connected: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false,
    transfersActive: false, restricted: false, platformChargesEnabled: false,
    cardAvailable: false, achAvailable: false, destinationSupported: false,
  };
  else {
    try { facts = (await readStripeReadinessFacts(business.stripeConnection.stripeAccountId)).facts; }
    catch { /* Fail closed; stale persisted readiness must not authorize money. */ }
  }
  return getPaymentReadiness(business, facts, getStripeMode(), process.env.NODE_ENV === "production", planId);
}

export async function loadBusinessPaymentReadiness(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: readinessBusinessInclude });
  if (!business) return null;
  return { business, readiness: await getBusinessPaymentReadiness(business) };
}
