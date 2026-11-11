import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { harness } from "./helpers/checkout-harness.mjs";
import { directStripeFixture } from "./helpers/stripe-foundation-harness.mjs";
import { webhookFixture } from "./helpers/connected-webhook-harness.mjs";

const identity = { platformAccountId: "acct_platform", mode: "test" };
const policySource = readFileSync(new URL("../lib/paymentArchitecturePolicy.ts", import.meta.url), "utf8");
function policyWithEnvironment(env = {}) {
  const loaded = { exports: {} }, source = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(`(function(module,exports,process){${source}\n})`, {})(loaded, loaded.exports, { env }); return loaded.exports;
}
function closed(policy, input) {
  assert.equal(policy.selectedCheckoutChargeModel(input), "LEGACY_DESTINATION");
  for (const fn of ["directQuoteIssuanceEnabled", "directReservationEnabled", "directPaymentCreationEnabled", "directFinancialExecutionEnabled"]) assert.equal(policy[fn](input), false);
}
for (const input of [undefined, null, false, true, "DIRECT", {}, { enabled: true }, { providerVerified: true }, { platformAccountId: "acct_other", mode: "live" }]) {
  test(`missing/untrusted runtime activation input ${JSON.stringify(input)} cannot enable any gate`, () => {
    closed(policyWithEnvironment(), input);
    closed(policyWithEnvironment({ NODE_ENV: "production", RFL_DIRECT_ENABLED: "true", DIRECT_CHECKOUT_ACTIVATED: "true", DIRECT_FINANCIAL_EXECUTION_ACTIVATED: "1", RFL_ACTIVATION: JSON.stringify(input) }), input);
  });
}

test("financial compatibility policy delegates to the same closed server source", async () => {
  const h = await harness("ACH", "isolated"), policy = h.load("lib/paymentArchitecturePolicy.ts"), financial = h.load("lib/directFinancialRunnerPolicy.ts");
  closed(policy); assert.equal(financial.directFinancialExecutionEnabled, policy.directFinancialExecutionEnabled);
  assert.doesNotMatch(policySource, /process\.env|providerVerified|fetch\(|getStripeClient/);
});

test("disabled actual creation and financial entry points touch no dependencies or database", async () => {
  const h = await harness("ACH", "isolated"), forbidden = new Proxy({}, { get() { throw Error("Unexpected dependency access"); } });
  await assert.rejects(() => h.load("lib/directPaymentFoundation.ts").createDirectCheckoutSession(forbidden), /disabled/);
  await assert.rejects(() => h.load("lib/directCheckoutLifecycle.ts").startDirectCheckout(forbidden, forbidden, "id", null, identity, "https://example.test"), /disabled/);
  assert.deepEqual(await h.load("lib/directFinancialRunner.ts").processDirectFinancialQueue(forbidden, forbidden, forbidden), { status: "DISABLED", attempted: 0, busy: 0, failed: 0 });
});

async function fresh(method = "CARD", sourceType = "CUSTOM_PAYMENT") {
  const h = await harness(method, "isolated"), f = directStripeFixture(); f.input.connectedAccountId = h.business.stripeConnection.stripeAccountId; f.state.account.id = f.input.connectedAccountId;
  const report = await h.load("lib/stripeDirectReadiness.ts").readDirectChargeReadiness(f.stripe, f.input), lifecycle = h.load("lib/directCheckoutLifecycle.ts"), dispatch = h.load("lib/checkoutDispatch.ts");
  h.business.recurringPlans[0].businessId = h.business.id;
  const plan = { ...h.business.recurringPlans[0] };
  const q = h.load("lib/directPaymentFoundation.ts").prepareDirectCheckoutQuote(report, { property: { ...h.business, createdAt: new Date() }, source: sourceType === "CUSTOM_PAYMENT" ? { sourceType, amount: "123.45" } : { sourceType, plan },
    paymentMethod: method, now: new Date(), identity, connectedAccountId: f.input.connectedAccountId, checkoutAttemptId: "activation-" + randomUUID() });
  const checkout = await h.db.checkoutSession.create({ data: { ...q, lineItems: [...q.lineItems], status: "REVIEWED", expiresAt: new Date(Date.now() + 1800000), firstName: "Synthetic", lastName: "Payer", phone: "5555551234", unitNumber: "101" } });
  await h.load("lib/checkoutConsent.ts").grantCheckoutConsentAccess(checkout.id); await lifecycle.grantDirectReviewAccess(checkout.id);
  return { h, f, checkout, report, lifecycle, dispatch, policy: h.load("lib/paymentArchitecturePolicy.ts"), context: { identity, report, origin: "https://example.test" } };
}
for (const method of ["ACH", "CARD"]) for (const sourceType of ["CUSTOM_PAYMENT", "RECURRING_PLAN"]) {
  const label = `${method} ${sourceType}`;
  test(`${label}: default rollback prevents direct first reservation with no Payment or quote changes`, async () => {
    const f = await fresh(method, sourceType), before = await f.h.db.checkoutSession.findUnique({ where: { id: f.checkout.id } });
    let writes = 0; const create = f.h.db.payment.create; f.h.db.payment.create = (...args) => { writes++; return create(...args); };
    await assert.rejects(() => f.dispatch.prepareDirectCheckoutDispatch(f.h.db, f.h.stripe, f.checkout.id, f.context), /reservations are disabled/);
    await assert.rejects(() => f.lifecycle.reserveDirectAttempt(f.h.db, f.checkout.id, f.report, identity), /reservations are disabled/);
    assert.equal(writes, 0); assert.equal((await f.h.payments()).length, 0); assert.equal(f.h.calls.creates.length, 0);
    assert.deepEqual(await f.h.db.checkoutSession.findUnique({ where: { id: f.checkout.id } }), before);
  });
  test(`${label}: historical original session remains readable/recoverable while new gates are closed`, async () => {
    const f = await webhookFixture("isolated", "DIRECT", method, sourceType), before = await f.current();
    await f.load("lib/paymentResultAccess.ts").grantPaymentResultAccess(f.session.id, f.checkout.id);
    f.session.status = "open"; f.intent.status = "requires_payment_method";
    const result = await f.load("lib/checkoutDispatch.ts").prepareDirectCheckoutDispatch(f.db, f.stripe, f.checkout.id, { identity, report: null, origin: "https://example.test" });
    assert.equal(result.kind, "existing"); assert.equal(result.result.payment.id, before.id);
    assert.deepEqual(await f.current(), before); assert.equal((await f.payments()).length, 1); assert.equal(f.calls.creates.length, 0); closed(f.load("lib/paymentArchitecturePolicy.ts"));
  });
}

test("a hypothetical allowed reservation still requires real reader proof, never a providerVerified flag", async () => {
  const f = await fresh(); f.policy.directReservationEnabled = () => true; // VM decision only, not a production switch or provider proof.
  for (const report of [null, { ...f.report }, { ready: true, providerVerified: true }]) {
    await assert.rejects(() => f.lifecycle.reserveDirectAttempt(f.h.db, f.checkout.id, report, identity));
  }
  assert.equal((await f.h.payments()).length, 0); assert.equal(f.policy.directPaymentCreationEnabled(), false);
});

test("rollback recheck after delayed plan loading prevents a new write", async () => {
  const f = await fresh("CARD", "RECURRING_PLAN"); f.policy.directReservationEnabled = () => true;
  const read = f.h.db.recurringPlan.findFirst; f.h.db.recurringPlan.findFirst = async args => { const result = await read(args); f.policy.directReservationEnabled = () => false; return result; };
  await assert.rejects(() => f.lifecycle.reserveDirectAttempt(f.h.db, f.checkout.id, f.report, identity), /reservations are disabled/);
  assert.equal((await f.h.payments()).length, 0); assert.equal(f.h.calls.creates.length, 0);
});

for (const method of ["ACH", "CARD"]) test(`${method}: ambiguous reserved attempt after rollback repairs only original pointer and never prepares a create`, async () => {
  const f = await webhookFixture("isolated", "DIRECT", method), original = await f.current();
  await f.db.payment.update({ where: { id: original.id }, data: { status: "CREATED", stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null } });
  await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { paymentId: null, stripeCheckoutSessionId: null, status: "REVIEWED" } });
  await f.load("lib/directCheckoutLifecycle.ts").grantDirectReviewAccess(f.checkout.id);
  const result = await f.load("lib/checkoutDispatch.ts").prepareDirectCheckoutDispatch(f.db, f.stripe, f.checkout.id, { identity, report: null, origin: "https://example.test" });
  assert.equal(result.kind, "unconfirmed"); assert.equal(result.request, undefined); assert.equal(result.payment.id, original.id);
  assert.equal((await f.payments()).length, 1); assert.equal(f.calls.creates.length, 0);
  const recovered = await f.load("lib/checkoutDispatch.ts").recoverDirectCheckoutDispatch(f.db, f.stripe, f.checkout.id, f.session.id, identity);
  assert.equal(recovered.payment.id, original.id); assert.equal(recovered.payment.totalChargedCents, original.totalChargedCents); assert.deepEqual(recovered.payment.lineItemsSnapshot, original.lineItemsSnapshot);
});

