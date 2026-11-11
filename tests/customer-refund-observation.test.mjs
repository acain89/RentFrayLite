import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { reconciliationFixture } from "./helpers/reconciliation-harness.mjs";

async function fixture(model = "DIRECT", method = "CARD") {
  const f = await reconciliationFixture("isolated", 20, method, model), refunds = [], calls = [];
  f.stripe.checkout.sessions.create = () => { throw Error("Checkout creation prohibited in refund observation"); };
  f.stripe.refunds = { list: async (params, options) => {
    assert.equal(params.charge, f.charge.id); assert.equal(params.limit, 100);
    assert.equal(options.stripeAccount, model === "DIRECT" ? f.payment.stripeConnectedAccountId : undefined);
    calls.push(params); return { data: structuredClone(refunds), has_more: false };
  }, create: () => { throw Error("Refund creation prohibited"); } };
  const sync = () => { f.charge.amount_refunded = refunds.filter(r => r.status === "succeeded").reduce((n, r) => n + r.amount, 0); f.charge.refunded = f.charge.amount_refunded === f.payment.totalChargedCents; };
  const add = (amount, status = "succeeded") => {
    const row = { id: "re_" + randomUUID().replaceAll("-", ""), object: "refund", charge: f.charge.id, payment_intent: f.intent.id, currency: "usd", amount, status, created: Math.floor(Date.now() / 1000) };
    refunds.push(row); sync(); return row;
  };
  const event = (refund, type = "refund.updated", changes = {}) => f.event(type, { data: { object: structuredClone(refund) }, ...changes });
  const rows = () => f.db.customerRefundObservation.findMany({ where: { paymentId: f.payment.id }, orderBy: { stripeRefundId: "asc" } });
  return { ...f, refunds, refundReads: calls, add, sync, refundEvent: event, rows };
}

for (const model of ["LEGACY_DESTINATION", "DIRECT"]) for (const method of ["CARD", "ACH"]) {
  const label = model + " " + method;
  for (const full of [false, true]) test(`${label}: ${full ? "full" : "partial"} customer refund is observed without changing Payment`, async () => {
    const f = await fixture(model, method), original = await f.current(), r = f.add(full ? original.totalChargedCents : 100);
    assert.equal((await f.send(f.refundEvent(r))).status, 200);
    const [row] = await f.rows(); assert.equal(row.stripeRefundId, r.id); assert.equal(row.amountCents, r.amount); assert.equal(row.status, "succeeded");
    assert.equal(row.stripeAccountId, model === "DIRECT" ? original.stripeConnectedAccountId : "acct_platform");
    assert.deepEqual(await f.current(), original); assert.equal(f.financial.creates.length, 0);
    if (model === "DIRECT") { assert.equal((await f.row()).reasonCode, "CUSTOMER_REFUND_REVIEW"); await f.run(); assert.equal(f.financial.creates.length, 0); }
  });
  test(`${label}: multiple partial refunds and duplicate events count each identity once`, async () => {
    const f = await fixture(model, method), a = f.add(100), e = f.refundEvent(a);
    assert.equal((await f.send(e)).status, 200); assert.equal((await f.send(e)).status, 200);
    const b = f.add(200); assert.equal((await f.send(f.refundEvent(b, "refund.created"))).status, 200);
    const rows = await f.rows(); assert.equal(rows.length, 2); assert.equal(rows.reduce((n, r) => n + r.amountCents, 0), 300);
    assert.equal((await f.audits()).filter(r => r.action === "CUSTOMER_REFUND_OBSERVED").length, 2);
  });
  for (const end of ["succeeded", "failed", "canceled"]) test(`${label}: pending -> ${end} uses current provider state rather than old event payload`, async () => {
    const f = await fixture(model, method), r = f.add(100, "pending"), old = f.refundEvent(r);
    assert.equal((await f.send(old)).status, 200); assert.equal((await f.rows())[0].status, "pending");
    r.status = end; f.sync(); assert.equal((await f.send(f.refundEvent(r, end === "failed" ? "refund.failed" : "refund.updated"))).status, 200);
    old.id = "evt_" + randomUUID().replaceAll("-", ""); assert.equal((await f.send(old)).status, 200);
    assert.equal((await f.rows())[0].status, end); assert.equal((await f.rows()).length, 1);
  });
  test(`${label}: charge.refunded and legacy charge.refund.updated are supported observations`, async () => {
    const f = await fixture(model, method), r = f.add(100);
    assert.equal((await f.send(f.event("charge.refunded"))).status, 200);
    assert.equal((await f.send(f.refundEvent(r, "charge.refund.updated"))).status, 200); assert.equal((await f.rows()).length, 1);
  });
}

