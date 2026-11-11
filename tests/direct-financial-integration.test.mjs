import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { harness } from "./helpers/checkout-harness.mjs";
import { reconciliationFixture } from "./helpers/reconciliation-harness.mjs";
import { reportingFixture } from "./helpers/reporting-harness.mjs";

async function runnable(delta = 20, method = "ACH") {
  const f = await reconciliationFixture("isolated", delta, method);
  // Only this VM fixture substitutes the immutable production-disabled policy.
  f.mocks["@/lib/directFinancialRunnerPolicy"] = { directFinancialExecutionEnabled: () => true };
  f.db.directFinancialReconciliation.findMany = async query => {
    assert.ok(query.take <= 20); assert.deepEqual(query.orderBy, [{ updatedAt: "asc" }, { id: "asc" }]);
    const ownership = query.where.AND[0].payment;
    assert.equal(ownership.chargeModel, "DIRECT"); assert.equal(ownership.status, "PAID");
    assert.equal(ownership.stripePlatformAccountId, f.identity.platformAccountId); assert.equal(ownership.stripeMode, f.identity.mode);
    const p = await f.current(), row = await f.row();
    if (!row || p.status !== "PAID" || p.chargeModel !== ownership.chargeModel || p.pricingVersion !== ownership.pricingVersion || p.stripePlatformAccountId !== ownership.stripePlatformAccountId || p.stripeMode !== ownership.stripeMode || (row.leaseUntil && row.leaseUntil > new Date())) return [];
    return ["WAITING_DATA", "REQUIRED"].includes(row.status) || row.refreshRequested || (row.status === "EXCEPTION" && ["PROVIDER_OR_PERSISTENCE_UNCONFIRMED", "CORRECTION_UNCONFIRMED", "CORRECTION_DATA_PENDING", "FINANCIAL_DATA_PENDING", "FINANCIAL_DATA_MISSING"].includes(row.reasonCode)) ? [{ paymentId: p.id }] : [];
  };
  const runner = f.load("lib/directFinancialRunner.ts");
  return { ...f, batch: (limit = 20) => runner.processDirectFinancialQueue(f.db, f.stripe, f.identity, limit) };
}

test("production runner policy is disabled before touching database, provider, identity or runtime flags", async () => {
  const h = await harness("ACH", "isolated"), service = h.load("lib/directFinancialRunner.ts");
  const forbidden = new Proxy({}, { get() { throw Error("Unexpected dependency access"); } });
  assert.deepEqual(await service.processDirectFinancialQueue(forbidden, forbidden, forbidden), { status: "DISABLED", attempted: 0, busy: 0, failed: 0 });
  assert.equal(h.load("lib/directFinancialRunnerPolicy.ts").directFinancialExecutionEnabled(), false);
  assert.equal(h.load("lib/paymentArchitecturePolicy.ts").directPaymentCreationEnabled(), false);
  assert.doesNotMatch(readFileSync(new URL("../lib/directFinancialRunnerPolicy.ts", import.meta.url), "utf8"), /process.env/);
});

for (const limit of [0, -1, 21, 1.5, NaN, Infinity]) test(`runner rejects invalid enabled-fixture batch limit ${limit}`, async () => {
  const f = await runnable(); await assert.rejects(() => f.batch(limit), /batch limit/); assert.equal(f.financial.creates.length, 0);
});

