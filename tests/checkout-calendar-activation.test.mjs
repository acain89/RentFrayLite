import assert from "node:assert/strict";
import test from "node:test";
import { harness } from "./helpers/checkout-harness.mjs";

async function fixture(method = "ACH", now = "2026-10-01T05:00:00Z", overrides = {}) {
  const clock = { now };
  const h = await harness(method, "isolated", clock);
  Object.assign(h.business, { createdAt: new Date("2026-09-15T12:00:00Z"), propertyTimeZone: "America/Chicago", firstStandardBillingDate: new Date("2026-10-01T00:00:00Z") }, overrides);
  Object.assign(h.business.recurringPlans[0], { dueDay: 1, gracePeriodDays: 3, initialLateFeeCents: 500, dailyLateFeeCents: 100, dailyLateFeeMaxDays: 10,
    charges: [{ id: "water", label: "Water", amountCents: 2000, isActive: true, effectiveBillingCycle: null, endsAfterBillingCycle: null, sortOrder: 0 }] });
  const create = extra => h.load("app/api/public/checkout/session/route.ts").POST(new Request("https://example.test/api", { method:"POST",headers:{"content-type":"application/json",origin:"https://example.test"},body:JSON.stringify({
    accountCode: h.business.accountCode, planId: h.business.recurringPlans[0].id, unitNumber: "101", firstName: "Test", lastName: "Payer", phone: "5555551234", paymentMethod: method, ...extra,
  }) }));
  const review = checkout => h.load("app/[accountCode]/review/page.tsx").default({ params: Promise.resolve({ accountCode: h.business.accountCode }), searchParams: Promise.resolve({ session: checkout.id }) });
  return { ...h, clock, create, review };
}

