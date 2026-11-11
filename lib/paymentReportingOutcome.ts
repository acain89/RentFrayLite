import type { PaymentStatus, Prisma } from "@prisma/client";

export type RefundFact = { amountCents: number; status: string; currency: string; stripeRefundId: string };
export type ReportingOutcomeInput = { status: PaymentStatus; totalChargedCents: number; customerRefunds?: RefundFact[]; disputeOutcome?: unknown; disputedAt?: Date | null };
/** Read-only facts. Absence of observations is not proof of zero historical refunds.
 * Customer refund totals do not establish a principal/tenant-fee allocation. */
export function projectPaymentOutcome(p: ReportingOutcomeInput) {
  const rows = p.customerRefunds ?? [];
  const seen = new Set<string>();
  let succeeded = 0, pending = 0, failed = 0;
  const valid = rows.every(r => {
    if (!r.stripeRefundId || seen.has(r.stripeRefundId) || r.currency !== "usd" || !Number.isSafeInteger(r.amountCents) || r.amountCents <= 0 ||
        !["succeeded", "pending", "requires_action", "failed", "canceled"].includes(r.status)) return false;
    seen.add(r.stripeRefundId);
    if (r.status === "succeeded") succeeded += r.amountCents;
    else if (["pending", "requires_action"].includes(r.status)) pending += r.amountCents;
    else failed += r.amountCents;
    return true;
  }) && Number.isSafeInteger(succeeded + pending) && succeeded + pending <= p.totalChargedCents;
  const known = valid && rows.length > 0;
  const refundState = !known ? "UNKNOWN" : succeeded === p.totalChargedCents ? "FULL" : succeeded > 0 ? "PARTIAL" : pending > 0 ? "PENDING" : "FAILED";
  const disputeOutcome = ["ACTIVE", "WON", "LOST", "CLOSED"].includes(String(p.disputeOutcome)) ? p.disputeOutcome as "ACTIVE" | "WON" | "LOST" | "CLOSED" : p.status === "DISPUTED" || p.disputedAt ? "UNKNOWN" : null;
  const lifecycleLabel = p.status === "PAID" ? "Successful" : p.status === "RETURNED" ? "Failed (Returned)" : p.status === "DISPUTED" ? "Disputed" : p.status === "PENDING" ? "Pending" : p.status === "FAILED" ? "Failed" : "Not yet confirmed";
  const labels = [lifecycleLabel];
  if (disputeOutcome) labels.push(disputeOutcome === "ACTIVE" ? "Dispute active" : disputeOutcome === "WON" ? "Dispute closed won" : disputeOutcome === "LOST" ? "Dispute closed lost" : disputeOutcome === "CLOSED" ? "Dispute closed" : "Dispute outcome unknown");
  if (refundState !== "UNKNOWN") labels.push(refundState === "FULL" ? "Fully refunded" : refundState === "PARTIAL" ? "Partially refunded" : refundState === "PENDING" ? "Refund pending" : "Refund failed / canceled");
  return { statusLabel: labels.join(" · "), refundState, disputeOutcome,
    customerRefundCents: known ? succeeded : null, pendingCustomerRefundCents: known ? pending : null,
    failedCustomerRefundCents: known ? failed : null, customerPrincipalRefundCents: null as number | null,
    customerTenantFeeRefundCents: null as number | null };
}

export const CUSTOMER_REFUND_REPORT_SELECT = { stripeRefundId: true, amountCents: true, currency: true, status: true } as const;

export async function loadReportingDisputeOutcome(db: Pick<Prisma.TransactionClient, "auditLog">, p: { id: string; businessId: string; disputedAt: Date | null }) {
  if (!p.disputedAt) return null;
  const rows = await db.auditLog.findMany({ where: { businessId: p.businessId, actorType: "STRIPE_WEBHOOK", targetType: "PAYMENT", targetId: p.id,
    OR: ["ACTIVE", "WON", "LOST", "CLOSED"].map(value => ({ metadata: { path: ["reportingDisputeOutcome"], equals: value } })) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true } });
  return foldReportingDisputeOutcome(rows);
}

function foldReportingDisputeOutcome(rows: { metadata: unknown }[]) {
  // Terminal provider outcomes cannot be undone by duplicate or stale active
  // observations. Keep only allowlisted outcomes, never expose ledger metadata.
  const states = new Map<string, string>();
  for (const row of rows) {
    const metadata = row.metadata as { reportingDisputes?: { id?: unknown; status?: unknown }[] } | null;
    if (!Array.isArray(metadata?.reportingDisputes)) continue;
    for (const d of metadata.reportingDisputes) {
      if (typeof d.id !== "string" || typeof d.status !== "string") continue;
      const outcome = d.status === "lost" ? "LOST" : d.status === "won" ? "WON" : ["warning_closed", "prevented"].includes(d.status) ? "CLOSED" : ["needs_response", "under_review", "warning_needs_response", "warning_under_review"].includes(d.status) ? "ACTIVE" : null;
      if (outcome && (!states.has(d.id) || states.get(d.id) === "ACTIVE" || outcome === "LOST")) states.set(d.id, outcome);
    }
  }
  const outcomes = [...states.values()];
  return outcomes.includes("LOST") ? "LOST" : outcomes.includes("ACTIVE") ? "ACTIVE" : outcomes.includes("WON") ? "WON" : outcomes.includes("CLOSED") ? "CLOSED" : null;
}

/** Bounded input batches, exact ownership pairs, complete journal history. Keep
 * per-payment ordering and the same terminal fold used by results and SMS. */
export async function loadReportingDisputeOutcomes(db: Pick<Prisma.TransactionClient, "auditLog">,
  payments: { id: string; businessId: string; disputedAt: Date | null }[]) {
  const outcomes = new Map<string, ReturnType<typeof foldReportingDisputeOutcome>>();
  const owners = new Map<string, string>();
  for (const p of payments) {
    if (owners.has(p.id) && owners.get(p.id) !== p.businessId) throw Error("Reporting ownership conflict");
    owners.set(p.id, p.businessId);
    outcomes.set(p.id, null);
  }
  const seen = new Set<string>();
  const eligible = payments.filter(p => {
    if (!p.disputedAt || seen.has(p.id)) return false;
    seen.add(p.id); return true;
  });
  for (let start = 0; start < eligible.length; start += 500) {
    const batch = eligible.slice(start, start + 500);
    const batchOwners = new Map(batch.map(p => [p.id, p.businessId]));
    const scope = new Map<string, string[]>();
    for (const p of batch) {
      const ids = scope.get(p.businessId) ?? [];
      ids.push(p.id); scope.set(p.businessId, ids);
    }
    const rows = await db.auditLog.findMany({ where: { actorType: "STRIPE_WEBHOOK", targetType: "PAYMENT", AND: [
      { OR: [...scope].map(([businessId, ids]) => ({ businessId, targetId: { in: ids } })) },
      { OR: ["ACTIVE", "WON", "LOST", "CLOSED"].map(value => ({ metadata: { path: ["reportingDisputeOutcome"], equals: value } })) },
    ] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { businessId: true, targetId: true, metadata: true } });
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.businessId || !row.targetId || batchOwners.get(row.targetId) !== row.businessId) throw Error("Reporting observation ownership mismatch");
      const group = grouped.get(row.targetId) ?? [];
      group.push(row); grouped.set(row.targetId, group);
    }
    for (const p of batch) outcomes.set(p.id, foldReportingDisputeOutcome(grouped.get(p.id) ?? []));
  }
  return outcomes;
}
