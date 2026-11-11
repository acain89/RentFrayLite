import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { harness } from "./helpers/checkout-harness.mjs";
import { directStripeFixture } from "./helpers/stripe-foundation-harness.mjs";

async function fixture(method = "CARD", sourceType = "RECURRING_PLAN", amount = "123.45", at = "2026-11-08T18:00Z") {
  const clock = { now: at }, h = await harness(method, "isolated", clock), f = directStripeFixture();
  Object.assign(h.business, { createdAt: new Date("2026-10-15T12:00Z"), propertyTimeZone: "America/Chicago", firstStandardBillingDate: new Date("2026-11-01") });
  const plan = h.business.recurringPlans[0];
  Object.assign(plan, { businessId: h.business.id, gracePeriodDays: 5, initialLateFeeCents: 1000, dailyLateFeeCents: 100, dailyLateFeeMaxDays: 10,
    charges: [{ id: "mandatory", label: "Mandatory charge", amountCents: 5000, isActive: true, effectiveBillingCycle: null, endsAfterBillingCycle: null }] });
  f.input.connectedAccountId = h.business.stripeConnection.stripeAccountId; f.state.account.id = f.input.connectedAccountId;
  const report = await h.load("lib/stripeDirectReadiness.ts").readDirectChargeReadiness(f.stripe, f.input);
  const service = h.load("lib/versionedCheckoutQuote.ts");
  const input = { property: h.business, source: sourceType === "CUSTOM_PAYMENT" ? { sourceType, amount } : { sourceType, plan },
    paymentMethod: method, now: new Date(at), identity: f.input.identity, connectedAccountId: f.input.connectedAccountId, checkoutAttemptId: "quote-" + randomUUID() };
  const prepare = (overrides = {}) => service.prepareVersionedCheckoutQuote({ chargeModel: "DIRECT", report, input: { ...input, ...overrides } });
  const persist = async () => {
    const { pricing } = prepare();
    const q = await h.db.checkoutSession.create({ data: { ...pricing, lineItems: [...pricing.lineItems], status: "CREATED", firstName: "SyntheticPrivateFirst", lastName: "SyntheticPrivateLast", phone: "5555551234", unitNumber: "SyntheticPrivateUnit", createdAt: input.now, expiresAt: new Date(input.now.getTime() + 30 * 60 * 1000) } });
    await h.load("lib/checkoutConsent.ts").grantCheckoutConsentAccess(q.id); return q;
  };
  const review = q => h.load("app/[accountCode]/review/page.tsx").default({ params: Promise.resolve({ accountCode: q.accountCode }), searchParams: Promise.resolve({ session: q.id }) });
  return { h, f, clock, plan, report, input, service, prepare, persist, review };
}

for (const method of ["CARD", "ACH"]) for (const [amount, cardFee, achFee] of [["1.00",200,100],["3.00",200,100],["24.99",200,100],["25.00",200,100],["25.01",300,150],["449.99",1900,950],["450.00",1900,950],["450.01",2000,995],["4999.99",20100,995],["5000.00",20100,995]]) {
  test(`${method} direct versioned Custom $${amount} uses approved cent boundaries`, async () => {
    const f = await fixture(method, "CUSTOM_PAYMENT", amount), { pricing: q, architecture } = f.prepare();
    const cents = Number(amount.replace(".", ""));
    assert.equal(q.subtotalCents, cents); assert.equal(q.platformFeeCents, method === "CARD" ? cardFee : achFee);
    assert.equal(q.totalCents, cents + q.platformFeeCents); assert.equal(q.expectedManagementNetCents, cents);
    assert.equal(q.totalCents - q.expectedStripeProcessingFeeCents - q.rflApplicationFeeCents, cents);
    assert.equal(architecture.chargeModel, "DIRECT"); assert.equal(architecture.pricingVersion, "RFL_DIRECT_V1");
    assert.equal(q.lineItems[1].label, method === "CARD" ? "Card processing fee" : "ACH processing fee");
    assert.equal(q.lineItems.reduce((n, x) => n + x.amountCents, 0), q.totalCents);
    assert.equal(Object.isFrozen(q), true); assert.equal(Object.isFrozen(q.lineItems[0]), true);
    if (method === "CARD" && amount === "3.00") assert.equal(q.expectedStripeProcessingFeeCents, 45); // 14.5 -> 15, plus 30.
    if (amount === "5000.00") assert.ok(q.totalCents > 500000);
  });
}