test("bounded batch de-duplicates IDs and reports busy/failure without stopping independent jobs", async () => {
  const h = await harness("ACH", "isolated"), calls = [];
  h.mocks["@/lib/directFinancialRunnerPolicy"] = { directFinancialExecutionEnabled: () => true };
  h.mocks["@/lib/directFinancialReconciliation"] = { reconcileDirectPayment: async (_db, _stripe, id) => { calls.push(id); if (id === "b") throw Error("Synthetic worker failure"); return { kind: id === "a" ? "BUSY" : "DONE" }; } };
  const db = { directFinancialReconciliation: { findMany: async q => { assert.equal(q.take, 3); return ["a", "a", "b", "c", "d"].map(paymentId => ({ paymentId })); } } };
  const result = await h.load("lib/directFinancialRunner.ts").processDirectFinancialQueue(db, {}, { platformAccountId: "acct_platform", mode: "test" }, 3);
  assert.deepEqual(calls, ["a", "b", "c"]); assert.deepEqual(result, { status: "PROCESSED", attempted: 3, busy: 1, failed: 1 });
});

test("duplicate real-worker fixture batches retain one durable correction and immutable Payment", async () => {
  const f = await runnable(), before = await f.current();
  await Promise.all([f.batch(1), f.batch(1)]); assert.equal(f.financial.creates.length, 1);
  assert.equal((await f.row()).status, "CORRECTED"); assert.deepEqual(await f.current(), before);
  assert.equal((await f.batch()).attempted, 0);
});

test("ambiguous correction is observed after interruption, never blindly POSTed twice", async () => {
  const f = await runnable(); f.financial.timeout = true; await f.batch();
  const reserved = await f.row(); assert.equal(reserved.status, "EXCEPTION"); assert.ok(reserved.idempotencyKey); assert.equal(f.financial.creates.length, 1);
  f.financial.timeout = false; await f.batch(); const recovered = await f.row();
  assert.equal(recovered.status, "CORRECTED"); assert.equal(recovered.idempotencyKey, reserved.idempotencyKey); assert.equal(f.financial.creates.length, 1);
});

test("inconsistent account ownership creates no correction", async () => {
  const f = await runnable(); f.financial.fee.account = "acct_other"; await f.batch();
  assert.equal((await f.row()).status, "EXCEPTION"); assert.equal(f.financial.creates.length, 0);
});

test("existing worker lease excludes an active job", async () => {
  const f = await runnable(); await f.db.directFinancialReconciliation.update({ where: { paymentId: f.payment.id }, data: { leaseToken: "active", leaseUntil: new Date(Date.now() + 60000) } });
  assert.equal((await f.batch()).attempted, 0); assert.equal(f.financial.creates.length, 0);
});

for (const method of ["ACH", "CARD"]) for (const delta of [0, 20, -20]) test(`${method}: as-of economics use actual processor delta ${delta}, not modeled revenue`, async () => {
  const f = await reconciliationFixture("isolated", delta, method), before = await f.current(); await f.run();
  const row = await f.row(), observed = f.load("lib/directFinancialReporting.ts").projectDirectFinancialReport(await f.current(), row);
  assert.equal(observed.financialEvidence, "OBSERVED_AS_OF"); assert.ok(observed.financialObservationAt);
  assert.equal(observed.observedProcessorFeeCents, f.financial.processor); assert.equal(observed.observedApplicationFeeCents, before.rflApplicationFeeCents);
  assert.equal(observed.observedApplicationFeeRefundCents, Math.max(0, delta)); assert.equal(observed.confirmedManagementCorrectionCents, Math.max(0, delta));
  assert.equal(observed.observedManagementNetCents, before.subtotalCents + Math.max(0, -delta));
  assert.equal(observed.observedPlatformRevenueCents, before.rflApplicationFeeCents - Math.max(0, delta));
  assert.equal(observed.observedManagementShortfallCents, 0); assert.equal(observed.customerPrincipalRefundCents, null);
  assert.notEqual(observed.observedPlatformRevenueCents, before.platformFeeCents); assert.deepEqual(await f.current(), before);
});

