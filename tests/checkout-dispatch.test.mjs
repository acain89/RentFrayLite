import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { harness } from "./helpers/checkout-harness.mjs";
import { directStripeFixture } from "./helpers/stripe-foundation-harness.mjs";

async function fixture(method = "CARD", sourceType = "CUSTOM_PAYMENT") {
  const clock = { now: "2026-11-08T18:00Z" }, h = await harness(method, "isolated", clock), f = directStripeFixture();
  Object.assign(h.business, { createdAt: new Date("2026-10-15T12:00Z"), propertyTimeZone: "America/Chicago", firstStandardBillingDate: new Date("2026-11-01") });
  const plan = h.business.recurringPlans[0]; plan.businessId = h.business.id; plan.gracePeriodDays = 5;
  const paymentCreate = h.db.payment.create;
  h.db.payment.create = args => paymentCreate({ ...args, data: { ...args.data, createdAt: args.data.createdAt ?? new Date(clock.now) } });
  f.input.connectedAccountId = h.business.stripeConnection.stripeAccountId; f.state.account.id = f.input.connectedAccountId;
  const readiness = h.load("lib/stripeDirectReadiness.ts"), foundation = h.load("lib/directPaymentFoundation.ts"), lifecycle = h.load("lib/directCheckoutLifecycle.ts"), dispatch = h.load("lib/checkoutDispatch.ts");
  // Synthetic reservation state only; provider creation and real verification stay disabled.
  h.load("lib/paymentArchitecturePolicy.ts").directReservationEnabled = () => true;
  const context = { identity: f.input.identity, report: await readiness.readDirectChargeReadiness(f.stripe, f.input), origin: "https://example.test" };
  const quote = async () => {
    const q = foundation.prepareDirectCheckoutQuote(context.report, { property: h.business, source: sourceType === "CUSTOM_PAYMENT" ? { sourceType, amount: "123.45" } : { sourceType, plan }, paymentMethod: method,
      now: new Date(clock.now), identity: context.identity, connectedAccountId: f.input.connectedAccountId, checkoutAttemptId: "dispatch-" + randomUUID() });
    const row = await h.db.checkoutSession.create({ data: { ...q, lineItems: [...q.lineItems], firstName: "Synthetic", lastName: "Payer", phone: "5555551234", unitNumber: "101", status: "CREATED", createdAt: new Date(clock.now), expiresAt: new Date(new Date(clock.now).getTime() + 1800000) } });
    await h.load("lib/checkoutConsent.ts").grantCheckoutConsentAccess(row.id);
    await h.load("app/[accountCode]/review/page.tsx").default({ params: Promise.resolve({ accountCode: row.accountCode }), searchParams: Promise.resolve({ session: row.id }) });
    return h.db.checkoutSession.findUnique({ where: { id: row.id } });
  };
  const checkout = await quote(), state = { sessions: new Map(), intents: new Map(), keys: new Map(), reads: [], creates: 0, onRead: null };
  const stripe = { checkout: { sessions: {
    create: async () => { state.creates++; throw Error("Actual direct creation must remain disabled"); },
    retrieve: async (id, _params, options) => { state.reads.push({ id, options }); assert.equal(options.stripeAccount, f.input.connectedAccountId); await state.onRead?.(); assert.ok(state.sessions.has(id)); return structuredClone(state.sessions.get(id)); },
  } }, paymentIntents: { retrieve: async (id, _params, options) => { state.reads.push({ id, options }); assert.equal(options.stripeAccount, f.input.connectedAccountId); assert.ok(state.intents.has(id)); return structuredClone(state.intents.get(id)); } } };
  // Simulate the future provider accepting an immutable request. This fixture is
  // NOT an executor: no production gate is changed and no SDK create is called.
  const accept = prepared => {
    const { params, options } = prepared.request, key = options.stripeAccount + ":" + options.idempotencyKey;
    if (!state.keys.has(key)) {
      const id = "cs_mock_" + randomUUID().replaceAll("-", ""); state.keys.set(key, id);
      state.sessions.set(id, { id, livemode: false, mode: "payment", currency: "usd", amount_total: prepared.payment.totalChargedCents, client_reference_id: prepared.payment.id,
        metadata: structuredClone(params.metadata), payment_method_types: params.payment_method_types, status: "open", payment_status: "unpaid", payment_intent: null, url: "https://checkout.stripe.com/c/pay/mock" });
    }
    return state.keys.get(key);
  };
  const prepare = (id = checkout.id) => dispatch.prepareDirectCheckoutDispatch(h.db, stripe, id, context);
  const recover = (sessionId, db = h.db) => dispatch.recoverDirectCheckoutDispatch(db, stripe, checkout.id, sessionId, context.identity);
  const intent = (prepared, sessionId, status) => {
    const id = "pi_mock", metadata = prepared.request.params.metadata;
    state.intents.set(id, { id, livemode: false, currency: "usd", amount: prepared.payment.totalChargedCents, application_fee_amount: prepared.payment.rflApplicationFeeCents, metadata, status, latest_charge: null });
    state.sessions.get(sessionId).payment_intent = id; return state.intents.get(id);
  };
  return { h, f, clock, context, quote, checkout, state, stripe, foundation, lifecycle, dispatch, readiness, prepare, accept, recover, intent };
}