for (const method of ["CARD", "ACH"]) for (const sourceType of ["RECURRING_PLAN", "CUSTOM_PAYMENT"]) {
  const label = `${method} ${sourceType}`;
  test(`${label}: owned CREATED quote renders its stored itemization and becomes REVIEWED`, async () => {
    const f = await fixture(method, sourceType), q = await f.persist(), result = await f.review(q);
    assert.equal(result.props.firstName, q.firstName); assert.deepEqual(result.props.lineItems, q.lineItems);
    assert.equal(result.props.totalCents, q.totalCents); assert.equal(result.props.platformFeeCents, q.platformFeeCents);
    assert.equal((await f.h.db.checkoutSession.findUnique({ where: { id: q.id } })).status, "REVIEWED");
    if (sourceType === "RECURRING_PLAN") {
      assert.equal(q.baseAmountCents, 100000); assert.equal(q.recurringChargesCents, 5000);
      assert.equal(q.initialLateFeeCents, 1000); assert.equal(q.dailyLateFeesCents, 200); assert.equal(q.subtotalCents, 106200);
    }
    assert.equal(f.h.calls.creates.length, 0); assert.equal(f.h.calls.reads.length, 0);
  });
  for (const kind of ["missing", "invalid", "mismatched", "expired"]) test(`${label}: ${kind} ownership fails closed without PII`, async () => {
    const f = await fixture(method, sourceType), q = await f.persist();
    const key = [...f.h.cookieJar.keys()].find(k => k.startsWith("rfl_checkout_"));
    if (kind === "missing") f.h.cookieJar.delete(key);
    if (kind === "invalid") f.h.cookieJar.set(key, "invalid");
    if (kind === "mismatched") {
      await f.h.load("lib/checkoutConsent.ts").grantCheckoutConsentAccess("different-quote");
      const other = [...f.h.cookieJar.keys()].find(k => k !== key); f.h.cookieJar.set(key, f.h.cookieJar.get(other));
    }
    if (kind === "expired") f.clock.now = "2026-11-08T18:31Z";
    await assert.rejects(() => f.review(q), e => { assert.equal(e.message, "NOT_FOUND"); return true; });
    assert.equal((await f.h.db.checkoutSession.findUnique({ where: { id: q.id } })).status, "CREATED");
    assert.equal((await f.h.payments()).length, 0);
  });
  test(`${label}: direct first reservation cannot enter legacy dispatch`, async () => {
    const f = await fixture(method, sourceType), q = await f.persist(); await f.review(q);
    const response = await f.h.start(q); assert.notEqual(response.status, 200);
    assert.equal(f.h.calls.creates.length, 0); assert.equal((await f.h.payments()).length, 0);
  });
  test(`${label}: historical reserved quote is displayed unchanged after configuration changes`, async () => {
    const f = await fixture(method, sourceType), q = await f.persist();
    const payment = await f.h.db.payment.create({ data: f.h.load("lib/directPaymentFoundation.ts").prepareDirectPaymentRecord(q, f.report, f.input.identity) });
    const linked = await f.h.db.checkoutSession.update({ where: { id: q.id }, data: { paymentId: payment.id, stripeCheckoutSessionId: "cs_mock_original", status: "CHECKOUT_STARTED" } });
    await f.h.load("lib/paymentResultAccess.ts").grantPaymentResultAccess("cs_mock_original", q.id);
    f.plan.baseAmountCents += 10000; f.clock.now = "2026-11-10T18:00Z";
    const before = await f.h.db.checkoutSession.findUnique({ where: { id: q.id } }), result = await f.review(linked);
    assert.equal(result.props.totalCents, q.totalCents); assert.deepEqual(result.props.lineItems, q.lineItems);
    assert.deepEqual(await f.h.db.checkoutSession.findUnique({ where: { id: q.id } }), before);
  });
}

for (const change of ["base", "mandatory", "midnight", "calendar", "fee", "estimate", "item"]) test(`direct unreserved ${change} change rejects review without rewriting snapshot`, async () => {
  const f = await fixture("CARD", "RECURRING_PLAN", undefined, "2026-11-09T05:59Z"), q = await f.persist();
  if (change === "base") f.plan.baseAmountCents++;
  if (change === "mandatory") f.plan.charges[0].amountCents++;
  if (change === "midnight") { f.clock.now = "2026-11-09T06:01Z"; await f.h.load("lib/checkoutConsent.ts").grantCheckoutConsentAccess(q.id); }
  if (change === "calendar") f.h.business.firstStandardBillingDate = new Date("2026-12-01");
  if (change === "fee") await f.h.db.checkoutSession.update({ where: { id: q.id }, data: { platformFeeCents: q.platformFeeCents + 1 } });
  if (change === "estimate") await f.h.db.checkoutSession.update({ where: { id: q.id }, data: { expectedStripeProcessingFeeCents: q.expectedStripeProcessingFeeCents + 1, rflApplicationFeeCents: q.rflApplicationFeeCents - 1 } });
  if (change === "item") await f.h.db.checkoutSession.update({ where: { id: q.id }, data: { lineItems: [...q.lineItems, { type: "PLATFORM_FEE", label: "Injected", amountCents: 0 }] } });
  const before = await f.h.db.checkoutSession.findUnique({ where: { id: q.id } });
  await assert.rejects(() => f.review(q), /Payment review unavailable/);
  assert.deepEqual(await f.h.db.checkoutSession.findUnique({ where: { id: q.id } }), before);
  for (const value of [q.firstName, q.lastName, q.phone, q.unitNumber]) assert.ok(!JSON.stringify(f.h.calls.errors).includes(value));
});