for (const attack of ["account", "mode", "charge", "intent", "currency", "amount", "unknownStatus", "missingRefund", "truncated", "aggregate", "reparent"]) test(`rejects ${attack} without refund/Payment changes or money movement`, async () => {
  const f = await fixture(), original = await f.current(), r = f.add(100), e = f.refundEvent(r);
  if (attack === "account") e.account = "acct_other";
  if (attack === "mode") e.livemode = true;
  if (attack === "charge") r.charge = "ch_other";
  if (attack === "intent") r.payment_intent = "pi_other";
  if (attack === "currency") r.currency = "eur";
  if (attack === "amount") r.amount++;
  if (attack === "unknownStatus") r.status = "unknown";
  if (attack === "missingRefund") e.data.object.id = "re_unknown";
  if (attack === "truncated") { const read = f.stripe.refunds.list; f.stripe.refunds.list = async (...args) => ({ ...await read(...args), has_more: true }); }
  if (attack === "aggregate") { f.add(original.totalChargedCents); }
  if (attack === "reparent") await f.db.customerRefundObservation.create({ data: { paymentId: "other", stripePlatformAccountId: "acct_platform", stripeAccountId: original.stripeConnectedAccountId, stripeMode: "test", stripeRefundId: r.id } });
  const before = await f.rows(); assert.equal((await f.send(e)).status, 500); assert.deepEqual(await f.rows(), before); assert.deepEqual(await f.current(), original); assert.equal(f.financial.creates.length, 0);
});

test("a lagging terminal observation cannot regress a succeeded refund", async () => {
  const f = await fixture(), r = f.add(100); assert.equal((await f.send(f.refundEvent(r))).status, 200);
  const before = await f.rows(); r.status = "pending"; f.sync(); assert.equal((await f.send(f.refundEvent(r))).status, 500); assert.deepEqual(await f.rows(), before);
});
test("same-status concurrent observations serialize or retry without duplicate rows", async () => {
  const f = await fixture(), r = f.add(100), responses = await Promise.all(Array.from({ length: 5 }, () => f.send(f.refundEvent(r))));
  assert.ok(responses.some(r => r.status === 200)); assert.ok(responses.every(r => [200, 500].includes(r.status)));
  assert.equal((await f.rows()).length, 1); assert.equal((await f.send(f.refundEvent(r))).status, 200);
});
test("audit failure rolls back observations and journal invalidation", async () => {
  const f = await fixture(), r = f.add(100), before = await f.row(), create = f.db.auditLog.create;
  f.db.auditLog.create = async args => { if (args.data.action === "CUSTOMER_REFUND_OBSERVED") throw Error("Synthetic audit failure"); return create(args); };
  assert.equal((await f.send(f.refundEvent(r))).status, 500); assert.deepEqual(await f.rows(), []); assert.deepEqual(await f.row(), before);
});
test("refund arriving during economics reads prevents a new correction reservation", async () => {
  const f = await fixture(); let once = true;
  f.state.hook = async () => { if (!once) return; once = false; const r = f.add(100, "pending"); assert.equal((await f.send(f.refundEvent(r))).status, 200); };
  await f.run(); assert.equal(f.financial.creates.length, 0); assert.equal((await f.row()).reasonCode, "CUSTOMER_REFUND_REVIEW");
});
test("failed customer refund does not permanently prohibit ordinary correction", async () => {
  const f = await fixture(), r = f.add(100, "failed"); assert.equal((await f.send(f.refundEvent(r))).status, 200);
  await f.run(); assert.equal(f.financial.creates.length, 1); assert.equal((await f.row()).status, "CORRECTED");
});
for (const model of ["LEGACY_DESTINATION", "DIRECT"]) for (const type of ["application_fee.created", "application_fee.refunded", "application_fee.refund.updated"]) test(`${model}: ${type} stays distinct from customer refunds`, async () => {
  const f = await fixture(model), object = type === "application_fee.refund.updated" ? { object: "fee_refund", id: "fr_example", fee: f.financial.fee.id } : f.financial.fee;
  const e = f.event(type, { account: undefined, data: { object: structuredClone(object) } });
  assert.equal((await f.send(e)).status, 200); assert.equal((await f.send(e)).status, 200); assert.deepEqual(await f.rows(), []); assert.equal(f.financial.creates.length, 0);
  if (model === "LEGACY_DESTINATION") { assert.equal(await f.row(), null); assert.equal((await f.audits()).filter(a => a.action === "LEGACY_APPLICATION_FEE_OBSERVED").length, 1); }
  else assert.equal((await f.row()).refreshRequested, true);
});
test("legacy fee can resolve an explicitly verified originating platform charge", async () => {
  const f = await fixture("LEGACY_DESTINATION"); f.financial.fee.originating_transaction = f.charge.id; f.financial.fee.charge = "ch_connected_mirror";
  assert.equal((await f.send(f.event("application_fee.created", { account: undefined, data: { object: f.financial.fee } }))).status, 200); assert.equal(await f.row(), null);
});
test("migration is additive and all execution gates remain off", async () => {
  const sql = readFileSync("prisma/migrations/20261105010000_customer_refund_observation/migration.sql", "utf8");
  assert.doesNotMatch(sql, /^\s*(?:DROP\b|DELETE\b|TRUNCATE\b|UPDATE\b|ALTER TABLE "Payment")/m); assert.match(sql, /ON DELETE RESTRICT/); assert.match(sql, /CREATE UNIQUE INDEX/);
  const f = await fixture(), policy = f.load("lib/paymentArchitecturePolicy.ts");
  for (const k of ["directQuoteIssuanceEnabled", "directReservationEnabled", "directPaymentCreationEnabled", "directFinancialExecutionEnabled"]) assert.equal(policy[k](), false);
});

