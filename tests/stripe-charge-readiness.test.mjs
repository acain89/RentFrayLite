import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { harness } from "./helpers/checkout-harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(path.join(root, file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name.startsWith("@/lib/"), `Unexpected runtime dependency: ${name}`);
    return load(`${name.slice(2)}.ts`);
  } }, { filename: file });
  cache.set(file, exports); return exports;
}
const { evaluateStripeChargeReadiness: evaluate, classifyStripeChargeReadiness: classify,
  directPaymentMethodsFromConfiguration: methodsFrom } = load("lib/stripeChargeReadiness.ts");
const { getStripeReadinessReasons } = load("lib/paymentReadiness.ts");
const legacy = () => ({ connected: true, onboardingComplete: true, chargesEnabled: false,
  payoutsEnabled: true, transfersActive: true, restricted: false, platformChargesEnabled: true,
  cardAvailable: true, achAvailable: true, destinationSupported: true });
const evidence = () => ({ accountMode: "test", account: {
  id: "acct_management", country: "US", default_currency: "usd", details_submitted: true,
  charges_enabled: true, payouts_enabled: true,
  capabilities: { card_payments: "active", us_bank_account_ach_payments: "active" },
  requirements: { disabled_reason: null, currently_due: [], past_due: [], pending_verification: [], errors: [] },
  controller: { type: "application", is_controller: true, fees: { payer: "account" }, losses: { payments: "stripe" },
    requirement_collection: "stripe", stripe_dashboard: { type: "full" } },
}, paymentMethods: { accountId: "acct_management", mode: "test", cardAvailable: true, achAvailable: true } });
const input = () => ({ model: "DIRECT", connectedAccountId: "acct_management", evidence: evidence(), mode: "test", production: false });
const codes = result => Array.from(result.reasonCodes);
function change(object, dotted, value) {
  const keys = dotted.split("."), last = keys.pop();
  const parent = keys.reduce((o, key) => o[key], object);
  if (value === undefined) delete parent[last]; else parent[last] = value;
}

test("complete verified target facts authorize both methods without transfers", () => {
  const facts = input(), before = structuredClone(facts);
  const result = evaluate(facts);
  assert.equal(result.ready, true); assert.equal(result.status, "READY"); assert.deepEqual(codes(result), []);
  assert.equal(facts.evidence.account.capabilities.transfers, undefined); assert.deepEqual(facts, before);
});
test("live mode requires matching evidence; test mode cannot authorize production", () => {
  const facts = input(); facts.mode = "live"; facts.production = true;
  facts.evidence.accountMode = "live"; facts.evidence.paymentMethods.mode = "live";
  assert.equal(evaluate(facts).ready, true);
  assert.ok(codes(evaluate({ ...input(), production: true })).includes("LIVE_CONFIGURATION_REQUIRED"));
});

