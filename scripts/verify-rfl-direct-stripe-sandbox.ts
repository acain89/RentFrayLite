import { readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { priceRflDirectV1, planManagementNetReconciliation, type RflDirectPricing } from "../lib/rflDirectPricing";

export const RFL_SANDBOX_PLATFORM = "acct_1Ttxz8B9QfvernJe";
export const RFL_ROOT = "C:/RentFrayLite/rentfraylite-platform";
const API_VERSION = "2026-02-25.clover";
type Log = (label: string, value: unknown) => void;
type Options = { createAccount: boolean; accountId?: string; runId: string; roundingProbes: boolean };
const id = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;
function requireSafe(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function requireTestKey(key: string): void {
  requireSafe(/^[sr]k_test_[A-Za-z0-9]+$/.test(key), "STOP: RFL credential must be explicitly test-prefixed.");
}

export function parseRflKey(contents: string): string {
  const matches = [...contents.matchAll(/^\s*STRIPE_SECRET_KEY\s*=\s*(.*?)\s*$/gm)];
  requireSafe(matches.length === 1, "STOP: RFL .env must contain exactly one STRIPE_SECRET_KEY.");
  const key = matches[0][1].replace(/^(["'])(.*)\1$/, "$2").trim();
  requireTestKey(key);
  return key;
}

export function parseOptions(args: string[]): Options {
  const options: Options = { createAccount: false, runId: "", roundingProbes: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--create-account") options.createAccount = true;
    else if (args[i] === "--rounding-probes") options.roundingProbes = true;
    else if (args[i] === "--account-id") options.accountId = args[++i];
    else if (args[i] === "--run-id") options.runId = args[++i];
    else throw new Error("STOP: unknown argument; no platform/key override is supported.");
  }
  requireSafe(/^[A-Za-z0-9-]{1,40}$/.test(options.runId ?? ""), "STOP: --run-id is required (1-40 letters, digits or hyphens).");
  requireSafe(options.createAccount !== Boolean(options.accountId), "STOP: choose --create-account OR --account-id.");
  if (options.accountId) requireSafe(/^acct_[A-Za-z0-9]+$/.test(options.accountId), "STOP: invalid connected account ID.");
  return options;
}

export async function verifySandboxIdentity(stripe: Stripe, key: string, log: Log) {
  requireTestKey(key); // Reject before even a read, never rely on NODE_ENV.
  const account = await stripe.accounts.retrieve();
  log("PLATFORM_IDENTITY", { accountId: account.id, expected: RFL_SANDBOX_PLATFORM });
  requireSafe(account.id === RFL_SANDBOX_PLATFORM, "STOP: authenticated platform account ID mismatch.");
  const balance = await stripe.balance.retrieve();
  log("STRIPE_MODE", { object: balance.object, livemode: balance.livemode });
  requireSafe(balance.object === "balance" && balance.livemode === false, "STOP: positive non-live API evidence is missing.");
  log("PASS_IDENTITY_AND_NON_LIVE", { platform: account.id });
}

export function accountCreateParams(runId: string): Stripe.AccountCreateParams {
  return {
    country: "US", default_currency: "usd", business_type: "individual",
    controller: { fees: { payer: "account" }, losses: { payments: "stripe" },
      requirement_collection: "stripe", stripe_dashboard: { type: "full" } },
    // Stripe documents card_payments requests require transfers as well.
    capabilities: { card_payments: { requested: true }, us_bank_account_ach_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { name: "RFL Sandbox Verification", url: "https://accessible.stripe.com", support_phone: "0000000000", mcc: "6513", product_description: "Sandbox-only rent payments" },
    individual: { first_name: "RFL", last_name: "Sandbox", email: "rfl-sandbox@example.com", phone: "0000000000",
      dob: { day: 1, month: 1, year: 1901 }, id_number: "000000000",
      address: { line1: "address_full_match", city: "San Francisco", state: "CA", postal_code: "94103", country: "US" } },
    external_account: { object: "bank_account", country: "US", currency: "usd", routing_number: "110000000", account_number: "000123456789" },
    metadata: { rflSandboxVerification: "phase35", rflSandboxPlatform: RFL_SANDBOX_PLATFORM, runId },
    // Do not attest TOS on behalf of an account whose collection belongs to Stripe.
  };
}

export function accountBlockers(account: Stripe.Account, runId: string): string[] {
  const blockers: string[] = [];
  if (account.metadata?.rflSandboxVerification !== "phase35" || account.metadata?.rflSandboxPlatform !== RFL_SANDBOX_PLATFORM || account.metadata?.runId !== runId) blockers.push("ACCOUNT_NOT_OWNED_BY_THIS_EXPERIMENT");
  const controller = account.controller;
  if (controller?.fees?.payer !== "account" || controller?.losses?.payments !== "stripe" ||
      controller?.requirement_collection !== "stripe" || controller?.stripe_dashboard?.type !== "full") blockers.push("TARGET_CONTROLLER_NOT_VERIFIED");
  if (controller?.is_controller !== true || controller?.type !== "application") blockers.push("PLATFORM_CONTROL_NOT_VERIFIED");
  if (account.country !== "US" || account.default_currency !== "usd") blockers.push("REGION_CURRENCY_NOT_VERIFIED");
  if (account.charges_enabled !== true) blockers.push("CHARGES_NOT_ENABLED");
  if (account.payouts_enabled !== true) blockers.push("PAYOUTS_NOT_ENABLED");
  if (account.details_submitted !== true) blockers.push("DETAILS_NOT_SUBMITTED");
  if (account.capabilities?.card_payments !== "active") blockers.push("CARD_NOT_ACTIVE");
  if (account.capabilities?.us_bank_account_ach_payments !== "active") blockers.push("ACH_NOT_ACTIVE");
  const requirements = account.requirements;
  if (!requirements || requirements.disabled_reason !== null ||
      [requirements.currently_due, requirements.past_due, requirements.pending_verification, requirements.errors].some(value => !Array.isArray(value) || value.length > 0)) blockers.push("REQUIREMENTS_NOT_COMPLETE");
  return blockers;
}

export function directIntentParams(pricing: RflDirectPricing, runId: string): Stripe.PaymentIntentCreateParams {
  return {
    amount: pricing.tenantTotalCents, currency: "usd", application_fee_amount: pricing.rflApplicationFeeCents,
    payment_method_types: [pricing.paymentMethod === "CARD" ? "card" : "us_bank_account"],
    payment_method: pricing.paymentMethod === "CARD" ? "pm_card_visa" : "pm_usBankAccount_success",
    confirm: true, description: "RFL sandbox architecture verification",
    metadata: { rflSandboxVerification: "phase35", runId, pricingVersion: pricing.pricingVersion,
      managementOwedCents: String(pricing.managementOwedCents), paymentMethod: pricing.paymentMethod },
    ...(pricing.paymentMethod === "ACH" ? { mandate_data: { customer_acceptance: { type: "online" as const,
      online: { ip_address: "192.0.2.1", user_agent: "RFL sandbox test fixture" } } } } : {}),
  };
}

export function compareEconomics(pricing: RflDirectPricing, charge: Stripe.Charge, transaction: Stripe.BalanceTransaction,
  fee: Stripe.ApplicationFee, platformTransaction: Stripe.BalanceTransaction, accountId: string) {
  const processingFee = transaction.fee_details.filter(detail => detail.type === "stripe_fee").reduce((sum, detail) => sum + detail.amount, 0);
  const applicationFee = transaction.fee_details.filter(detail => detail.type === "application_fee").reduce((sum, detail) => sum + detail.amount, 0);
  const unknownFees = transaction.fee_details.filter(detail => !["stripe_fee", "application_fee"].includes(detail.type));
  const invariants = {
    nonLiveObjects: charge.livemode === false && fee.livemode === false,
    settledCharge: charge.paid === true && charge.status === "succeeded" && charge.amount_captured === charge.amount,
    usd: charge.currency === "usd" && transaction.currency === "usd" && fee.currency === "usd" && platformTransaction.currency === "usd",
    grossMatchesPricing: charge.amount === pricing.tenantTotalCents && transaction.amount === charge.amount,
    chargeTransactionLinked: id(charge.balance_transaction) === transaction.id && id(transaction.source) === charge.id,
    directApplicationFeeLinked: id(fee.account) === accountId && id(fee.charge) === charge.id && id(charge.application_fee) === fee.id && !fee.originating_transaction,
    applicationFeeMatches: fee.amount === pricing.rflApplicationFeeCents && applicationFee === fee.amount && charge.application_fee_amount === fee.amount,
    completeFeeBreakdown: unknownFees.length === 0 && processingFee > 0 && transaction.fee === processingFee + applicationFee,
    observedManagementNet: transaction.net === transaction.amount - transaction.fee,
    platformReceivesApplicationFee: id(fee.balance_transaction) === platformTransaction.id && id(platformTransaction.source) === fee.id && platformTransaction.amount === fee.amount,
    noProcessingFeeOnApplicationFeeReceipt: platformTransaction.fee === 0 && platformTransaction.net === fee.amount,
    stripeFeeMatchesPlanning: processingFee === pricing.expectedStripeProcessingFeeCents,
    managementNetMatchesPlanning: transaction.net === pricing.expectedManagementNetCents,
  };
  return { grossTenantCents: transaction.amount, actualStripeProcessingFeeCents: processingFee,
    actualApplicationFeeCents: applicationFee, actualManagementNetCents: transaction.net, unknownFees,
    stripeFeeDeltaCents: processingFee - pricing.expectedStripeProcessingFeeCents,
    managementNetDeltaCents: transaction.net - pricing.expectedManagementNetCents,
    reconciliationPlanOnly: planManagementNetReconciliation({ managementOwedCents: pricing.managementOwedCents,
      actualManagementNetCents: transaction.net, remainingApplicationFeeCents: fee.amount - fee.amount_refunded }), invariants };
}

export async function runSandboxVerification(stripe: Stripe, key: string, options: Options, log: Log): Promise<boolean> {
  await verifySandboxIdentity(stripe, key, log);
  // Only read existing webhook configuration. Never create/alter an endpoint.
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  log("WEBHOOK_ENDPOINTS_READ_ONLY", { hasMore: endpoints.has_more, endpoints: endpoints.data.map(endpoint =>
    ({ id: endpoint.id, livemode: endpoint.livemode, status: endpoint.status, url: endpoint.url, enabledEvents: endpoint.enabled_events })) });
  log("WEBHOOK_LIMIT", "Endpoint listing does not prove connected-event scope. Current RFL handler ignores event.account; sandbox delivery requires separate evidence.");
  let account: Stripe.Account;
  if (options.createAccount) {
    account = await stripe.accounts.create(accountCreateParams(options.runId), { idempotencyKey: `rfl-sandbox-account-${options.runId}` });
    log("SANDBOX_ACCOUNT_CREATED_OR_IDEMPOTENTLY_REUSED", { id: account.id });
  } else {
    requireSafe(options.accountId, "STOP: connected account ID missing.");
    const result = await stripe.accounts.retrieve(options.accountId);
    requireSafe(!Object.hasOwn(result, "deleted") && result.id === options.accountId, "STOP: connected account unavailable.");
    account = result;
  }
  log("CONNECTED_ACCOUNT", { id: account.id, controller: account.controller, capabilities: account.capabilities,
    chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled, detailsSubmitted: account.details_submitted,
    requirements: account.requirements });
  log("ACCOUNT_SUBRESOURCE_IDS", { individualPerson: account.individual?.id ?? null,
    externalAccounts: account.external_accounts?.data.map(external => ({ id: external.id, object: external.object })) ?? [],
    requestedCapabilities: Object.keys(account.capabilities ?? {}) });
  for (const paymentMethod of ["CARD", "ACH"] as const) log("PRICING", priceRflDirectV1({ managementOwedCents: 100000, paymentMethod }));
  const blockers = accountBlockers(account, options.runId);
  if (blockers.length) { log("FAIL_ACCOUNT_ELIGIBILITY_NO_PAYMENTS_CREATED", blockers); return false; }
  const scope = { stripeAccount: account.id };
  const connectedBalance = await stripe.balance.retrieve({}, scope);
  requireSafe(connectedBalance.object === "balance" && connectedBalance.livemode === false, "STOP: connected non-live balance not verified.");
  let passed = true;
  const cases: { paymentMethod: "CARD" | "ACH"; managementOwedCents: number }[] = [
    { paymentMethod: "CARD", managementOwedCents: 100000 }, { paymentMethod: "ACH", managementOwedCents: 100000 },
    ...(options.roundingProbes ? [299, 300, 301].map(managementOwedCents => ({ paymentMethod: "CARD" as const, managementOwedCents })) : []),
  ];
  for (const sample of cases) {
    const pricing = priceRflDirectV1(sample);
    log("PRICING", pricing);
    const createdIntent = await stripe.paymentIntents.create(directIntentParams(pricing, options.runId),
      { ...scope, idempotencyKey: `rfl-sandbox-intent-${options.runId}-${sample.paymentMethod}-${sample.managementOwedCents}` });
    log("SANDBOX_INTENT_CREATED_OR_IDEMPOTENTLY_REUSED", { id: createdIntent.id, livemode: createdIntent.livemode, account: account.id });
    requireSafe(createdIntent.livemode === false, "STOP: created intent is not non-live.");
    // Idempotency replays the original response. Retrieve fresh state on every
    // run so a later ACH settlement can actually be observed without recharging.
    const intent = await stripe.paymentIntents.retrieve(createdIntent.id, {}, scope);
    requireSafe(intent.id === createdIntent.id, "STOP: retrieved intent ID mismatch.");
    log("SANDBOX_PAYMENT_INTENT", { id: intent.id, livemode: intent.livemode, status: intent.status, latestCharge: id(intent.latest_charge), account: account.id });
    requireSafe(intent.livemode === false && intent.currency === "usd" && intent.amount === pricing.tenantTotalCents &&
      intent.application_fee_amount === pricing.rflApplicationFeeCents && !intent.transfer_data, "STOP: direct test intent invariants failed.");
    if (intent.status !== "succeeded" || !id(intent.latest_charge)) { log("PENDING_OR_FAILED_PAYMENT_NO_ECONOMICS_CLAIM", { id: intent.id, status: intent.status }); passed = false; continue; }
    const charge = await stripe.charges.retrieve(id(intent.latest_charge)!, {}, scope);
    requireSafe(charge.livemode === false && id(charge.payment_intent) === intent.id && !charge.transfer_data, "STOP: charge scope/identity invariants failed.");
    log("SANDBOX_CHARGE", { id: charge.id, account: account.id, balanceTransaction: id(charge.balance_transaction), applicationFee: id(charge.application_fee) });
    if (!id(charge.balance_transaction) || !id(charge.application_fee)) { log("PENDING_BALANCE_TRANSACTION_OR_APPLICATION_FEE", { charge: charge.id }); passed = false; continue; }
    const transaction = await stripe.balanceTransactions.retrieve(id(charge.balance_transaction)!, {}, scope);
    const fee = await stripe.applicationFees.retrieve(id(charge.application_fee)!);
    requireSafe(fee.livemode === false, "STOP: non-live application fee evidence missing.");
    if (!id(fee.balance_transaction)) { log("PENDING_PLATFORM_BALANCE_TRANSACTION", { applicationFee: fee.id }); passed = false; continue; }
    const platformTransaction = await stripe.balanceTransactions.retrieve(id(fee.balance_transaction)!);
    log("OBSERVED_BALANCE_TRANSACTIONS", { connected: transaction, platformApplicationFee: platformTransaction, applicationFeeId: fee.id });
    const comparison = compareEconomics(pricing, charge, transaction, fee, platformTransaction, account.id);
    log("OBSERVED_ECONOMICS", comparison);
    for (const [name, valid] of Object.entries(comparison.invariants)) log(valid ? "PASS" : "FAIL", { invariant: name, method: sample.paymentMethod, owed: sample.managementOwedCents });
    if (Object.values(comparison.invariants).some(value => !value)) passed = false;
    const events = await stripe.events.list({ limit: 100, type: "payment_intent.succeeded" }, scope);
    log("CONNECTED_EVENT_CONTEXT", { accountId: account.id, hasMore: events.has_more, events: events.data
      .filter(event => "id" in event.data.object && event.data.object.id === intent.id).map(event => ({ id: event.id, type: event.type, livemode: event.livemode, account: event.account ?? null })) });
  }
  log("VERIFICATION_RESULT", { passed, accountId: account.id, roundingProbes: options.roundingProbes,
    limitation: "Sandbox observations are not proof of live contractual pricing or complete rounding rules; no refunds/payouts/reconciliation executed." });
  return passed;
}

export async function main() {
  // Deliberately ignores inherited credentials and never loads application/Prisma code.
  requireSafe(path.resolve(process.cwd()).replaceAll("\\", "/").toLowerCase() === RFL_ROOT.toLowerCase(), "STOP: run only from the RFL project.");
  const options = parseOptions(process.argv.slice(2));
  const key = parseRflKey(readFileSync(`${RFL_ROOT}/.env`, "utf8"));
  const stripe = new Stripe(key, { apiVersion: API_VERSION, timeout: 10000, maxNetworkRetries: 0 });
  const passed = await runSandboxVerification(stripe, key, options, (label, value) => console.log(label, JSON.stringify(value)));
  process.exitCode = passed ? 0 : 2;
}

if (require.main === module) main().catch(error => {
  // Stripe error bodies/messages may contain submitted fields. Do not print them.
  console.error("STOP_VERIFICATION", error instanceof Stripe.errors.StripeError
    ? JSON.stringify({ type: error.type, code: error.code, param: error.param, requestId: error.requestId })
    : error instanceof Error && error.message.startsWith("STOP:") ? error.message : "Unexpected error; no automatic retry or configuration fallback.");
  process.exitCode = 1;
});
