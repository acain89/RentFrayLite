import type { PrismaClient } from "@prisma/client";

export const SMS_DELIVERY_STATES = ["QUEUED", "SENDING", "SENT", "DELIVERED", "FAILED", "SUPPRESSED", "AMBIGUOUS", "UNKNOWN"] as const;
export type SmsDeliveryState = typeof SMS_DELIVERY_STATES[number];
export type SmsDeliveryReport = {
  status: SmsDeliveryState;
  recipientType: "TENANT" | "MANAGEMENT" | "UNKNOWN";
  source: "OUTBOX" | "LEGACY" | "UNKNOWN";
};
export const SMS_REPORT_SELECT = { status: true, reasonCode: true, recipientType: true } as const;
export const TENANT_RECEIPT_NOTIFICATION = { recipientType: "TENANT", eventType: "SUCCESSFUL" } as const;
type Notification = { status: string; reasonCode?: string | null; recipientType: string };
type LegacyReceipt = { status: string };

/** Read-only and allowlisted. Provider acceptance is not delivery. A legacy
 * FAILED row cannot distinguish rejection from uncertain acceptance or a bridge
 * without consent, so it is not evidence of a definite delivery failure. */
export function projectSmsDelivery(notification?: Notification | null, legacy?: LegacyReceipt | null): SmsDeliveryReport {
  if (notification) return {
    source: "OUTBOX",
    recipientType: notification.recipientType === "TENANT" || notification.recipientType === "MANAGEMENT" ? notification.recipientType : "UNKNOWN",
    status: notification.reasonCode === "OPTED_OUT" ? "SUPPRESSED"
      : SMS_DELIVERY_STATES.includes(notification.status as SmsDeliveryState) ? notification.status as SmsDeliveryState : "UNKNOWN",
  };
  return { source: legacy ? "LEGACY" : "UNKNOWN", recipientType: legacy ? "TENANT" : "UNKNOWN",
    status: legacy && ["QUEUED", "SENDING", "SENT"].includes(legacy.status) ? legacy.status as SmsDeliveryState : "UNKNOWN" };
}

export function smsReceiptMessage(report: SmsDeliveryReport): string {
  switch (report.status) {
    case "QUEUED": return "If you opted in, your SMS receipt is queued. Keep this page as your confirmation.";
    case "SENDING": return "Your SMS receipt is being submitted. Delivery is not yet confirmed. Keep this page as your confirmation.";
    case "SENT": return "Your SMS receipt was submitted to the provider. Delivery is not yet confirmed. Keep this page as your confirmation.";
    case "DELIVERED": return "The SMS provider confirmed delivery of your receipt. Keep this page as your confirmation.";
    case "FAILED": return "Your payment is confirmed, but the SMS receipt failed. Keep this page as your confirmation.";
    case "SUPPRESSED": return "Your SMS receipt is suppressed by notification preferences or consent requirements. Keep this page as your confirmation.";
    case "AMBIGUOUS": return "The SMS receipt outcome is uncertain. It will not be automatically resent. Keep this page as your confirmation.";
    default: return "SMS receipt delivery information is unavailable. Keep this page as your payment confirmation.";
  }
}

type Counts = Record<SmsDeliveryState, number>;
export type SmsDeliveryMetric = { total: Counts; tenant: Counts; management: Counts; legacy: Counts; unknownRecipient: Counts };
const counts = (): Counts => Object.fromEntries(SMS_DELIVERY_STATES.map(s => [s, 0])) as Counts;
function metric(): SmsDeliveryMetric { return { total: counts(), tenant: counts(), management: counts(), legacy: counts(), unknownRecipient: counts() }; }
function add(target: SmsDeliveryMetric, report: SmsDeliveryReport, count: number) {
  target.total[report.status] += count;
  target[report.source === "LEGACY" ? "legacy" : report.recipientType === "TENANT" ? "tenant" : report.recipientType === "MANAGEMENT" ? "management" : "unknownRecipient"][report.status] += count;
}

/** Current durable outcomes, grouped by last update period, not send attempts.
 * Unkeyed legacy receipts defer to the tenant-success outbox for their payment.
 * A known different message ID remains a distinct historical notification. */