for (const method of ["ACH", "CARD"]) {
  test(`${method}: creation before first local midnight is blocked with availability date`, async () => {
    const h = await fixture(method, "2026-10-01T04:59:59.999Z"); const response = await h.create({ now: "2099-01-01", dueDay: 1, billingCycle: "2026-10" });
    assert.equal(response.status, 409); const body = await response.json(); assert.equal(body.code, "BEFORE_FIRST_CYCLE"); assert.match(body.error, /October 1, 2026.*America\/Chicago/);
    assert.equal((await h.payments()).length, 0); assert.equal((await h.db.checkoutSession.findMany()).length, 0); assert.equal(h.calls.creates.length, 0);
  });
  test(`${method}: first local midnight permits a consistent review and unchanged Stripe allocation`, async () => {
    const h = await fixture(method); const checkout = await h.prepare(); const review = await h.review(checkout);
    assert.equal(checkout.billingCycle, "2026-10"); assert.equal(checkout.initialLateFeeCents, 0); assert.equal(checkout.dailyLateFeesCents, 0); assert.equal(checkout.subtotalCents, 102000);
    assert.equal(review.props.totalCents, checkout.totalCents); assert.equal(review.props.dueDate, "2026-10-01T00:00:00.000Z");
    assert.equal((await h.start(checkout)).status, 200);
    const [payment] = await h.payments(), params = h.calls.creates[0].params;
    assert.equal(params.line_items.reduce((sum, item) => sum + item.price_data.unit_amount, 0), review.props.totalCents);
    assert.equal(payment.totalChargedCents, review.props.totalCents); assert.deepEqual(payment.lineItemsSnapshot, checkout.lineItems);
    assert.equal(params.payment_intent_data.application_fee_amount, checkout.platformFeeCents);
    assert.equal(params.payment_intent_data.transfer_data.destination, payment.stripeConnectedAccountId);
    assert.equal(payment.chargeModel, "LEGACY_DESTINATION"); assert.equal(payment.pricingVersion, "RFL_LEGACY_V1");
  });
  test(`${method}: a pre-existing reviewed session cannot bypass start eligibility`, async () => {
    const h = await fixture(method); const checkout = await h.prepare(); h.clock.now = "2026-10-01T04:59:59.999Z";
    const response = await h.start(checkout); assert.equal(response.status, 409); assert.equal((await response.json()).code, "BEFORE_FIRST_CYCLE");
    assert.equal((await h.payments()).length, 0); assert.equal(h.calls.creates.length, 0);
  });
  for (const grace of [3, 4, 5]) for (const [label, iso, initial, daily] of [
    ["last grace millisecond", `2026-10-0${grace + 1}T04:59:59.999Z`, 0, 0],
    ["initial boundary", `2026-10-0${grace + 1}T05:00:00Z`, 500, 0],
    ["daily boundary", `2026-10-0${grace + 2}T05:00:00Z`, 500, 100],
    ["second daily day", `2026-10-0${grace + 3}T05:00:00Z`, 500, 200],
  ]) test(`${method}: grace ${grace}, ${label} has exact cents`, async () => {
    const h = await fixture(method, iso); h.business.recurringPlans[0].gracePeriodDays = grace;
    const checkout = await h.prepare(); assert.equal(checkout.initialLateFeeCents, initial); assert.equal(checkout.dailyLateFeesCents, daily);
    assert.equal(checkout.subtotalCents, 102000 + initial + daily); assert.equal((await h.start(checkout)).status, 200);
    assert.equal((await h.payments())[0].totalChargedCents, checkout.totalCents);
  });
  test(`${method}: crossing a grace boundary rejects an unstarted quote without rewriting it`, async () => {
    const h = await fixture(method, "2026-10-04T04:59:59.999Z"); const checkout = await h.prepare(); const before = structuredClone(checkout);
    h.clock.now = "2026-10-04T05:00:00Z"; const response = await h.start(checkout);
    assert.equal(response.status, 409); assert.equal((await response.json()).code, "QUOTE_CHANGED");
    assert.deepEqual(await h.db.checkoutSession.findUnique({ where: { id: checkout.id } }), before); assert.equal((await h.payments()).length, 0);
    const fresh = await h.prepare(); assert.equal(fresh.initialLateFeeCents, 500); assert.equal((await h.start(fresh)).status, 200); assert.equal(h.calls.creates.length, 1);
  });
  test(`${method}: calendar is revalidated inside reservation after earlier readiness reads`, async () => {
    const h = await fixture(method, "2026-10-04T04:59:59.999Z"); const checkout = await h.prepare();
    h.live.onBeforeReserve = () => { h.clock.now = "2026-10-04T05:00:00Z"; };
    assert.equal((await h.start(checkout)).status, 409); assert.equal((await h.payments()).length, 0); assert.equal(h.calls.creates.length, 0);
  });
  test(`${method}: an existing linked attempt stays immutable across midnight and settings edits`, async () => {
    const h = await fixture(method, "2026-10-04T04:59:59.999Z"); const attempt = await h.original();
    const before = await h.db.payment.findUnique({ where: { id: attempt.payment.id } });
    h.clock.now = "2026-10-04T05:00:00Z"; h.business.recurringPlans[0].initialLateFeeCents = 900;
    assert.equal((await h.start(attempt.checkout)).status, 200); assert.equal(h.calls.creates.length, 1); assert.equal((await h.payments()).length, 1);
    assert.deepEqual(await h.db.payment.findUnique({ where: { id: attempt.payment.id } }), before);
    assert.equal((await h.review(attempt.checkout)).props.totalCents, before.totalChargedCents);
    const fresh = await h.prepare(); assert.equal((await h.start(fresh)).status, 200); assert.equal(h.calls.creates.length, 2);
    assert.equal((await h.db.payment.findUnique({ where: { id: attempt.payment.id } })).totalChargedCents, before.totalChargedCents);
  });
  test(`${method}: simultaneous starts retain one Payment and Stripe idempotency key`, async () => {
    const h = await fixture(method); const checkout = await h.prepare(); await Promise.all([h.start(checkout), h.start(checkout)]);
    assert.equal((await h.payments()).length, 1); assert.equal(h.live.sessions.size, 1);
    assert.equal(new Set(h.calls.creates.map(call => call.options.idempotencyKey)).size, 1);
  });
}