for (const method of ["ACH", "CARD"]) for (const sourceType of ["CUSTOM_PAYMENT", "RECURRING_PLAN"]) {
  const label = `${method} ${sourceType}`;
  test(`${label}: dispatch prepares only original connected account and immutable approved allocation`, async () => {
    const f = await fixture(method, sourceType), p = await f.prepare(), c = p.checkout;
    assert.equal(p.kind, "prepared"); assert.equal(p.creationEnabled, false); assert.equal(f.state.creates, 0);
    assert.equal(p.request.options.stripeAccount, c.stripeConnectedAccountId); assert.equal(p.request.options.idempotencyKey, "rfl-payment-" + p.payment.id);
    assert.equal(p.request.params.payment_intent_data.transfer_data, undefined); assert.equal(p.request.params.payment_intent_data.application_fee_amount, c.rflApplicationFeeCents);
    assert.deepEqual(p.request.params.payment_method_types, [method === "ACH" ? "us_bank_account" : "card"]);
    assert.equal(p.payment.businessProceedsCents, c.subtotalCents); assert.equal(p.payment.totalChargedCents - c.expectedStripeProcessingFeeCents - c.rflApplicationFeeCents, c.subtotalCents);
    assert.deepEqual(p.payment.lineItemsSnapshot, c.lineItems); assert.equal(Object.isFrozen(p.request.params), true);
    assert.equal((await f.h.start(c)).status, 409); assert.equal(f.h.calls.creates.length, 0);
  });
  test(`${label}: duplicate requests reuse one payment/key; independent attempts stay separate`, async () => {
    const f = await fixture(method, sourceType), results = await Promise.all(Array.from({ length: 5 }, () => f.prepare()));
    assert.equal(new Set(results.map(p => p.payment.id)).size, 1); assert.equal(new Set(results.map(p => f.accept(p))).size, 1);
    const other = await f.quote(), separate = await f.prepare(other.id); assert.notEqual(separate.payment.id, results[0].payment.id);
    assert.notEqual(separate.request.options.idempotencyKey, results[0].request.options.idempotencyKey); assert.equal(f.state.creates, 0);
  });
  test(`${label}: ambiguous response recovers known ID without replacing payment or repricing`, async () => {
    const f = await fixture(method, sourceType), p = await f.prepare(), id = f.accept(p), before = structuredClone(p.payment);
    // Accepted provider state, lost response: local row deliberately remains CREATED.
    const retry = await f.prepare(); assert.equal(retry.payment.id, p.payment.id); assert.deepEqual(retry.request, p.request); assert.equal(f.accept(retry), id);
    f.h.business.stripeConnection.stripeAccountId = "acct_replacement";
    const recovered = await f.recover(id); assert.equal(recovered.payment.id, p.payment.id); assert.equal(recovered.payment.status, "CHECKOUT_STARTED");
    const existing = await f.prepare(); assert.equal(existing.kind, "existing"); assert.equal(existing.result.checkoutUrl, "https://checkout.stripe.com/c/pay/mock");
    assert.equal(existing.result.payment.totalChargedCents, before.totalChargedCents); assert.equal((await f.h.payments()).length, 1); assert.equal(f.state.creates, 0);
  });
  for (const cookie of ["missing", "invalid", "mismatched", "expired"]) test(`${label}: ${cookie} quote binding cannot reserve`, async () => {
    const f = await fixture(method, sourceType), key = [...f.h.cookieJar.keys()].find(k => k.startsWith("rfl_checkout_"));
    if (cookie === "missing") f.h.cookieJar.delete(key);
    if (cookie === "invalid") f.h.cookieJar.set(key, "invalid");
    if (cookie === "mismatched") { await f.h.load("lib/checkoutConsent.ts").grantCheckoutConsentAccess("other"); f.h.cookieJar.set(key, [...f.h.cookieJar].find(([k]) => k !== key)[1]); }
    if (cookie === "expired") f.clock.now = "2026-11-08T18:31Z";
    await assert.rejects(f.prepare); assert.equal((await f.h.payments()).length, 0); assert.equal(f.state.creates, 0); assert.equal(f.state.reads.length, 0);
  });
}