export async function loadSmsDeliveryMetrics(db: Pick<PrismaClient, "smsNotification" | "smsReceipt">, today: Date, month: Date) {
  async function period(since?: Date) {
    const updatedAt = since ? { updatedAt: { gte: since } } : {};
    const notifications = await db.smsNotification.groupBy({ by: ["status", "recipientType", "reasonCode"], where: updatedAt, _count: { _all: true } });
    const result = metric();
    for (const n of notifications) add(result, projectSmsDelivery(n), n._count._all);
    return result;
  }
  const [day, monthly, allTime] = await Promise.all([period(today), period(month), period()]);
  // Bound receipt memory and alias lookups. Message IDs are used only internally
  // for identity matching; they never enter the public projection or metrics.
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.smsReceipt.findMany({ orderBy: { id: "asc" }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, paymentId: true, status: true, providerMessageId: true, updatedAt: true } });
    const unkeyed = rows.filter(r => !r.providerMessageId).map(r => r.paymentId);
    const keyed = rows.flatMap(r => r.providerMessageId ? [r.providerMessageId] : []);
    const [payments, messages] = await Promise.all([
      unkeyed.length ? db.smsNotification.groupBy({ by: ["paymentId"], where: { paymentId: { in: unkeyed }, ...TENANT_RECEIPT_NOTIFICATION }, _count: { _all: true } }) : [],
      keyed.length ? db.smsNotification.findMany({ where: { providerMessageId: { in: keyed }, ...TENANT_RECEIPT_NOTIFICATION }, select: { paymentId: true, providerMessageId: true } }) : [],
    ]);
    const aliases = new Set(payments.map(p => p.paymentId));
    for (const r of rows) {
      if (r.providerMessageId ? messages.some(n => n.paymentId === r.paymentId && n.providerMessageId === r.providerMessageId) : aliases.has(r.paymentId)) continue;
      const report = projectSmsDelivery(null, r);
      add(allTime, report, 1);
      if (r.updatedAt >= month) add(monthly, report, 1);
      if (r.updatedAt >= today) add(day, report, 1);
    }
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }
  return { today: day, month: monthly, allTime };
}

type WorkerAttempt = { receiptId: string; status: string };
/** Outbox identities only (never legacy aliases or attempts). Eligibility means
 * due for a worker claim; dispatch still checks consent, STOP and fresh facts.
 * Read both aggregates from one snapshot, without fetching recipient data. */
export async function loadSmsQueueHealth(db: Pick<PrismaClient, "$transaction">, now = new Date()) {
  return db.$transaction(async tx => {
    const groups = await tx.smsNotification.groupBy({ by: ["status", "reasonCode"], _count: { _all: true } });
    const due = await tx.smsNotification.aggregate({
      where: { status: "QUEUED", nextAttemptAt: { lte: now } },
      _count: { _all: true }, _min: { createdAt: true },
    });
    const states = counts();
    for (const group of groups) states[projectSmsDelivery({ ...group, recipientType: "UNKNOWN" }).status] += group._count._all;
    const oldest = due._min.createdAt;
    return { statusBasis: "CURRENT_OUTBOX_SNAPSHOT" as const, asOf: now.toISOString(), counts: states,
      eligibleQueuedCount: due._count._all, oldestEligibleQueuedAt: oldest?.toISOString() ?? null,
      oldestEligibleQueuedAgeSeconds: oldest ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000)) : null };
  }, { isolationLevel: "RepeatableRead", maxWait: 3000, timeout: 10000 });
}

export type SmsWorkerResult = SmsDeliveryReport & { receiptId: string };
/** Reporting only: never enqueue, dispatch or retry. Resolve legacy aliases to
 * their authoritative tenant-success notification, then deduplicate by identity.
 * Snapshot counts describe current outcomes, not messages sent by this request. */
export async function loadSmsWorkerReport(db: Pick<PrismaClient, "smsNotification" | "smsReceipt">, attempts: WorkerAttempt[]) {
  const results: SmsWorkerResult[] = [], seen = new Set<string>();
  for (const attempt of attempts) {
    let notification = await db.smsNotification.findUnique({ where: { id: attempt.receiptId }, select: { id: true, ...SMS_REPORT_SELECT } });
    const receipt = notification ? null : await db.smsReceipt.findUnique({ where: { id: attempt.receiptId }, select: { id: true, paymentId: true, status: true, providerMessageId: true } });
    if (!notification && receipt) notification = await db.smsNotification.findFirst({ where: { paymentId: receipt.paymentId, ...TENANT_RECEIPT_NOTIFICATION,
      ...(receipt.providerMessageId ? { providerMessageId: receipt.providerMessageId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, ...SMS_REPORT_SELECT } });
    const id = notification?.id ?? attempt.receiptId;
    const report = projectSmsDelivery(notification, receipt);
    const key = report.source + ":" + id;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ receiptId: id, ...report });
  }
  const summary = counts();
  for (const r of results) summary[r.status]++;
  return { processed: results.length, statusBasis: "CURRENT_DURABLE_OUTCOME" as const,
    queued: summary.QUEUED, sending: summary.SENDING, sent: summary.SENT, delivered: summary.DELIVERED,
    failed: summary.FAILED, suppressed: summary.SUPPRESSED, ambiguous: summary.AMBIGUOUS, unknown: summary.UNKNOWN,
    // Dispatch skips are an operation count, separate from deduplicated outcomes.
    skipped: attempts.filter(a => a.status === "SKIPPED").length, results };
}