for (const amount of [99, 500001]) test(`aggregate direct standard obligation ${amount} cents is rejected`, async () => {
  const f = await fixture(); Object.assign(f.plan, { baseAmountCents: amount, charges: [], initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0 });
  assert.throws(f.prepare, /managementOwedCents/);
});

test("direct standard eligibility keeps first-cycle authority; Custom bypasses rent calendar only", async () => {
  const f = await fixture("ACH", "RECURRING_PLAN", undefined, "2026-10-25T18:00Z");
  assert.throws(f.prepare, /available/);
  const q = f.prepare({ source: { sourceType: "CUSTOM_PAYMENT", amount: "1.00" } }).pricing;
  assert.equal(q.billingCycle, null); assert.equal(q.subtotalCents, 100);
});

test("legacy pricing callback remains exact; public factory cannot issue direct even if a policy selector is forged", async () => {
  const f = await fixture(); const old = f.h.load("lib/customPayment.ts").quoteCustomPayment(10000, "CARD");
  const result = f.service.prepareVersionedCheckoutQuote({ ...f.service.publicQuoteArchitecture(f.input.connectedAccountId), quote: () => old });
  assert.equal(result.pricing, old); assert.equal(result.architecture.chargeModel, "LEGACY_DESTINATION");
  assert.equal(result.architecture.rflApplicationFeeCents, old.platformFeeCents);
  f.h.load("lib/paymentArchitecturePolicy.ts").selectedCheckoutChargeModel = () => "DIRECT";
  assert.throws(() => f.service.publicQuoteArchitecture(f.input.connectedAccountId), /issuance is disabled/);
  assert.throws(() => f.service.prepareVersionedCheckoutQuote({ chargeModel: "forged" }), /Unsupported/);
  assert.equal(f.h.load("lib/paymentArchitecturePolicy.ts").directPaymentCreationEnabled(), false);
});

test("public legacy quote ignores standard architecture spoofing and rejects Custom overrides", async () => {
  const f = await fixture(), q = await f.h.prepare({ chargeModel: "DIRECT", pricingVersion: "RFL_DIRECT_V1", totalCents: 1 });
  assert.equal(q.chargeModel, "LEGACY_DESTINATION"); assert.equal(q.pricingVersion, "RFL_LEGACY_V1");
  const response = await f.h.load("app/api/public/checkout/session/route.ts").POST(new Request("https://example.test/api/public/checkout/session", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: JSON.stringify({ sourceType: "CUSTOM_PAYMENT", accountCode: f.h.business.accountCode, amount: "1.00", chargeModel: "DIRECT" }) }));
  assert.equal(response.status, 400); assert.equal(f.h.calls.creates.length, 0);
});

for (const method of ["ACH", "CARD"]) test(`${method}: direct standard aggregate maximum includes mandatory charges and late fees`, async () => {
  const f = await fixture(method); f.plan.baseAmountCents = 493800;
  const q = f.prepare().pricing; assert.equal(q.subtotalCents, 500000); assert.equal(q.expectedManagementNetCents, 500000); assert.ok(q.totalCents > 500000);
  f.plan.baseAmountCents++; assert.throws(f.prepare, /managementOwedCents/);
  Object.assign(f.plan, { baseAmountCents: 100, charges: [], initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0 });
  assert.equal(f.prepare().pricing.subtotalCents, 100);
});

test("independent direct quote preparation keeps independent immutable attempt identities", async () => {
  const f = await fixture("ACH", "CUSTOM_PAYMENT"), first = f.prepare().pricing;
  const second = f.prepare({ checkoutAttemptId: "quote-" + randomUUID() }).pricing;
  assert.notEqual(first.id, second.id); assert.equal(first.subtotalCents, second.subtotalCents);
  assert.equal(first.totalCents, second.totalCents); assert.equal(first.stripeConnectedAccountId, second.stripeConnectedAccountId);
  assert.throws(() => { first.lineItems[0].amountCents++; });
});
