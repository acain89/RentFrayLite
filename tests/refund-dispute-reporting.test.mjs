import test from "node:test";
import assert from "node:assert/strict";
import { reportingFixture } from "./helpers/reporting-harness.mjs";
import { reconciliationFixture } from "./helpers/reconciliation-harness.mjs";

const f = await reportingFixture();
const { projectPaymentOutcome, loadReportingDisputeOutcome } = f.load("lib/paymentReportingOutcome.ts");
const refund = (amountCents, status = "succeeded", stripeRefundId = "re_one") => ({ amountCents, status, stripeRefundId, currency: "usd" });
test("historical dispute timestamp does not invent a won outcome", () => {
  const p = projectPaymentOutcome({ status: "PAID", totalChargedCents: 10200, disputedAt: new Date() });
  assert.equal(p.disputeOutcome, "UNKNOWN"); assert.ok(p.statusLabel.includes("Dispute outcome unknown"));
});
for (const [label, rows, state, amount] of [
  ["successful without observations", [], "UNKNOWN", null],
  ["full", [refund(10200)], "FULL", 10200],
  ["partial", [refund(100)], "PARTIAL", 100],
  ["multiple partials", [refund(100), refund(200, "succeeded", "re_two")], "PARTIAL", 300],
  ["pending", [refund(100, "pending")], "PENDING", 0],
  ["requires action", [refund(100, "requires_action")], "PENDING", 0],
  ["failed", [refund(100, "failed")], "FAILED", 0],
  ["canceled", [refund(100, "canceled")], "FAILED", 0],
  ["duplicate identity fails closed", [refund(100), refund(100)], "UNKNOWN", null],
  ["over-refund fails closed", [refund(10201)], "UNKNOWN", null],
]) test("projection: " + label, () => {
  const input = { status: "PAID", totalChargedCents: 10200, customerRefunds: rows }, before = structuredClone(input);
  const p = projectPaymentOutcome(input);
  assert.equal(p.refundState, state); assert.equal(p.customerRefundCents, amount);
  assert.equal(p.customerPrincipalRefundCents, null); assert.equal(p.customerTenantFeeRefundCents, null);
  assert.deepEqual(input, before);
  if (["FULL", "PARTIAL"].includes(state)) assert.notEqual(p.statusLabel, "Successful");
});

for (const [outcome, status, text] of [["ACTIVE", "DISPUTED", "Dispute active"], ["LOST", "DISPUTED", "Dispute closed lost"], ["WON", "PAID", "Dispute closed won"]]) {
  test("dispute projection " + outcome, () => assert.ok(projectPaymentOutcome({ status, totalChargedCents: 10200, disputeOutcome: outcome }).statusLabel.includes(text)));
}
for (const terminal of ["lost", "won"]) test("durable dispute " + terminal + " survives duplicate/out-of-order active observations, scoped and sanitized", async () => {
  let query;
  const db = { auditLog: { findMany: async q => { query = q; return ["under_review", terminal, "needs_response", terminal].map(status => ({ metadata: { reportingDisputes: [{ id: "dp_private", status }], secret: "private-marker" } })); } } };
  assert.equal(await loadReportingDisputeOutcome(db, { id: "payment", businessId: "owner", disputedAt: new Date() }), terminal.toUpperCase());
  assert.equal(query.where.businessId, "owner"); assert.equal(query.where.targetId, "payment"); assert.equal(query.where.actorType, "STRIPE_WEBHOOK");
});

for (const chargeModel of ["LEGACY_DESTINATION", "DIRECT"]) test(chargeModel + ": dashboard/history/export/print preserve original facts and refunded labels", async () => {
  const h = await reportingFixture();
  const original = await h.seed({ chargeModel, customerRefunds: [refund(10200)], stripeBalanceTransactionId: "txn_private", actualManagementNetCents: 10000, processorFeeCents: 100 });
  const history = await h.history(""), dashboard = await h.dashboardPage("");
  const p = history.props.payments[0];
  assert.equal(p.status, "PAID"); assert.equal(p.refundState, "FULL");
  assert.equal(dashboard.props.payments[0].statusDetail, p.statusLabel);
  assert.equal(p.totalChargedCents, original.totalChargedCents); assert.deepEqual(p.lineItemsSnapshot, original.lineItemsSnapshot);
  assert.equal(p.verifiedManagementProceedsCents, null);
  const csv = await (await h.endpoint("format=csv")).text();
  const print = await (await h.endpoint("format=print")).text();
  for (const value of [csv, print]) { assert.ok(value.includes("Fully refunded")); assert.ok(value.includes("102.00")); assert.ok(!value.includes("txn_private")); }
  await h.seed({ businessId: h.businesses[1].id, customerRefunds: [refund(100)], payerFirstName: "other-business-private" });
  assert.equal((await h.list()).total, 1);
  assert.ok(!JSON.stringify(p).includes("stripeRefundId"));
});