for (const overrides of [
  { propertyTimeZone: null }, { firstStandardBillingDate: null }, { propertyTimeZone: undefined, firstStandardBillingDate: undefined },
  { propertyTimeZone: "Not/AZone" }, { firstStandardBillingDate: new Date("2026-10-02T00:00:00Z") },
  { firstStandardBillingDate: new Date("2026-09-01T00:00:00Z") }, { firstStandardBillingDate: new Date("2026-10-01T05:00:00Z") },
]) test(`partial/inconsistent state fails closed: ${JSON.stringify(overrides)}`, async () => {
  const h = await fixture("ACH", undefined, overrides); assert.equal((await h.create()).status, 409); assert.equal((await h.payments()).length, 0); assert.equal(h.calls.creates.length, 0);
});
test("both NULLs retain legacy UTC calendar, arbitrary due day and grace", async () => {
  const h = await fixture("ACH", "2026-10-16T00:30:00Z", { propertyTimeZone: null, firstStandardBillingDate: null });
  Object.assign(h.business.recurringPlans[0], { dueDay: 15, gracePeriodDays: 1 });
  const checkout = await h.prepare(); assert.equal(checkout.dueDate.toISOString(), "2026-10-15T00:00:00.000Z"); assert.equal(checkout.initialLateFeeCents, 500);
  assert.equal((await h.start(checkout)).status, 200); assert.equal(h.business.propertyTimeZone, null);
});
for (const [iso, expectedDays] of [["2026-03-08T07:59:59.999Z", 4], ["2026-03-08T08:00:00Z", 4], ["2026-03-09T05:00:00Z", 5]]) {
  test(`DST calendar amount at ${iso}`, async () => {
    const h = await fixture("ACH", iso, { createdAt: new Date("2026-02-15T12:00:00Z"), firstStandardBillingDate: new Date("2026-03-01T00:00:00Z") });
    const checkout = await h.prepare(); assert.equal(checkout.dailyLateFeesCents, expectedDays * 100); assert.equal((await h.start(checkout)).status, 200);
  });
}
test("disabled fees and configured daily cap are respected", async () => {
  const h = await fixture("ACH", "2026-10-20T12:00:00Z"); h.business.recurringPlans[0].dailyLateFeeMaxDays = 2;
  assert.equal((await h.prepare()).dailyLateFeesCents, 200);
  Object.assign(h.business.recurringPlans[0], { initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0 });
  const checkout = await h.prepare(); assert.equal(checkout.initialLateFeeCents, 0); assert.equal(checkout.dailyLateFeesCents, 0);
});
for (const change of [{ baseAmountCents: 110000 }, { name: "New tier name" }, { gracePeriodDays: 4 }, { dueDay: 15 }, { gracePeriodDays: 1 }]) {
  test(`unstarted quote rejects changed rules ${JSON.stringify(change)}`, async () => {
    const h = await fixture(); const checkout = await h.prepare(); Object.assign(h.business.recurringPlans[0], change);
    assert.equal((await h.start(checkout)).status, 409); assert.equal((await h.payments()).length, 0); assert.equal(h.calls.creates.length, 0);
  });
}
test("current first-cycle configuration is checked under the Business lock", async () => {
  const h = await fixture(); const checkout = await h.prepare(); h.live.onBeforeReserve = () => { h.business.propertyTimeZone = null; };
  assert.equal((await h.start(checkout)).status, 409); assert.equal((await h.payments()).length, 0); assert.equal(h.calls.creates.length, 0);
});
test("month rollover rejects an old cycle and uses local recurring-charge applicability", async () => {
  const h = await fixture("ACH", "2026-11-01T04:59:59.999Z");
  h.business.recurringPlans[0].charges[0].effectiveBillingCycle = "2026-11";
  const checkout = await h.prepare(); assert.equal(checkout.billingCycle, "2026-10"); assert.equal(checkout.recurringChargesCents, 0);
  h.clock.now = "2026-11-01T05:00:00Z"; assert.equal((await h.start(checkout)).status, 409);
  const fresh = await h.prepare(); assert.equal(fresh.billingCycle, "2026-11"); assert.equal(fresh.recurringChargesCents, 2000); assert.equal(fresh.initialLateFeeCents, 0);
});

for (const [timeZone, midnight] of [["America/New_York", "2026-10-01T04:00:00Z"], ["Pacific/Honolulu", "2026-10-01T10:00:00Z"]]) {
  test(`${timeZone}: first-cycle eligibility uses this property's midnight`, async () => {
    const h = await fixture("ACH", new Date(new Date(midnight).getTime() - 1).toISOString(), { propertyTimeZone: timeZone });
    assert.equal((await h.create()).status, 409);
    h.clock.now = midnight;
    const checkout = await h.prepare(); assert.equal(checkout.billingCycle, "2026-10");
    assert.equal((await h.start(checkout)).status, 200);
  });
}

for (const iso of ["2026-11-01T06:59:59.999Z", "2026-11-01T07:00:00Z", "2026-11-02T06:00:00Z"]) {
  test(`fall DST repeat hour does not advance the billing date or fees at ${iso}`, async () => {
    const h = await fixture("ACH", iso); const checkout = await h.prepare();
    assert.equal(checkout.billingCycle, "2026-11"); assert.equal(checkout.initialLateFeeCents, 0); assert.equal(checkout.dailyLateFeesCents, 0);
    assert.equal((await h.start(checkout)).status, 200);
  });
}

test("daily fees can be enabled independently of the initial fee", async () => {
  const h = await fixture("CARD", "2026-10-05T05:00:00Z"); h.business.recurringPlans[0].initialLateFeeCents = 0;
  const checkout = await h.prepare(); assert.equal(checkout.initialLateFeeCents, 0); assert.equal(checkout.dailyLateFeesCents, 100);
  assert.equal((await h.start(checkout)).status, 200);
});

for (const change of [{ propertyTimeZone: null }, { firstStandardBillingDate: null }, { firstStandardBillingDate: new Date("2026-11-01T00:00:00Z") }]) {
  test(`start fails closed when a reviewed property's configuration becomes inconsistent: ${JSON.stringify(change)}`, async () => {
    const h = await fixture(); const checkout = await h.prepare(); Object.assign(h.business, change);
    const response = await h.start(checkout); assert.equal(response.status, 409); assert.equal((await response.json()).code, "CALENDAR_CONFIGURATION");
    assert.equal((await h.payments()).length, 0); assert.equal(h.calls.creates.length, 0);
  });
}