test("durable attempt cookie alone cannot authorize FIRST reservation", async () => {
  const f = await fixture(); await f.lifecycle.grantDirectReviewAccess(f.checkout.id);
  for (const key of [...f.h.cookieJar.keys()]) if (key.startsWith("rfl_checkout_")) f.h.cookieJar.delete(key);
  await assert.rejects(f.prepare); assert.equal((await f.h.payments()).length, 0);
});

test("quote ownership is rechecked after asynchronous plan reads under the write lock", async () => {
  const f = await fixture("CARD", "RECURRING_PLAN"); f.clock.now = "2026-11-08T18:29:59Z";
  f.context.report = await f.readiness.readDirectChargeReadiness(f.f.stripe, f.f.input);
  await f.h.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { expiresAt: new Date("2026-11-08T19:00Z") } });
  const read = f.h.db.recurringPlan.findFirst; f.h.db.recurringPlan.findFirst = async args => { const plan = await read(args); f.clock.now = "2026-11-08T18:30:01Z"; return plan; };
  await assert.rejects(f.prepare); assert.equal((await f.h.payments()).length, 0);
});

test("reserved direct resumption remains read-only with expired quote, no fresh readiness and changed calendar", async () => {
  const f = await fixture("CARD", "RECURRING_PLAN"), p = await f.prepare(), id = f.accept(p); await f.recover(id);
  for (const key of [...f.h.cookieJar.keys()]) if (key.startsWith("rfl_checkout_") || key.startsWith("rfl_result_")) f.h.cookieJar.delete(key);
  // Keep only the genuine provider-result cookie; the direct-attempt cookie is not required for read-only resume.
  await f.h.load("lib/paymentResultAccess.ts").grantPaymentResultAccess(id, f.checkout.id);
  f.context.report = null; f.clock.now = "2026-11-20T18:00Z"; f.h.business.propertyTimeZone = null;
  const before = await f.h.db.payment.findUnique({ where: { id: p.payment.id } }), result = await f.prepare();
  assert.equal(result.kind, "existing"); assert.ok(result.result.checkoutUrl); assert.deepEqual(await f.h.db.payment.findUnique({ where: { id: p.payment.id } }), before);
});

test("aged ambiguous direct attempt never prepares a replacement request", async () => {
  const f = await fixture(), p = await f.prepare();
  await f.h.db.payment.update({ where: { id: p.payment.id }, data: { createdAt: new Date("2026-11-07T18:00Z") } });
  const result = await f.prepare(); assert.equal(result.kind, "unconfirmed"); assert.equal(result.payment.id, p.payment.id); assert.equal(result.request, undefined); assert.equal(f.state.creates, 0);
});

test("known-ID persistence failure rolls back and recovers only that same attempt", async () => {
  const f = await fixture(), p = await f.prepare(), id = f.accept(p);
  const broken = new Proxy(f.h.db, { get(target, key) { if (key === "$transaction") return (fn, opts) => target.$transaction(tx => fn({ ...tx, checkoutSession: { ...tx.checkoutSession, update: async () => { throw Error("Synthetic write failure"); } } }), opts); return target[key]; } });
  await assert.rejects(() => f.recover(id, broken));
  assert.equal((await f.h.db.payment.findUnique({ where: { id: p.payment.id } })).stripeCheckoutSessionId, null);
  await f.recover(id); assert.equal((await f.h.payments()).length, 1); assert.equal(f.state.creates, 0);
});

