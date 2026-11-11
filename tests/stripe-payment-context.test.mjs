import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { harness } from "./helpers/checkout-harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
function load(file) {
  const source = readFileSync(path.join(root, file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(
    name => { throw new Error(`Unexpected runtime dependency ${name}`); }, loaded, loaded.exports);
  return loaded.exports;
}
const { resolveStripePaymentContext: resolve, stripePaymentRequestOptions: options,
  matchesStripePaymentEventContext: matches, validateStripePaymentIdentity: validate,
  classifyStripeCredentialMode: mode } = load("lib/stripePaymentContext.ts");
const policy = load("lib/paymentArchitecturePolicy.ts");
const identity = { platformAccountId: "acct_platform", mode: "test" };
const snapshot = (direct = false) => ({ chargeModel: direct ? "DIRECT" : "LEGACY_DESTINATION",
  pricingVersion: direct ? "RFL_DIRECT_V1" : "RFL_LEGACY_V1", stripeConnectedAccountId: "acct_captured",
  stripePlatformAccountId: identity.platformAccountId, stripeMode: identity.mode });

test("legacy resolves platform scope; direct resolves captured connected scope", () => {
  assert.deepEqual(options(resolve(snapshot(), identity)), {});
  const context = resolve(snapshot(true), identity);
  assert.deepEqual(options(context), { stripeAccount: "acct_captured" });
  assert.ok(Object.isFrozen(context));
});
for (const [field, value] of [["stripeConnectedAccountId", null], ["chargeModel", "UNKNOWN"],
  ["pricingVersion", null], ["pricingVersion", "RFL_LEGACY_V1"], ["stripePlatformAccountId", null],
  ["stripePlatformAccountId", "acct_other"], ["stripeMode", null], ["stripeMode", "live"],
  ["stripeConnectedAccountId", "acct_platform"], ["stripeConnectedAccountId", "bad"]]) {
  test(`direct rejects incomplete/contradictory ${field}=${value}`, () =>
    assert.throws(() => resolve({ ...snapshot(true), [field]: value }, identity)));
}
test("legacy also requires captured environment; contradictory pricing is rejected", () => {
  assert.throws(() => resolve({ ...snapshot(), stripeMode: null }, identity));
  assert.throws(() => resolve({ ...snapshot(), pricingVersion: "RFL_DIRECT_V1" }, identity));
});
test("identity requires independent platform, API mode and credential mode agreement", () => {
  const observed = { platformAccountId: "acct_platform", livemode: false, credentialMode: "test" };
  validate(identity, observed);
  for (const change of [{ platformAccountId: "acct_other" }, { livemode: true },
    { credentialMode: "live" }, { credentialMode: "unknown" }, { livemode: undefined }])
    assert.throws(() => validate(identity, { ...observed, ...change }));
  assert.throws(() => validate({ ...identity, platformAccountId: "" }, observed));
  validate({ ...identity, mode: "live" }, { ...observed, livemode: true, credentialMode: "live" });
});
test("credential classification contains no identity inference", () => {
  assert.equal(mode("rk_live_fixture"), "live");
  assert.equal(mode("sk_test_fixture"), "test");
  assert.equal(mode("invalid"), "unknown");
});
test("event and metadata alone cannot establish ownership", () => {
  const event = { account: "acct_captured", livemode: false, metadata: snapshot(true) };
  assert.equal(matches(null, event, identity.platformAccountId), false);
  assert.throws(() => options({ ...snapshot(true), scope: "connected" }));
});
test("event account/platform/mode must match the persisted context", () => {
  const context = resolve(snapshot(true), identity);
  assert.equal(matches(context, { account: "acct_captured", livemode: false }, "acct_platform"), true);
  for (const event of [{ account: "acct_rf", livemode: false }, { livemode: false },
    { account: "acct_captured", livemode: true }]) assert.equal(matches(context, event, "acct_platform"), false);
  assert.equal(matches(context, { account: "acct_captured", livemode: false }, "acct_other"), false);
  const legacy = resolve(snapshot(), identity);
  assert.equal(matches(legacy, { livemode: false }, "acct_platform"), true);
  assert.equal(matches(legacy, { account: "acct_captured", livemode: false }, "acct_platform"), false);
});
test("browser/current business changes cannot alter a captured resolved context", () => {
  const persisted = snapshot(true), before = structuredClone(persisted);
  const context = resolve(persisted, identity);
  const browser = { stripeAccount: "acct_rf" }, business = { stripeAccountId: "acct_replacement" };
  persisted.stripeConnectedAccountId = business.stripeAccountId;
  browser.stripeAccount = "acct_another";
  assert.deepEqual(options(context), { stripeAccount: before.stripeConnectedAccountId });
});
test("direct creation remains disabled and real checkout stays destination-scoped", async () => {
  assert.equal(policy.directPaymentCreationEnabled(), false);
  assert.equal(policy.selectedCheckoutChargeModel(), "LEGACY_DESTINATION");
  const h = await harness("CARD", "isolated");
  const checkout = await h.prepare();
  assert.equal((await h.start(checkout)).status, 200);
  const { params, options: requestOptions } = h.calls.creates[0];
  assert.equal(params.payment_intent_data.transfer_data.destination, checkout.stripeConnectedAccountId);
  assert.equal(requestOptions.stripeAccount, undefined);
  assert.equal(checkout.chargeModel, "LEGACY_DESTINATION");
  const source = readFileSync(path.join(root, "app/api/public/checkout/start/route.ts"), "utf8");
  assert.match(source, /transfer_data/);
  assert.doesNotMatch(source, /stripePaymentContext|paymentArchitecturePolicy/);
  const webhook = readFileSync(path.join(root, "lib/stripePaymentWebhook.ts"), "utf8");
  assert.match(webhook, /matchesStripePaymentEventContext/);
});
