import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { harness } from "./helpers/checkout-harness.mjs";
import { directStripeFixture } from "./helpers/stripe-foundation-harness.mjs";

async function fixture(change) {
  const h = await harness("ACH", "isolated");
  const f = directStripeFixture();
  const business = structuredClone(h.business);
  business.stripeConnection = { stripeAccountId: f.input.connectedAccountId };
  const architecture = { chargeModel: "DIRECT_CONNECTED", stripe: f.stripe, ...f.input };
  delete architecture.connectedAccountId;
  change?.({ ...f, business, architecture });
  const service = h.load("lib/modelAwarePaymentReadiness.ts");
  return { ...f, h, business, architecture, run: (planId, sourceType) => service.getModelAwareBusinessPaymentReadiness(business, architecture, planId, sourceType) };
}

for (const method of ["CARD", "ACH"]) test(`eligible direct account supports ${method} with fresh scoped evidence`, async () => {
  const f = await fixture();
  const result = await f.run();
  assert.equal(result.ready, true); assert.equal(result.configurationReady, true);
  assert.equal(result.readyForLive, false); assert.equal(result.mode, "test");
  assert.ok(f.state.calls.filter(c => ["connectedBalance", "configurations"].includes(c.name)).every(c => c.options.stripeAccount === "acct_management"));
  assert.equal(f.state.calls.find(c => c.name === "configurationFilter").params.application, "ca_rfl");
});

const denied = [
  ["missing connection", f => { f.business.stripeConnection = null; }],
  ["wrong account", f => { f.state.account.id = "acct_other"; }],
  ["wrong platform ownership", f => { f.architecture.identity = { platformAccountId: "acct_other", mode: "test" }; }],
  ["wrong credential mode", f => { f.architecture.credentialMode = "live"; }],
  ["unknown credentials", f => { f.architecture.credentialMode = "unknown"; }],
  ["wrong connected mode", f => { f.state.connectedMode = "live"; }],
  ["missing application", f => { f.architecture.applicationId = ""; }],
  ["wrong application", f => { f.architecture.applicationId = "ca_other"; }],
  ["not controller", f => { f.state.account.controller.is_controller = false; }],
  ["charges disabled", f => { f.state.account.charges_enabled = false; }],
  ["payouts disabled", f => { f.state.account.payouts_enabled = false; }],
  ["incomplete onboarding", f => { f.state.account.details_submitted = false; }],
  ["requirements outstanding", f => { f.state.account.requirements.currently_due = ["synthetic_requirement"]; }],
  ["card inactive", f => { f.state.account.capabilities.card_payments = "inactive"; }],
  ["ACH pending", f => { f.state.account.capabilities.us_bank_account_ach_payments = "pending"; }],
  ["missing capability", f => { delete f.state.account.capabilities.card_payments; }],
  ["card unavailable", f => { f.state.configurations.data[0].card.available = false; }],
  ["ACH disabled", f => { f.state.configurations.data[0].us_bank_account.display_preference.value = "off"; }],
  ["configuration disabled", f => { f.state.configurations.data[0].active = false; }],
  ["test mode in production", f => { f.architecture.production = true; }],
  ...["platformAccount", "platformBalance", "connectedAccount", "connectedBalance", "configurations"].map(name => [`unavailable ${name}`, f => { f.state.fail = name; }]),
];
for (const [name, change] of denied) test(`${name} fails closed without confusing completed setup with eligibility`, async () => {
  const f = await fixture(change), result = await f.run();
  assert.equal(result.ready, false); assert.equal(result.readyForLive, false);
  assert.equal(result.configurationReady, true); assert.ok(result.reasons.length);
  assert.equal(result.actionRoute, "/setup/stripe");
  if (name === "missing connection") assert.equal(f.state.calls.length, 0);
});