test("exhausted application fee exposes residual management shortfall without principal reimbursement", async () => {
  const f = await reconciliationFixture("isolated", 500); await f.run(); const row = await f.row();
  assert.equal(row.reasonCode, "INSUFFICIENT_RFL_FEE");
  const observed = f.load("lib/directFinancialReporting.ts").projectDirectFinancialReport(await f.current(), row);
  assert.equal(observed.financialEvidence, "OBSERVED_AS_OF"); assert.ok(observed.observedManagementShortfallCents > 0);
  assert.equal(observed.observedPlatformRevenueCents, 0); assert.equal(f.financial.creates.length, 1);
});

test("negative observed management balance is preserved as a shortfall, never clamped into profit", async () => {
  const f = await reconciliationFixture("isolated", 20000); await f.run();
  const observed = f.load("lib/directFinancialReporting.ts").projectDirectFinancialReport(await f.current(), await f.row());
  assert.equal(observed.financialEvidence, "OBSERVED_AS_OF"); assert.ok(observed.observedManagementNetCents < 0); assert.ok(observed.observedManagementShortfallCents > 0);
});

for (const mutation of ["pending", "returned", "disputed", "refresh", "activeLease", "ambiguous", "wrongSnapshot", "wrongCharge", "wrongFee", "wrongRefund", "malformed"]) test(`${mutation} facts cannot become verified earnings`, async () => {
  const f = await reconciliationFixture("isolated", 20); await f.run(); const p = await f.current(), row = await f.row();
  if (["pending", "returned", "disputed"].includes(mutation)) p.status = mutation.toUpperCase();
  if (mutation === "refresh") row.refreshRequested = true;
  if (mutation === "activeLease") row.leaseToken = "working";
  if (mutation === "ambiguous") { row.status = "EXCEPTION"; row.reasonCode = "CORRECTION_UNCONFIRMED"; }
  if (mutation === "wrongSnapshot") row.expectedSnapshot.connectedAccountId = "acct_other";
  if (mutation === "wrongCharge") row.latestObservation.base.chargeId = "ch_other";
  if (mutation === "wrongFee") row.actualProcessorFeeCents++;
  if (mutation === "wrongRefund") row.latestObservation.refunds[0].connectedId = "acct_other";
  if (mutation === "malformed") row.latestObservation = null;
  const result = f.load("lib/directFinancialReporting.ts").projectDirectFinancialReport(p, row);
  assert.equal(result.financialEvidence, "UNVERIFIED"); assert.equal(result.observedPlatformRevenueCents, null); assert.equal(result.observedManagementNetCents, null);
});

test("known customer principal refund makes previous observation unavailable, not earned or reimbursed", async () => {
  const f = await reconciliationFixture(); await f.run(); f.charge.refunded = true; f.charge.amount_refunded = f.payment.subtotalCents;
  await f.run(); const row = await f.row(); assert.equal(row.status, "EXCEPTION");
  const observed = f.load("lib/directFinancialReporting.ts").projectDirectFinancialReport(await f.current(), row);
  assert.equal(observed.observedPlatformRevenueCents, null); assert.equal(observed.customerPrincipalRefundCents, null); assert.equal(f.financial.creates.length, 0);
});

test("legacy and missing historical actual costs remain separate from estimates", async () => {
  const f = await reportingFixture(); await f.seed(); let payment = (await f.list()).payments[0];
  assert.equal(payment.expectedProcessorFeeCents, 119); assert.equal(payment.verifiedProcessorFeeCents, null); assert.equal(payment.observedPlatformRevenueCents, null);
  const recorded = await f.seed({ stripeBalanceTransactionId: "txn_observed", processorFeeCents: 130, actualManagementNetCents: 10001 });
  payment = (await f.list()).payments.find(p => p.id === recorded.id); assert.equal(payment.verifiedProcessorFeeCents, 130); assert.equal(payment.verifiedManagementProceedsCents, 10001);
});

