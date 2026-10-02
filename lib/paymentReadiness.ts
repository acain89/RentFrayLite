import type { Business, RecurringPlan, RecurringCharge } from "@prisma/client";
import { isValidBillingCycle } from "@/lib/billingCalendar";
import { validateRecurringPaymentConfiguration } from "@/lib/recurringValidation";

export type ReadinessBusiness = Pick<Business, "id" | "name" | "isActive" | "status" | "accountCode" | "setupCompletedAt"> & {
  recurringPlans: (Pick<RecurringPlan, "id" | "name" | "isActive" | "baseAmountCents" | "dueDay" | "gracePeriodDays" | "initialLateFeeCents" | "dailyLateFeeCents" | "dailyLateFeeMaxDays"> & {
    charges: Pick<RecurringCharge, "label" | "amountCents" | "isActive" | "effectiveBillingCycle" | "endsAfterBillingCycle">[];
  })[];
};
export type ReadinessReason = { code: string; message: string; route: string };
export type StripeReadinessFacts = {
  connected: boolean; onboardingComplete: boolean; chargesEnabled: boolean;
  payoutsEnabled: boolean; transfersActive: boolean; restricted: boolean;
  platformChargesEnabled: boolean; cardAvailable: boolean; achAvailable: boolean;
  destinationSupported: boolean;
};
export type PaymentReadiness = {
  ready: boolean; readyForLive: boolean; mode: "live" | "test" | "unknown";
  configurationReady: boolean; canChooseAccountCode: boolean;
  reasons: ReadinessReason[]; title: string; actionRoute: string;
};

