import type Stripe from "stripe";
import { validateStripePaymentIdentity, type StripePaymentIdentity } from "@/lib/stripePaymentContext";
import { quoteInstantPayout } from "@/lib/instantPayoutPolicy";

type Balance = { livemode: boolean; available: { currency: string; amount: number }[];
  instant_available?: { currency: string; amount: number;
    net_available?: { destination: string; amount: number }[] }[] };
type Account = { id: string; type?: string; country?: string; default_currency?: string;
  charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean;
  controller?: { type?: string; is_controller?: boolean; fees?: { payer?: string };
    losses?: { payments?: string }; requirement_collection?: string; stripe_dashboard?: { type?: string } };
  requirements?: { disabled_reason?: string | null; currently_due?: string[] | null; past_due?: string[] | null;
    pending_verification?: string[] | null; errors?: unknown[] | null } };

/** Future trusted server adapter must obtain these from Stripe/account review.
 * They are NOT client parameters, account settings or inferred balance limits.
 * No such adapter is configured in this stage: readInstantPayoutReadiness always
 * fails closed on these missing facts. Tests supply synthetic fixtures only.
 */
export type InstantPayoutControls = Readonly<{
  platformAccountId: string; connectedAccountId: string; mode: "test" | "live";
  observedAt: number; reference: string; permissionVerified: boolean; fullTermsVerified: boolean;
  platformControlsVerified: boolean; feeCollectionVerified: boolean; failureFeeReversalVerified: boolean;
  stripeCostVerified: boolean; stripeCostCents: number;
  minimumCents: number; maximumCents: number; platformRemainingCents: number; accountRemainingCents: number;
  pricingVersion: "RFL_INSTANT_250_BPS_V1";
}>;
export type InstantPayoutEvidence = {
  identity: StripePaymentIdentity; credentialMode: "test" | "live" | "unknown";
  connectedAccountId: string; platform: Account; platformBalance: Balance; account: Account; balance: Balance;
  destinations: { id: string; account?: string | null; currency?: string | null; country?: string | null;
    object?: string; funding?: string | null; status?: string | null; available_payout_methods?: string[] | null }[];
  destinationsComplete: boolean; controls?: InstantPayoutControls; destinationId: string; selectedAmountCents: number;
};
export type InstantPayoutReadiness = Readonly<{
  eligible: boolean; reasonCodes: readonly string[]; platformAccountId: string; connectedAccountId: string;
  mode: "test" | "live"; destinationId: string; availableCents: number; observedAt: number;
  evidenceReference: string | null; quote: ReturnType<typeof quoteInstantPayout>;
}>;
const cents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const id = (n: unknown) => typeof n === "string" && /^acct_[A-Za-z0-9]+$/.test(n);
const proofs = new WeakSet<object>();