test("requires_action blocks correction and charge.updated refreshes the same refund identity", async () => {
  const f = await fixture(), r = f.add(100, "requires_action");
  assert.equal((await f.send(f.refundEvent(r))).status, 200); await f.run(); assert.equal(f.financial.creates.length, 0);
  r.status = "succeeded"; f.sync(); assert.equal((await f.send(f.event("charge.updated"))).status, 200);
  assert.equal((await f.rows())[0].status, "succeeded"); assert.equal((await f.rows()).length, 1);
});
test("customer refund invalidation retains an already reserved correction and never replays it", async () => {
  const f = await fixture(); await f.run(); const before = await f.row(), creates = f.financial.creates.length;
  const r = f.add(100); assert.equal((await f.send(f.refundEvent(r))).status, 200); await f.run(); const after = await f.row();
  for (const key of ["id", "reservedAt", "idempotencyKey", "stripeRefundId", "correctionCents", "confirmedCorrectionCents", "initialObservation"]) assert.deepEqual(after[key], before[key]);
  assert.equal(after.reasonCode, "CUSTOMER_REFUND_REVIEW"); assert.equal(f.financial.creates.length, creates);
});
test("unknown legacy architecture facts remain null rather than being backfilled", async () => {
  const f = await fixture("LEGACY_DESTINATION"), unknown = { chargeModel: null, pricingVersion: null, stripeConnectedAccountId: null, stripePlatformAccountId: null, stripeMode: null, rflApplicationFeeCents: null, expectedStripeProcessingFeeCents: null };
  await f.db.payment.update({ where: { id: f.payment.id }, data: unknown }); await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { ...unknown, expectedManagementNetCents: null } });
  const original = await f.current(), r = f.add(100); assert.equal((await f.send(f.refundEvent(r))).status, 200);
  assert.deepEqual(await f.current(), original); const [row] = await f.rows(); assert.equal(row.chargeModel, null); assert.equal(row.pricingVersion, null); assert.equal(row.stripeAccountId, "acct_platform");
});
for (const change of ["account", "amount", "parent"]) test(`legacy fee rejects wrong ${change} without direct journal or money movement`, async () => {
  const f = await fixture("LEGACY_DESTINATION");
  if (change === "account") f.financial.fee.account = "acct_other";
  if (change === "amount") f.financial.fee.amount++;
  if (change === "parent") f.charge.application_fee = "fee_other";
  assert.equal((await f.send(f.event("application_fee.created", { account: undefined, data: { object: f.financial.fee } }))).status, 500);
  assert.equal(await f.row(), null); assert.equal(f.financial.creates.length, 0);
});

for (const change of ["source", "attempt", "items"]) test(`refund rejects corrupted local ${change} ownership`, async () => {
  const f = await fixture("LEGACY_DESTINATION"), r = f.add(100);
  if (change === "source") await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { sourceType: "RECURRING_PLAN", planId: "other" } });
  if (change === "attempt") await f.db.payment.update({ where: { id: f.payment.id }, data: { checkoutAttemptId: "other" } });
  if (change === "items") {
    const items = [{ type: "BASE", label: "Synthetic", amountCents: 1 }];
    await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { lineItems: items } });
    await f.db.payment.update({ where: { id: f.payment.id }, data: { lineItemsSnapshot: items } });
  }
  const original = await f.current(); assert.equal((await f.send(f.refundEvent(r))).status, 500);
  assert.deepEqual(await f.rows(), []); assert.deepEqual(await f.current(), original);
});
test("business deactivation and connection replacement cannot redirect historical refund ownership", async () => {
  const f = await fixture(), original = await f.current(), r = f.add(100);
  await f.db.business.update({ data: { isActive: false, status: "DISABLED" } });
  await f.db.stripeConnection.upsert({ update: { stripeAccountId: "acct_replacement" } });
  assert.equal((await f.send(f.refundEvent(r))).status, 200); assert.deepEqual(await f.current(), original);
  assert.equal((await f.rows())[0].stripeAccountId, original.stripeConnectedAccountId); assert.equal(f.financial.creates.length, 0);
});