const cases = [
  ["connectedAccountId", null, "NO_CONNECTED_ACCOUNT"],
  ["connectedAccountId", "invalid", "DIRECT_CONFIGURATION_UNVERIFIED"],
  ["evidence", null, "DIRECT_CONFIGURATION_UNVERIFIED"],
  ["evidence.account", null, "DIRECT_CONFIGURATION_UNVERIFIED"],
  ["evidence.account.id", "acct_other", "ACCOUNT_MISMATCH"],
  ["evidence.accountMode", "live", "MODE_MISMATCH"],
  ["evidence.accountMode", "unknown", "DIRECT_CONFIGURATION_UNVERIFIED"],
  ["mode", "unknown", "STRIPE_CONFIGURATION"],
  ["evidence.account.charges_enabled", false, "CHARGES_NOT_ENABLED"],
  ["evidence.account.payouts_enabled", false, "PAYOUTS_NOT_ENABLED"],
  ["evidence.account.details_submitted", false, "DETAILS_NOT_SUBMITTED"],
  ["evidence.account.country", "CA", "DIRECT_REGION_UNSUPPORTED"],
  ["evidence.account.default_currency", "cad", "DIRECT_REGION_UNSUPPORTED"],
  ["evidence.account.requirements.disabled_reason", "requirements.past_due", "ACCOUNT_DISABLED"],
  ...["currently_due", "past_due", "pending_verification", "errors"].map(key =>
    [`evidence.account.requirements.${key}`, [key === "errors" ? { code: "verification_failed" } : "business_profile.url"], "REQUIREMENTS_INCOMPLETE"]),
  ["evidence.account.controller.fees.payer", "application_express", "DIRECT_CONFIGURATION_INCOMPATIBLE"],
  ["evidence.account.controller.fees.payer", "application", "DIRECT_CONFIGURATION_INCOMPATIBLE"],
  ["evidence.account.controller.losses.payments", "application", "DIRECT_CONFIGURATION_INCOMPATIBLE"],
  ["evidence.account.controller.requirement_collection", "application", "DIRECT_CONFIGURATION_INCOMPATIBLE"],
  ["evidence.account.controller.stripe_dashboard.type", "express", "DIRECT_CONFIGURATION_INCOMPATIBLE"],
  ["evidence.account.controller.stripe_dashboard.type", "none", "DIRECT_CONFIGURATION_INCOMPATIBLE"],
  ["evidence.account.controller.is_controller", false, "DIRECT_CONTROL_UNAVAILABLE"],
  ["evidence.account.controller.type", "account", "DIRECT_CONTROL_UNAVAILABLE"],
  ["evidence.paymentMethods.accountId", "acct_platform", "ACCOUNT_MISMATCH"],
  ["evidence.paymentMethods.mode", "live", "MODE_MISMATCH"],
  ["evidence.paymentMethods.cardAvailable", false, "CARD_NOT_ENABLED"],
  ["evidence.paymentMethods.achAvailable", false, "ACH_NOT_ENABLED"],
];
for (const [field, value, code] of cases) test(`${field}=${JSON.stringify(value)} fails closed with ${code}`, () => {
  const facts = input(); change(facts, field, value);
  const result = evaluate(facts); assert.equal(result.ready, false); assert.ok(codes(result).includes(code));
});
for (const method of ["card_payments", "us_bank_account_ach_payments"]) {
  for (const [state, code] of [["inactive", method === "card_payments" ? "CARD_NOT_ENABLED" : "ACH_NOT_ENABLED"],
    ["pending", method === "card_payments" ? "CARD_PENDING" : "ACH_PENDING"],
    [undefined, "DIRECT_CONFIGURATION_UNVERIFIED"]]) test(`${method} ${state} is not ready`, () => {
    const facts = input(); change(facts, `evidence.account.capabilities.${method}`, state);
    assert.equal(evaluate(facts).ready, false); assert.ok(codes(evaluate(facts)).includes(code));
  });
}
const missing = ["accountMode", "account.id", "account.charges_enabled", "account.payouts_enabled", "account.details_submitted",
  "account.country", "account.default_currency", "account.capabilities", "account.controller", "account.controller.fees",
  "account.controller.losses", "account.controller.fees.payer", "account.controller.losses.payments",
  "account.controller.requirement_collection", "account.controller.stripe_dashboard", "account.controller.stripe_dashboard.type",
  "account.controller.is_controller", "account.controller.type", "account.requirements", "account.requirements.disabled_reason",
  "account.requirements.currently_due", "account.requirements.past_due", "account.requirements.pending_verification",
  "account.requirements.errors", "paymentMethods", "paymentMethods.accountId", "paymentMethods.mode",
  "paymentMethods.cardAvailable", "paymentMethods.achAvailable"];
for (const field of missing) test(`missing evidence ${field} is UNVERIFIED`, () => {
  const facts = input(); change(facts, `evidence.${field}`, undefined);
  const result = evaluate(facts); assert.equal(result.ready, false); assert.equal(result.status, "UNVERIFIED");
  assert.ok(codes(result).includes("DIRECT_CONFIGURATION_UNVERIFIED"));
});

for (const state of ["inactive", "pending", "active"]) test(`direct eligibility does not depend on transfers=${state}`, () => {
  const facts = input(); facts.evidence.account.capabilities.transfers = state;
  assert.equal(evaluate(facts).ready, true);
});
test("future requirements not currently due do not disable present readiness", () => {
  const facts = input(); facts.evidence.account.future_requirements = { currently_due: ["business_profile.url"] };
  assert.equal(evaluate(facts).ready, true);
});