test("provider eligibility does not bypass business status, code or plan checks", async () => {
  for (const change of [f => { f.business.status = "SETUP"; }, f => { f.business.isActive = false; }, f => { f.business.accountCode = null; }, f => { f.business.recurringPlans = []; }]) {
    const f = await fixture(change); assert.equal((await f.run()).ready, false);
  }
  const f = await fixture(); assert.equal((await f.run("missing-plan")).ready, false);
});

test("custom source reuses existing business checks without requiring recurring tiers", async () => {
  const f = await fixture(f => { f.business.recurringPlans = []; });
  assert.equal((await f.run(undefined, "CUSTOM_PAYMENT")).ready, true);
  assert.equal((await f.run()).ready, false);
});

test("legacy adapter result is unchanged and performs no direct evidence reads", async () => {
  const f = await fixture();
  const legacy = f.h.load("lib/businessPaymentReadiness.ts");
  const service = f.h.load("lib/modelAwarePaymentReadiness.ts");
  assert.equal(legacy.getBusinessPaymentReadiness, legacy.getLegacyBusinessPaymentReadiness);
  for (const sourceType of ["RECURRING_PLAN", "CUSTOM_PAYMENT"]) {
    const expected = await legacy.getLegacyBusinessPaymentReadiness(f.h.business, undefined, sourceType);
    const actual = await service.getModelAwareBusinessPaymentReadiness(f.h.business, { chargeModel: "LEGACY_DESTINATION" }, undefined, sourceType);
    assert.deepEqual(actual, expected);
  }
  assert.equal(f.state.calls.length, 0);
});

test("unknown runtime architecture fails closed rather than selecting legacy", async () => {
  const f = await fixture(f => { f.architecture.chargeModel = "forged"; });
  await assert.rejects(f.run, /Unsupported payment readiness architecture/);
  assert.equal(f.state.calls.length, 0);
});

test("client architecture fields do not switch public quote or payment routing", async () => {
  const f = await fixture();
  const checkout = await f.h.prepare({ chargeModel: "DIRECT_CONNECTED", architecture: "DIRECT_CONNECTED", pricingVersion: "RFL_DIRECT_V1", stripePlatformAccountId: "acct_other" });
  assert.equal(checkout.chargeModel, "LEGACY_DESTINATION"); assert.equal(checkout.pricingVersion, "RFL_LEGACY_V1");
  assert.equal((await f.h.start(checkout)).status, 200);
  const params = f.h.calls.creates[0].params;
  assert.equal(params.payment_intent_data.transfer_data.destination, f.h.business.stripeConnection.stripeAccountId);
  assert.equal(f.state.calls.length, 0);
  const policy = f.h.load("lib/paymentArchitecturePolicy.ts");
  assert.equal(policy.selectedCheckoutChargeModel(), "LEGACY_DESTINATION"); assert.equal(policy.directPaymentCreationEnabled(), false);
  for (const file of ["app/api/public/checkout/session/route.ts", "app/api/public/checkout/start/route.ts", "lib/publicCheckout.ts"]) {
    assert.doesNotMatch(readFileSync(new URL("../" + file, import.meta.url), "utf8"), /modelAwarePaymentReadiness/);
  }
});


test("each readiness call refreshes provider evidence instead of trusting earlier eligibility", async () => {
  const f = await fixture(); assert.equal((await f.run()).ready, true);
  f.state.account.capabilities.card_payments = "inactive";
  assert.equal((await f.run()).ready, false);
  f.state.account.capabilities.card_payments = "active"; f.state.fail = "connectedBalance";
  assert.equal((await f.run()).ready, false);
});

test("matching live identity can be eligible for production without changing routing policy", async () => {
  const f = await fixture(f => {
    f.architecture.identity = { platformAccountId: "acct_platform", mode: "live" };
    f.architecture.credentialMode = "live"; f.architecture.production = true;
    f.state.mode = "live"; f.state.connectedMode = "live"; f.state.configurations.data[0].livemode = true;
  });
  const result = await f.run(); assert.equal(result.ready, true); assert.equal(result.readyForLive, true);
  assert.equal(f.h.load("lib/paymentArchitecturePolicy.ts").directPaymentCreationEnabled(), false);
});