for (const changed of ["platform", "mode", "account", "fee", "method", "tenant"]) test(`direct ${changed} mismatch cannot prepare or recover`, async () => {
  const f = await fixture(), p = await f.prepare();
  if (changed === "platform") f.context.identity = { ...f.context.identity, platformAccountId: "acct_wrong" };
  if (changed === "mode") f.context.identity = { ...f.context.identity, mode: "live" };
  if (changed === "account") await f.h.db.payment.update({ where: { id: p.payment.id }, data: { stripeConnectedAccountId: "acct_wrong" } });
  if (changed === "fee") await f.h.db.payment.update({ where: { id: p.payment.id }, data: { rflApplicationFeeCents: p.payment.rflApplicationFeeCents + 1 } });
  if (changed === "method") await f.h.db.payment.update({ where: { id: p.payment.id }, data: { paymentMethod: "ACH" } });
  if (changed === "tenant") await f.h.db.payment.update({ where: { id: p.payment.id }, data: { payerFirstName: "Changed" } });
  await assert.rejects(f.prepare); assert.equal(f.state.creates, 0);
});

for (const status of ["requires_payment_method", "processing", "succeeded", "canceled"]) test(`existing direct ${status} observation never creates or settles a payment`, async () => {
  const f = await fixture(status === "requires_payment_method" ? "CARD" : "ACH"), p = await f.prepare(), id = f.accept(p); await f.recover(id);
  f.intent(p, id, status);
  if (status === "requires_payment_method") await f.h.db.payment.update({ where: { id: p.payment.id }, data: { status: "FAILED" } });
  const before = await f.h.db.payment.findUnique({ where: { id: p.payment.id } }), result = await f.prepare();
  assert.equal(Boolean(result.result.checkoutUrl), status === "requires_payment_method");
  assert.deepEqual(await f.h.db.payment.findUnique({ where: { id: p.payment.id } }), before); assert.equal(f.state.creates, 0);
});

test("legacy callback, client spoofing and public direct rejection keep all creation gates closed", async () => {
  const f = await fixture(), legacy = await f.h.prepare({ chargeModel: "DIRECT", pricingVersion: "RFL_DIRECT_V1" });
  let calls = 0; const answer = await f.dispatch.reserveLegacyCheckoutDispatch(legacy, async () => { calls++; return "legacy"; });
  assert.equal(answer, "legacy"); assert.equal(calls, 1);
  await assert.rejects(() => f.dispatch.reserveLegacyCheckoutDispatch(f.checkout, async () => { calls++; })); assert.equal(calls, 1);
  await assert.rejects(() => f.dispatch.prepareDirectCheckoutDispatch(f.h.db, f.stripe, legacy.id, f.context));
  assert.equal((await f.h.start(legacy)).status, 200); assert.ok(f.h.calls.creates[0].params.payment_intent_data.transfer_data);
  const noProvider = () => { throw Error("Direct public dispatch must not initialize Stripe"); }; f.h.mocks["@/lib/stripe"].getStripeClient = noProvider;
  const response = await f.h.start(f.checkout); assert.equal(response.status, 409); assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(f.h.load("lib/paymentArchitecturePolicy.ts").directPaymentCreationEnabled(), false);
  await assert.rejects(() => f.lifecycle.startDirectCheckout(f.h.db, f.stripe, f.checkout.id, f.context.report, f.context.identity, f.context.origin), /disabled/);
  assert.equal(f.state.creates, 0);
});

test("reviewed but stale direct obligation cannot reserve an immutable payment", async () => {
  const f = await fixture("CARD", "RECURRING_PLAN"); f.h.business.recurringPlans[0].baseAmountCents++;
  await assert.rejects(f.prepare, /quote changed/); assert.equal((await f.h.payments()).length, 0); assert.equal(f.state.creates, 0);
});

test("legacy malformed totals retain the legacy backend validation boundary", async () => {
  const f = await fixture(), legacy = await f.h.prepare();
  assert.equal(f.dispatch.checkoutDispatchModel({ ...legacy, totalCents: legacy.totalCents + 1 }), "LEGACY_DESTINATION");
  assert.equal(f.dispatch.checkoutDispatchModel({ ...legacy, chargeModel: "DIRECT" }), null);
});