for (const method of ["ACH", "CARD"]) test(`${method}: historical direct webhooks still settle/deduplicate under legacy-only policy`, async () => {
  const f = await webhookFixture("isolated", "DIRECT", method), original = await f.current();
  assert.equal((await f.send(f.event("checkout.session.completed"))).status, 200);
  f.settle(); const event = f.event(); assert.equal((await f.send(event)).status, 200); assert.equal((await f.send(event)).status, 200);
  const p = await f.current(); assert.equal(p.status, "PAID");
  for (const key of ["checkoutAttemptId", "chargeModel", "pricingVersion", "stripePlatformAccountId", "stripeConnectedAccountId", "stripeMode", "subtotalCents", "platformFeeCents", "rflApplicationFeeCents", "businessProceedsCents", "lineItemsSnapshot"]) assert.deepEqual(p[key], original[key]);
  assert.equal(f.calls.creates.length, 0); assert.equal(f.load("lib/directFinancialRunnerPolicy.ts").directFinancialExecutionEnabled(), false);
});

test("legacy checkout stays unchanged and client activation/architecture values cannot opt in", async () => {
  const f = await fresh(), quote = await f.h.prepare({ chargeModel: "DIRECT", pricingVersion: "RFL_DIRECT_V1", activation: true, providerVerified: true });
  assert.equal(quote.chargeModel, "LEGACY_DESTINATION"); assert.equal((await f.h.start(quote)).status, 200);
  assert.ok(f.h.calls.creates[0].params.payment_intent_data.transfer_data); assert.equal(f.h.calls.creates[0].options.stripeAccount, undefined);
  assert.equal((await f.h.start(f.checkout)).status, 409); assert.equal((await f.h.payments()).length, 1);
  assert.throws(() => { f.policy.directQuoteIssuanceEnabled = () => true; f.h.load("lib/versionedCheckoutQuote.ts").publicQuoteArchitecture(f.h.business.stripeConnection.stripeAccountId); }, /issuance is disabled/);
});