test("administrator observed subtotals retain unknowns and original gross, without money operations", async () => {
  const h = await reportingFixture();
  await h.seed({ customerRefunds: [refund(100)] }); await h.seed({ customerRefunds: [], stripeBalanceTransactionId: "txn_legacy", processorFeeCents: 100, actualManagementNetCents: 10000 });
  const data = await h.load("lib/adminDashboard.ts").getAdminDashboardData();
  assert.equal(data.payments.allTime.revenueCents, 400);
  assert.equal(data.payments.allTime.customerRefundCents, 100);
  assert.equal(data.payments.allTime.refundUnknownCount, 1);
  assert.equal(data.payments.allTime.observedPlatformRevenueCents, null);
  assert.equal(data.payments.allTime.observedApplicationFeeRefundCents, null);
  assert.equal(data.payments.allTime.observedProcessorFeeCents, 100);
});

for (const [state, status, outcome] of [["under_review", "DISPUTED", "ACTIVE"], ["won", "PAID", "WON"], ["lost", "DISPUTED", "LOST"]]) test("all existing reports and admin preserve dispute " + outcome, async () => {
  const h = await reportingFixture(), original = await h.seed({ status, disputedAt: new Date() });
  h.db.auditLog.findMany = async ({ where }) => {
    assert.deepEqual(where.AND[0].OR, [{businessId:original.businessId,targetId:{in:[original.id]}}]);
    return [{ businessId:original.businessId,targetId:original.id,metadata: { reportingDisputes: [{ id: "dp_private_marker", status: state }] } }];
  };
  const history = await h.history(""), dashboard = await h.dashboardPage("");
  const p = history.props.payments[0]; assert.equal(p.disputeOutcome, outcome);
  assert.equal(p.status, status); assert.equal(p.statusLabel, dashboard.props.payments[0].statusDetail);
  const { headers, rows } = h.report.transactionReportCells([p], "UTC");
  assert.equal(rows[0][headers.indexOf("Dispute outcome")], outcome);
  for (const format of ["csv", "print"]) {
    const response = await h.endpoint("format=" + format), text = await response.text();
    assert.ok(text.includes(outcome)); assert.ok(!text.includes("dp_private_marker"));
    assert.ok(response.headers.get("Cache-Control").includes("no-store"));
  }
  const admin = await h.load("lib/adminDashboard.ts").getAdminDashboardData();
  const metric = status === "PAID" ? admin.payments.allTime : admin.issues.chargebacks.allTime;
  assert.equal(metric.disputes[outcome.toLowerCase()], 1);
  assert.equal(metric.revenueCents, original.platformFeeCents);
});

test("partial refund observations are order-independent and pending/failed amounts stay separate", () => {
  const rows = [refund(100), refund(200, "succeeded", "re_two"), refund(400, "pending", "re_pending"), refund(500, "failed", "re_failed")];
  const p = projectPaymentOutcome({ status: "PAID", totalChargedCents: 10200, customerRefunds: rows });
  assert.deepEqual(p, projectPaymentOutcome({ status: "PAID", totalChargedCents: 10200, customerRefunds: [...rows].reverse() }));
  assert.equal(p.customerRefundCents, 300); assert.equal(p.pendingCustomerRefundCents, 400); assert.equal(p.failedCustomerRefundCents, 500);
});

test("administrator direct financial observations match the transaction projection, including correction and retained fee", async () => {
  const financial = await reconciliationFixture("isolated", 20, "CARD"); await financial.run();
  const h = await reportingFixture();
  const p = await h.seed({ ...await financial.current(), financialReconciliation: await financial.row() });
  const expected = h.report.serializeReportPayment(p), metric = (await h.load("lib/adminDashboard.ts").getAdminDashboardData()).payments.allTime;
  assert.equal(expected.financialEvidence, "OBSERVED_AS_OF");
  for (const key of ["observedProcessorFeeCents", "observedApplicationFeeCents", "observedApplicationFeeRefundCents", "confirmedManagementCorrectionCents", "observedPlatformRevenueCents"]) assert.equal(metric[key], expected[key], key);
  assert.equal(metric.revenueCents, p.platformFeeCents);
  assert.notEqual(metric.revenueCents, metric.observedPlatformRevenueCents);
});
