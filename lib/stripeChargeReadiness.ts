import type Stripe from "stripe";
import { getStripeReadinessReasons, type PaymentReadiness, type StripeReadinessFacts } from "@/lib/paymentReadiness";

type Mode = PaymentReadiness["mode"];
export type ChargeReadiness = {
  model: "LEGACY_DESTINATION" | "DIRECT";
  ready: boolean;
  status: "READY" | "NOT_READY" | "UNVERIFIED";
  reasonCodes: string[];
};

// Internal, server-sourced evidence only. Accounts v1 has no livemode field:
// accountMode comes from the authenticated read context, not account.type.
// Missing reads are null; persisted legacy readiness booleans are insufficient.
export type DirectReadinessEvidence = {
  accountMode: Mode;
  account: Pick<Stripe.Account, "id" | "country" | "default_currency" | "charges_enabled" |
    "payouts_enabled" | "details_submitted" | "capabilities" | "controller" | "requirements"> | null;
  paymentMethods: {
    accountId: string;
    mode: Mode;
    cardAvailable: boolean | null;
    achAvailable: boolean | null;
  } | null;
};

// The caller must resolve the configuration actually used by this platform's
// FUTURE connected-account Checkout request. Never pass the platform's config.
// This adapter does not perform API reads or establish account scope itself.
export function directPaymentMethodsFromConfiguration(
  accountId: string, configuration: Stripe.PaymentMethodConfiguration,
): NonNullable<DirectReadinessEvidence["paymentMethods"]> {
  const available = (value: boolean | undefined) => configuration.active === true ? value ?? null :
    configuration.active === false ? false : null;
  return {
    accountId, mode: configuration.livemode === true ? "live" : configuration.livemode === false ? "test" : "unknown",
    cardAvailable: available(configuration.card?.available),
    achAvailable: available(configuration.us_bank_account?.available),
  };
}

type CommonInput = { mode: Mode; production: boolean };
export type ChargeReadinessInput = CommonInput & (
  { model: "LEGACY_DESTINATION"; facts: StripeReadinessFacts | null } |
  { model: "DIRECT"; connectedAccountId: string | null; evidence: DirectReadinessEvidence | null }
);

export function evaluateStripeChargeReadiness(input: ChargeReadinessInput): ChargeReadiness {
  if (input.model === "LEGACY_DESTINATION") {
    const reasonCodes = getStripeReadinessReasons(input.facts, input.mode, input.production).map(reason => reason.code);
    return { model: input.model, ready: reasonCodes.length === 0,
      status: reasonCodes.length === 0 ? "READY" : !input.facts ? "UNVERIFIED" : "NOT_READY", reasonCodes };
  }
  const reasons = new Set<string>();
  const add = (code: string) => reasons.add(code);
  const unverified = () => add("DIRECT_CONFIGURATION_UNVERIFIED");
  if (input.mode === "unknown") add("STRIPE_CONFIGURATION");
  if (input.production && input.mode !== "live") add("LIVE_CONFIGURATION_REQUIRED");
  if (!input.connectedAccountId) add("NO_CONNECTED_ACCOUNT");
  else if (!/^acct_[A-Za-z0-9]+$/.test(input.connectedAccountId)) unverified();
  else {
    const evidence = input.evidence;
    const account = evidence?.account;
    if (!account) unverified();
    else {
      if (!account.id) unverified();
      else if (account.id !== input.connectedAccountId) add("ACCOUNT_MISMATCH");
      if (evidence.accountMode !== "live" && evidence.accountMode !== "test") unverified();
      else if (input.mode !== "unknown" && evidence.accountMode !== input.mode) add("MODE_MISMATCH");
      const check = (value: boolean | undefined, code: string) => {
        if (value === false) add(code); else if (value !== true) unverified();
      };
      check(account.charges_enabled, "CHARGES_NOT_ENABLED");
      // RFL rollout policy: funds must also be payable to management's bank.
      // This is stricter than the ability to create a Stripe charge in isolation.
      check(account.payouts_enabled, "PAYOUTS_NOT_ENABLED");
      check(account.details_submitted, "DETAILS_NOT_SUBMITTED");
      if (!account.country || !account.default_currency) unverified();
      else if (account.country !== "US" || account.default_currency !== "usd") add("DIRECT_REGION_UNSUPPORTED");
      for (const [value, code] of [
        [account.capabilities?.card_payments, "CARD_NOT_ENABLED"],
        [account.capabilities?.us_bank_account_ach_payments, "ACH_NOT_ENABLED"],
      ] as const) {
        if (value === "pending") add(code.replace("NOT_ENABLED", "PENDING"));
        else if (value === "inactive") add(code);
        else if (value !== "active") unverified();
      }
      const requirements = account.requirements;
      if (!requirements) unverified();
      else {
        if (requirements.disabled_reason) add("ACCOUNT_DISABLED");
        else if (requirements.disabled_reason !== null) unverified();
        for (const key of ["currently_due", "past_due", "pending_verification", "errors"] as const) {
          if (!Array.isArray(requirements[key])) unverified();
          else if (requirements[key].length) add("REQUIREMENTS_INCOMPLETE");
        }
      }
      // Explicit supported target policy, not an inference from Express/type.
      const controller = account.controller;
      const properties = [
        [controller?.fees?.payer, "account"], [controller?.losses?.payments, "stripe"],
        [controller?.requirement_collection, "stripe"], [controller?.stripe_dashboard?.type, "full"],
      ];
      for (const [actual, expected] of properties) {
        if (actual == null) unverified();
        else if (actual !== expected) add("DIRECT_CONFIGURATION_INCOMPATIBLE");
      }
      if (controller?.is_controller !== true || controller?.type !== "application") {
        if (controller?.is_controller == null || !controller?.type) unverified();
        else add("DIRECT_CONTROL_UNAVAILABLE");
      }
      const methods = evidence.paymentMethods;
      if (!methods) unverified();
      else {
        if (!methods.accountId) unverified();
        else if (methods.accountId !== input.connectedAccountId) add("ACCOUNT_MISMATCH");
        if (methods.mode !== "live" && methods.mode !== "test") unverified();
        else if (methods.mode !== evidence.accountMode || (input.mode !== "unknown" && methods.mode !== input.mode)) add("MODE_MISMATCH");
        check(methods.cardAvailable ?? undefined, "CARD_NOT_ENABLED");
        check(methods.achAvailable ?? undefined, "ACH_NOT_ENABLED");
      }
    }
  }
  const reasonCodes = [...reasons];
  return { model: "DIRECT", ready: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "READY" : reasons.has("DIRECT_CONFIGURATION_UNVERIFIED") ? "UNVERIFIED" : "NOT_READY", reasonCodes };
}

// Stripe eligibility only. Business/tier/setup authorization remains a separate
// gate in getPaymentReadiness. Classification does not enable a payment model.
export function classifyStripeChargeReadiness(input: CommonInput & {
  legacyFacts: StripeReadinessFacts | null;
  connectedAccountId: string | null;
  directEvidence: DirectReadinessEvidence | null;
}) {
  const legacy = evaluateStripeChargeReadiness({ ...input, model: "LEGACY_DESTINATION", facts: input.legacyFacts });
  const direct = evaluateStripeChargeReadiness({ ...input, model: "DIRECT", evidence: input.directEvidence });
  const classification = legacy.ready ? direct.ready ? "BOTH" : "LEGACY_ONLY" : direct.ready ? "DIRECT_ONLY" : "NEITHER";
  return { classification, legacy, direct };
}