for (const [name, legacyReady, directReady] of [["BOTH", true, true], ["LEGACY_ONLY", true, false],
  ["DIRECT_ONLY", false, true], ["NEITHER", false, false]]) test(`classification ${name}`, () => {
  const legacyFacts = legacy(); legacyFacts.transfersActive = legacyReady;
  const result = classify({ mode: "test", production: false, legacyFacts, connectedAccountId: "acct_management",
    directEvidence: directReady ? evidence() : null });
  assert.equal(result.classification, name); assert.equal(result.legacy.ready, legacyReady); assert.equal(result.direct.ready, directReady);
  if (!directReady) assert.equal(result.direct.status, "UNVERIFIED");
});
test("persisted Express/transfers-only readiness cannot imply direct readiness", () => {
  const facts = input(); facts.evidence.account.capabilities = { transfers: "active" }; facts.evidence.account.controller = undefined;
  assert.equal(evaluate(facts).status, "UNVERIFIED");
  assert.equal(evaluate({ model: "LEGACY_DESTINATION", mode: "test", production: false, facts: legacy() }).ready, true);
});
for (const field of Object.keys(legacy())) test(`legacy ${field} preserves existing readiness semantics`, () => {
  const facts = legacy(); facts[field] = !facts[field];
  const result = evaluate({ model: "LEGACY_DESTINATION", mode: "test", production: false, facts });
  assert.deepEqual(codes(result), Array.from(getStripeReadinessReasons(facts, "test", false), r => r.code));
});
test("legacy unknown facts preserve STRIPE_UNVERIFIED", () => {
  const result = evaluate({ model: "LEGACY_DESTINATION", mode: "test", production: false, facts: null });
  assert.equal(result.status, "UNVERIFIED"); assert.deepEqual(codes(result), ["STRIPE_UNVERIFIED"]);
});

test("configuration adapter uses actual effective availability, active and livemode", () => {
  const configuration = { active: true, livemode: false, card: { available: true }, us_bank_account: { available: true } };
  const result = methodsFrom("acct_management", configuration);
  assert.equal(result.mode, "test"); assert.equal(result.cardAvailable, true); assert.equal(result.achAvailable, true);
  configuration.active = false; assert.equal(methodsFrom("acct_management", configuration).cardAvailable, false);
  configuration.active = true; configuration.card.available = false; assert.equal(methodsFrom("acct_management", configuration).cardAvailable, false);
  delete configuration.us_bank_account; assert.equal(methodsFrom("acct_management", configuration).achAvailable, null);
});

for (const method of ["ACH", "CARD"]) test(`${method}: actual checkout remains legacy despite absent direct facts`, async () => {
  const h = await harness(method, "isolated"), checkout = await h.prepare();
  const readiness = h.load("lib/businessPaymentReadiness.ts");
  assert.equal(readiness.getBusinessPaymentReadiness, readiness.getLegacyBusinessPaymentReadiness);
  assert.equal((await h.start(checkout)).status, 200);
  const [payment] = await h.payments(), { params, options } = h.calls.creates[0];
  assert.equal(payment.chargeModel, "LEGACY_DESTINATION"); assert.equal(payment.pricingVersion, "RFL_LEGACY_V1");
  assert.equal(payment.platformFeeCents, method === "ACH" ? 995 : 4900);
  assert.equal(params.payment_intent_data.application_fee_amount, payment.platformFeeCents);
  assert.equal(params.payment_intent_data.transfer_data.destination, checkout.stripeConnectedAccountId);
  assert.deepEqual(options, { idempotencyKey: `rfl-payment-${payment.id}` });
  assert.equal(params.line_items.reduce((sum, item) => sum + item.quantity * item.price_data.unit_amount, 0), payment.totalChargedCents);
  assert.match(readFileSync(path.join(root, "app/api/public/checkout/start/route.ts"), "utf8"), /await getLegacyBusinessPaymentReadiness\(readinessBusiness, checkoutSession.planId \?\? undefined, checkoutSession.sourceType\)/);
});
test("evaluating readiness cannot mutate historical payment ownership", async () => {
  const h = await harness("ACH", "isolated"), attempt = await h.original("CHECKOUT_STARTED"); h.intentFor(attempt);
  const before = await h.payments();
  h.business.stripeConnection.stripeAccountId = "acct_replacement";
  const facts = input(); facts.connectedAccountId = "acct_replacement";
  assert.equal(evaluate(facts).ready, false);
  assert.equal((await h.start(attempt.checkout)).status, 200);
  assert.deepEqual(await h.payments(), before); assert.equal(h.calls.creates.length, 1);
});