/** Pure evaluation; not sufficient to authorize a persisted reservation. */
export function evaluateInstantPayoutEvidence(e: InstantPayoutEvidence, now = Date.now()): InstantPayoutReadiness {
  const quote = quoteInstantPayout(e.selectedAmountCents), reasons: string[] = [];
  const check = (ok: unknown, code: string) => { if (!ok) reasons.push(code); };
  try { validateStripePaymentIdentity(e.identity, { platformAccountId: e.platform.id,
    livemode: e.platformBalance.livemode, credentialMode: e.credentialMode }); }
  catch { reasons.push("PLATFORM_OR_MODE_UNVERIFIED"); }
  check(id(e.connectedAccountId) && e.connectedAccountId !== e.identity.platformAccountId && e.account.id === e.connectedAccountId, "ACCOUNT_OWNERSHIP_UNVERIFIED");
  check(typeof e.balance.livemode === "boolean" && e.balance.livemode === (e.identity.mode === "live"), "CONNECTED_MODE_MISMATCH");
  const a = e.account, c = a.controller, r = a.requirements;
  check(e.platform.country === "US" && a.country === "US" && a.default_currency === "usd", "COUNTRY_OR_CURRENCY_UNSUPPORTED");
  check(a.type === "standard" && c?.type === "application" && c.is_controller === true && c.fees?.payer === "account" &&
    c.losses?.payments === "stripe" && c.requirement_collection === "stripe" && c.stripe_dashboard?.type === "full", "CONTROLLER_UNSUPPORTED");
  check(a.charges_enabled === true && a.payouts_enabled === true && a.details_submitted === true, "ACCOUNT_NOT_ENABLED");
  check(r && r.disabled_reason === null && [r.currently_due, r.past_due, r.pending_verification, r.errors].every(v => Array.isArray(v) && v.length === 0), "ACCOUNT_REQUIREMENTS_UNVERIFIED");
  const destination = e.destinations.filter(d => d.id === e.destinationId);
  check(e.destinationsComplete === true && destination.length === 1 && destination[0].account === a.id &&
    destination[0].country === "US" && destination[0].currency === "usd" &&
    ((destination[0].object === "card" && destination[0].funding === "debit") ||
     (destination[0].object === "bank_account" && destination[0].status === "verified")) &&
    destination[0].available_payout_methods?.includes("instant"), "INSTANT_DESTINATION_UNVERIFIED");
  const available = e.balance.available.filter(b => b.currency === "usd");
  const instant = e.balance.instant_available?.filter(b => b.currency === "usd") ?? [];
  const net = instant[0]?.net_available?.filter(b => b.destination === e.destinationId) ?? [];
  check(available.length === 1 && cents(available[0].amount) && instant.length === 1 && cents(instant[0].amount) && net.length === 1 && cents(net[0].amount), "BALANCE_UNVERIFIED");
  const availableCents = reasons.includes("BALANCE_UNVERIFIED") ? 0 : Math.min(available[0].amount, instant[0].amount);
  check(quote.selectedAmountCents <= availableCents && net.length === 1 && quote.estimatedReceivedCents <= net[0].amount, "INSUFFICIENT_SETTLED_INSTANT_FUNDS");
  const p = e.controls;
  check(p && p.platformAccountId === e.identity.platformAccountId && p.connectedAccountId === a.id && p.mode === e.identity.mode &&
    Number.isFinite(p.observedAt) && now >= p.observedAt && now - p.observedAt <= 60000 && p.reference.length > 0, "CONTROLS_UNVERIFIED");
  check(p?.permissionVerified === true && p.platformControlsVerified === true && p.fullTermsVerified === true, "PAYOUT_PERMISSION_UNVERIFIED");
  check(p?.feeCollectionVerified === true && p.failureFeeReversalVerified === true && p.pricingVersion === quote.pricingVersion, "FEE_COLLECTION_UNVERIFIED");
  // A nonzero additional Stripe cost needs a separately reviewed quote contract.
  check(p?.stripeCostVerified === true && p.stripeCostCents === 0, "STRIPE_COST_OR_QUOTE_UNVERIFIED");
  check(p && [p.minimumCents, p.maximumCents, p.platformRemainingCents, p.accountRemainingCents].every(cents) &&
    p.minimumCents > 0 && p.maximumCents >= p.minimumCents && quote.estimatedReceivedCents >= p.minimumCents &&
    quote.selectedAmountCents <= Math.min(p.maximumCents, p.platformRemainingCents, p.accountRemainingCents), "STRIPE_LIMITS_UNVERIFIED_OR_EXCEEDED");
  return Object.freeze({ eligible: reasons.length === 0, reasonCodes: Object.freeze(reasons), platformAccountId: e.identity.platformAccountId,
    connectedAccountId: a.id, mode: e.identity.mode, destinationId: e.destinationId, availableCents, observedAt: now,
    evidenceReference: p?.reference ?? null, quote });
}

const READ: Stripe.RequestOptions = { timeout: 5000, maxNetworkRetries: 0 };
/** Explicit read-only adapter; not called by a route. Payout controls/pricing/limits
 * cannot be established by balance alone, so no eligible report is minted yet. */
export async function readInstantPayoutReadiness(stripe: Stripe, input: {
  identity: StripePaymentIdentity; credentialMode: "test" | "live" | "unknown";
  connectedAccountId: string; destinationId: string; selectedAmountCents: number;
}): Promise<InstantPayoutReadiness> {
  if (!id(input.connectedAccountId) || input.connectedAccountId === input.identity.platformAccountId) throw Error("Payout ownership unverified.");
  const scoped = { ...READ, stripeAccount: input.connectedAccountId };
  const [platform, platformBalance, account, balance, external] = await Promise.all([
    stripe.accounts.retrieve(READ), stripe.balance.retrieve({}, READ), stripe.accounts.retrieve(input.connectedAccountId, READ),
    stripe.balance.retrieve({ expand: ["instant_available.net_available"] }, scoped),
    stripe.accounts.listExternalAccounts(input.connectedAccountId, { limit: 100 }, scoped),
  ]);
  const report = evaluateInstantPayoutEvidence({ ...input, platform, platformBalance, account,
    balance: balance as Balance, destinations: external.data.map(d => ({ ...d, account: typeof d.account === "string" ? d.account : d.account?.id })),
    destinationsComplete: external.has_more === false });
  if (report.eligible) proofs.add(report);
  return report;
}

export function requireInstantPayoutProof(report: InstantPayoutReadiness) {
  if (!proofs.has(report) || !report.eligible || Date.now() < report.observedAt || Date.now() - report.observedAt > 60000) {
    throw Error("Fresh authoritative Instant Payout eligibility is required.");
  }
}