test("journal relation reaches authorized report/CSV/print without leaking private journal/provider identities", async () => {
  const f = await reconciliationFixture("isolated", 20); await f.run(); const fixture = await reportingFixture();
  const p = { ...await f.current(), businessId: fixture.business.id }, row = await f.row();
  row.expectedSnapshot = f.load("lib/directFinancialObservation.ts").directFinancialSnapshot(p);
  await fixture.seed({ ...p, financialReconciliation: row });
  const record = (await fixture.list()).payments[0]; assert.equal(record.financialEvidence, "OBSERVED_AS_OF");
  assert.equal(record.verifiedProcessorFeeCents, f.financial.processor); assert.equal(record.observedPlatformRevenueCents, p.rflApplicationFeeCents - 20);
  const csv = fixture.report.transactionReportCsv([record], "UTC"), printed = fixture.report.transactionReportPrint([record], "UTC", "Synthetic", fixture.filters(""));
  assert.match(csv, /Observed application-fee refunds/); assert.match(printed, /not current net profit/); assert.equal(record.customerPrincipalRefundCents, null);
  for (const value of [p.stripeConnectedAccountId, p.stripeChargeId, p.stripePaymentIntentId, row.idempotencyKey, "expectedSnapshot", "latestObservation", p.payerPhone]) assert.ok(!JSON.stringify(record).includes(value));
});

test("admin labels are gross original fees, never net earnings or proven return losses", () => {
  const source = readFileSync(new URL("../app/admin/AdminDashboardClient.tsx", import.meta.url), "utf8");
  assert.match(source, /Gross Tenant Fees/); assert.match(source, /Original Tenant Fees/); assert.doesNotMatch(source, /Platform Revenue|Revenue Loss/);
  assert.match(readFileSync(new URL("../lib/adminDashboard.ts", import.meta.url), "utf8"), /gross original tenant fees/);
});

for (const change of ["platform", "mode", "legacy", "pending"]) test(`runner excludes ${change} records before provider work`, async () => {
  const f = await runnable(), patch = change === "platform" ? { stripePlatformAccountId: "acct_other" } : change === "mode" ? { stripeMode: "live" } : change === "legacy" ? { chargeModel: "LEGACY_DESTINATION" } : { status: "PENDING" };
  await f.db.payment.update({ where: { id: f.payment.id }, data: patch }); const reads = f.financial.reads.length;
  assert.equal((await f.batch()).attempted, 0); assert.equal(f.financial.reads.length, reads); assert.equal(f.financial.creates.length, 0);
});

test("exhausted fee is a terminal exception until explicitly refreshed, not a polling loop", async () => {
  const f = await runnable(500); await f.batch(); assert.equal((await f.row()).reasonCode, "INSUFFICIENT_RFL_FEE");
  assert.equal((await f.batch()).attempted, 0); assert.equal(f.financial.creates.length, 1);
});

test("transient read failure before any correction reservation can retry safely", async () => {
  const f = await runnable(); f.state.fault = "balance"; await f.batch();
  const first = await f.row(); assert.equal(first.reasonCode, "PROVIDER_OR_PERSISTENCE_UNCONFIRMED"); assert.equal(first.reservedAt, null); assert.equal(f.financial.creates.length, 0);
  f.state.fault = null; await f.batch(); assert.equal((await f.row()).status, "CORRECTED"); assert.equal(f.financial.creates.length, 1);
});

test("application-fee refunds are distinct from RFL management corrections", async () => {
  const f = await reconciliationFixture("isolated", 0); f.createRefund(5); await f.run();
  const observed = f.load("lib/directFinancialReporting.ts").projectDirectFinancialReport(await f.current(), await f.row());
  assert.equal(observed.financialEvidence, "OBSERVED_AS_OF"); assert.equal(observed.observedApplicationFeeRefundCents, 5);
  assert.equal(observed.confirmedManagementCorrectionCents, 0); assert.equal(observed.observedPlatformRevenueCents, f.payment.rflApplicationFeeCents - 5);
  assert.equal(observed.observedManagementNetCents, f.payment.subtotalCents + 5); assert.equal(f.financial.creates.length, 0);
});