const reason = (code: string, message: string, route: string): ReadinessReason => ({ code, message, route });
const integer = (value: number, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const cycle = (value: string | null) => value === null || isValidBillingCycle(value);

export function getConfigurationReasons(business: ReadinessBusiness): ReadinessReason[] {
  const reasons: ReadinessReason[] = [];
  if (!business.id || business.name.trim().length < 2 || !business.isActive || business.status === "DISABLED") {
    reasons.push(reason("BUSINESS_UNAVAILABLE", "Your business account needs attention.", "/manager/settings"));
  }
  const plans = business.recurringPlans.filter((plan) => plan.isActive);
  if (!plans.length) reasons.push(reason("NO_USABLE_TIER", "Add an active rent tier with a positive amount.", "/setup/recurring/tiers"));
  for (const plan of plans) {
    if (!plan.id || !plan.name.trim() || !integer(plan.baseAmountCents, 1)) {
      reasons.push(reason("INVALID_PRICING", "Complete your rent tier pricing.", "/setup/recurring/tiers"));
    }
    if (!integer(plan.dueDay, 1) || plan.dueDay > 31 || !integer(plan.gracePeriodDays, 1) || plan.gracePeriodDays > 60 ||
        !integer(plan.initialLateFeeCents) || !integer(plan.dailyLateFeeCents) || !integer(plan.dailyLateFeeMaxDays) ||
        plan.dailyLateFeeMaxDays > 365 || (plan.dailyLateFeeCents > 0 ? plan.dailyLateFeeMaxDays < 1 : plan.dailyLateFeeMaxDays !== 0)) {
      reasons.push(reason("INVALID_BILLING", "Complete your billing dates and late-fee rules.", "/setup/recurring/billing"));
    }
    const charges = plan.charges.filter((charge) => charge.isActive);
    if (charges.some((charge) => !charge.label.trim() || !integer(charge.amountCents) ||
        !cycle(charge.effectiveBillingCycle) || !cycle(charge.endsAfterBillingCycle) ||
        (charge.effectiveBillingCycle && charge.endsAfterBillingCycle && charge.effectiveBillingCycle > charge.endsAfterBillingCycle))) {
      reasons.push(reason("INVALID_CHARGES", "Review your monthly charge amounts and billing cycles.", "/setup/recurring/charges"));
    }
    try {
      const validation = validateRecurringPaymentConfiguration({
      planName: plan.name, baseAmountCents: plan.baseAmountCents,
      recurringChargeCents: charges.reduce((sum, charge) => sum + charge.amountCents, 0),
      initialLateFeeCents: plan.initialLateFeeCents, dailyLateFeeCents: plan.dailyLateFeeCents,
      dailyLateFeeMaxDays: plan.dailyLateFeeMaxDays,
      });
      if (!validation.ok) reasons.push(reason("PRICING_LIMIT", validation.error, "/setup/recurring/tiers"));
    } catch {
      reasons.push(reason("INVALID_PRICING", "Review your rent tier and charge amounts.", "/setup/recurring/tiers"));
    }
  }
  return reasons.filter((entry, index) => reasons.findIndex((other) => other.code === entry.code) === index);
}

// Destination charges are processed by the platform. The connected account
// needs transfers; payment-method availability belongs to the platform.
export function getStripeReadinessReasons(facts: StripeReadinessFacts | null, mode: PaymentReadiness["mode"], production: boolean): ReadinessReason[] {
  const reasons: ReadinessReason[] = [];
  const add = (code: string, message: string) => reasons.push(reason(code, message, "/setup/stripe"));
  if (mode === "unknown") add("STRIPE_CONFIGURATION", "Payment service configuration needs attention. Contact support.");
  if (production && mode !== "live") add("LIVE_CONFIGURATION_REQUIRED", "Live payments are unavailable. Contact support.");
  if (!facts) { add("STRIPE_UNVERIFIED", "We couldn't check your payment account. Please try again."); return reasons; }
  if (!facts.connected) add("STRIPE_MISSING", "Connect your Stripe account.");
  else {
    if (!facts.onboardingComplete) add("STRIPE_ONBOARDING", "Finish your Stripe account setup.");
    if (facts.restricted) add("STRIPE_RESTRICTED", "Stripe needs your attention before payments can resume.");
    if (!facts.platformChargesEnabled) add("STRIPE_CHARGES", "Payments are currently unavailable. Review your Stripe setup.");
    if (!facts.payoutsEnabled || !facts.transfersActive || !facts.destinationSupported) add("STRIPE_DESTINATION", "Your Stripe account cannot currently receive customer funds. Review Stripe setup.");
    if (!facts.cardAvailable || !facts.achAvailable) add("STRIPE_PAYMENT_METHODS", "Card or bank payments are unavailable. Contact support.");
  }
  return reasons;
}

export function getPaymentReadiness(business: ReadinessBusiness, facts: StripeReadinessFacts | null, mode: PaymentReadiness["mode"], production: boolean, planId?: string): PaymentReadiness {
  const configurationReasons = getConfigurationReasons(business);
  const stripeReasons = getStripeReadinessReasons(facts, mode, production);
  const reasons = [...configurationReasons];
  if (!business.accountCode || !/^[A-Z]{2}-\d{4}$/.test(business.accountCode)) reasons.push(reason("ACCOUNT_CODE", "Choose your permanent account code.", "/setup/account-code"));
  if (business.status !== "ACTIVE") reasons.push(reason("SETUP_INCOMPLETE", "Finish your account setup.", "/setup/account-code"));
  if (planId && !business.recurringPlans.some((plan) => plan.isActive && plan.id === planId)) reasons.push(reason("TIER_UNAVAILABLE", "This rent tier is no longer available.", "/setup/recurring/tiers"));
  reasons.push(...stripeReasons);
  const ready = reasons.length === 0;
  const action = configurationReasons[0] ?? stripeReasons[0] ?? reasons[0];
  return {
    ready, readyForLive: ready && mode === "live", mode,
    configurationReady: configurationReasons.length === 0,
    canChooseAccountCode: configurationReasons.length === 0 && stripeReasons.length === 0,
    reasons, actionRoute: action?.route ?? "/manager/dashboard",
    title: ready ? (mode === "live" ? "Ready for live payments" : "Ready for test payments") :
      configurationReasons.length ? "Setup needs attention" : business.setupCompletedAt ? "Payments currently unavailable" : "Finish payment setup",
  };
}
