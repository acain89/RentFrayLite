import type Stripe from "stripe";
import { directPaymentMethodsFromConfiguration, evaluateStripeChargeReadiness, type ChargeReadiness } from "@/lib/stripeChargeReadiness";
import { validateStripePaymentIdentity, type StripePaymentIdentity } from "@/lib/stripePaymentContext";

const READ_OPTIONS: Stripe.RequestOptions = { timeout: 5000, maxNetworkRetries: 0 };
type Ownership = Readonly<{ platformAccountId: string; connectedAccountId: string; mode: "test" | "live"; configurationId: string; applicationId: string; observedAt: number }>;
const proofs = new WeakMap<object, Ownership>();
export type DirectReadinessReport = Readonly<Omit<ChargeReadiness, "reasonCodes"> & { reasonCodes: readonly string[] }>;

/** Read-only, explicitly configured server adapter. Never used by active checkout.
 * Accounts v1 has no livemode: authenticated platform/connected balance reads
 * establish mode. No environment, persisted-ready boolean or account type fallback. */
export async function readDirectChargeReadiness(stripe: Stripe, input: {
  identity: StripePaymentIdentity; credentialMode: "test" | "live" | "unknown";
  connectedAccountId: string; applicationId: string; production: boolean;
}): Promise<DirectReadinessReport> {
  const fail = (code: string): DirectReadinessReport => Object.freeze({ model: "DIRECT", ready: false, status: "UNVERIFIED", reasonCodes: Object.freeze([code]) });
  if (!/^acct_[A-Za-z0-9]+$/.test(input.connectedAccountId) || input.connectedAccountId === input.identity.platformAccountId ||
      !/^ca_[A-Za-z0-9]+$/.test(input.applicationId)) return fail("DIRECT_IDENTITY_CONFIGURATION_UNVERIFIED");
  try {
    const scoped = { ...READ_OPTIONS, stripeAccount: input.connectedAccountId };
    const [platform, platformBalance, account, balance, configurations] = await Promise.all([
      stripe.accounts.retrieve(READ_OPTIONS), stripe.balance.retrieve({}, READ_OPTIONS),
      stripe.accounts.retrieve(input.connectedAccountId, READ_OPTIONS), stripe.balance.retrieve({}, scoped),
      stripe.paymentMethodConfigurations.list({ application: input.applicationId, limit: 100 }, scoped),
    ]);
    if (Object.hasOwn(platform, "deleted") || Object.hasOwn(account, "deleted")) return fail("DIRECT_ACCOUNT_UNVERIFIED");
    validateStripePaymentIdentity(input.identity, { platformAccountId: platform.id, livemode: platformBalance.livemode, credentialMode: input.credentialMode });
    if (typeof balance.livemode !== "boolean" || balance.livemode !== platformBalance.livemode) return fail("DIRECT_MODE_MISMATCH");
    const selected = configurations.data.filter(configuration => configuration.is_default && configuration.application === input.applicationId &&
      typeof configuration.parent === "string" && /^pmc_[A-Za-z0-9]+$/.test(configuration.parent));
    if (configurations.has_more !== false || selected.length !== 1 || !/^pmc_[A-Za-z0-9]+$/.test(selected[0].id)) return fail("DIRECT_METHOD_CONFIGURATION_UNVERIFIED");
    const configuration = selected[0];
    const methods = directPaymentMethodsFromConfiguration(input.connectedAccountId, configuration);
    const effective = (available: boolean | null, value: unknown) => available === false ? false : value === "on" ? available : value === "off" ? false : null;
    methods.cardAvailable = effective(methods.cardAvailable, configuration.card?.display_preference?.value);
    methods.achAvailable = effective(methods.achAvailable, configuration.us_bank_account?.display_preference?.value);
    const result = evaluateStripeChargeReadiness({ model: "DIRECT", mode: input.identity.mode, production: input.production,
      connectedAccountId: input.connectedAccountId, evidence: { accountMode: balance.livemode ? "live" : "test", account,
        paymentMethods: methods } });
    // controller.fees.payer=account establishes Stripe fee collection directly
    // from the connected account, NOT that Stripe pays those processing fees.
    // controller.losses.payments=stripe separately establishes payment-loss liability.
    // Exact negotiated processing rates are not inferred or reconciled here.
    const report: DirectReadinessReport = Object.freeze({ ...result, reasonCodes: Object.freeze([...result.reasonCodes]) });
    if (report.ready) proofs.set(report, Object.freeze({ platformAccountId: platform.id, connectedAccountId: account.id, mode: input.identity.mode,
      applicationId: input.applicationId, configurationId: configuration.id, observedAt: Date.now() }));
    return report;
  } catch { return fail("DIRECT_STRIPE_EVIDENCE_UNVERIFIED"); }
}

/** Only an actual successful scoped read can authorize a future snapshot. */
export function verifiedDirectOwnership(report: DirectReadinessReport, identity: StripePaymentIdentity, connectedAccountId: string): Ownership {
  const proof = proofs.get(report);
  const age = proof ? Date.now() - proof.observedAt : Infinity;
  if (!proof || !report.ready || age < 0 || age > 5 * 60 * 1000 || proof.platformAccountId !== identity.platformAccountId ||
      proof.mode !== identity.mode || proof.connectedAccountId !== connectedAccountId) throw Error("Fresh direct-charge ownership evidence is required.");
  return proof;
}
