import { projectDirectFinancialReport } from "@/lib/directFinancialReporting";
import { CUSTOMER_REFUND_REPORT_SELECT, loadReportingDisputeOutcomes, projectPaymentOutcome } from "@/lib/paymentReportingOutcome";
import { Prisma, type PrismaClient, type PaymentStatus } from "@prisma/client";
import { reportingTimestampFormatter, nextReportingDate, reportingDayStart } from "@/lib/reportingCalendar";

import { REPORT_DATE_HELP, REPORT_STATE_HELP, RECORDED_PAYMENT_STATUSES, REPORT_PAGE_SIZE, REPORT_EXPORT_LIMIT, ReportLimitError, type ReportFilters } from "@/lib/transactionReportView";
export { parseReportFilters, ReportInputError, ReportLimitError } from "@/lib/transactionReportView";
const literalContains = (value: string) => value.replace(/[\\%_]/g, "\\$&");
export function reportWhere(businessId: string, filters: ReportFilters, timeZone: string): Prisma.PaymentWhereInput {
  const and: Prisma.PaymentWhereInput[] = [{ businessId, status: { in: RECORDED_PAYMENT_STATUSES } }];
  if (filters.from || filters.to) and.push({ createdAt: { ...(filters.from ? { gte: reportingDayStart(filters.from, timeZone) } : {}),
    ...(filters.to ? { lt: reportingDayStart(nextReportingDate(filters.to), timeZone) } : {}) } });
  if (filters.name) {
    const words = filters.name.split(/\s+/);
    for (const word of words) and.push({ OR: [{ payerFirstName: { contains: literalContains(word), mode: "insensitive" } }, { payerLastName: { contains: literalContains(word), mode: "insensitive" } }] });
  }
  if (filters.unit) and.push({ referenceLabel: { contains: literalContains(filters.unit), mode: "insensitive" } });
  if (filters.method !== "ALL") and.push({ paymentMethod: filters.method as "ACH" | "CARD" });
  if (filters.type !== "ALL") and.push({ sourceType: filters.type === "CUSTOM" ? "CUSTOM_PAYMENT" : "RECURRING_PLAN" });
  if (filters.status !== "ALL") and.push({ status: filters.status === "SUCCESSFUL" ? "PAID" : filters.status === "FAILED" ? { in: ["FAILED", "RETURNED", "DISPUTED"] } : filters.status as PaymentStatus });
  return { AND: and };
}

// Explicit allowlist: no phone/email, provider credentials, raw webhook data or
// current tier joins. Financial figures come only from the recorded transaction.
export const REPORT_SELECT = {
  customerRefunds: { select: CUSTOMER_REFUND_REPORT_SELECT },
  businessId: true, checkoutAttemptId: true, chargeModel: true, pricingVersion: true, stripeConnectedAccountId: true, stripePlatformAccountId: true, stripeMode: true,
  stripeCheckoutSessionId: true, stripePaymentIntentId: true, stripeChargeId: true, rflApplicationFeeCents: true,
  id: true, sourceType: true, sourceId: true, status: true, paymentMethod: true, payerFirstName: true, payerLastName: true, referenceLabel: true,
  itemDescription: true, lineItemsSnapshot: true, subtotalCents: true, platformFeeCents: true, totalChargedCents: true,
  businessProceedsCents: true, expectedStripeProcessingFeeCents: true, processorFeeCents: true, actualManagementNetCents: true,
  stripeBalanceTransactionId: true, billingCycle: true, createdAt: true, paidAt: true, pendingAt: true, failedAt: true,
  returnedAt: true, disputedAt: true, failureCode: true,
  financialReconciliation: { select: {
    id: true, paymentId: true, status: true, reasonCode: true, refreshRequested: true, expectedSnapshot: true, latestObservation: true,
    applicationFeeId: true, actualProcessorFeeCents: true, observedManagementNetCents: true, correctionCents: true, confirmedCorrectionCents: true,
    unresolvedShortfallCents: true, stripeRefundId: true, reservedAt: true, leaseToken: true, leaseUntil: true,
  } },
} satisfies Prisma.PaymentSelect;
export type ReportRecord = Prisma.PaymentGetPayload<{ select: typeof REPORT_SELECT }>;
export function serializeReportPayment(p: ReportRecord, disputeOutcome?: unknown) {
  // A stored estimate is never promoted to an observed Stripe financial fact.
  const observed = projectDirectFinancialReport(p, p.financialReconciliation);
  const outcome = projectPaymentOutcome({ ...p, disputeOutcome });
  const superseded = (outcome.customerRefundCents ?? 0) > 0 || (outcome.pendingCustomerRefundCents ?? 0) > 0 || p.status === "DISPUTED" || p.status === "RETURNED";
  const verified = !superseded && p.chargeModel !== "DIRECT" && p.status === "PAID" && !!p.stripeBalanceTransactionId;
  return { id: p.id, sourceType: p.sourceType, sourceId: p.sourceId, paymentType: p.sourceType === "CUSTOM_PAYMENT" ? "Custom" : "Standard",
    status: p.status, paymentMethod: p.paymentMethod,
    payerFirstName: p.payerFirstName, payerLastName: p.payerLastName, referenceLabel: p.referenceLabel,
    itemDescription: p.itemDescription, lineItemsSnapshot: p.lineItemsSnapshot, subtotalCents: p.subtotalCents,
    platformFeeCents: p.platformFeeCents, totalChargedCents: p.totalChargedCents,
    expectedManagementProceedsCents: p.businessProceedsCents ?? null, expectedProcessorFeeCents: p.expectedStripeProcessingFeeCents ?? null,
    verifiedProcessorFeeCents: p.chargeModel === "DIRECT" ? observed.observedProcessorFeeCents : verified ? p.processorFeeCents : null,
    verifiedManagementProceedsCents: p.chargeModel === "DIRECT" ? observed.observedManagementNetCents : verified ? p.actualManagementNetCents : null,
    quotedApplicationFeeCents: p.rflApplicationFeeCents ?? null, ...observed, ...outcome,
    ...(superseded ? { verifiedManagementProceedsCents: null, observedManagementNetCents: null, observedPlatformRevenueCents: null } : {}),
    billingCycle: p.billingCycle, timestamp: p.createdAt.toISOString(), failureCode: p.failureCode,
    paidAt: p.paidAt?.toISOString() ?? null, pendingAt: p.pendingAt?.toISOString() ?? null, failedAt: p.failedAt?.toISOString() ?? null,
    returnedAt: p.returnedAt?.toISOString() ?? null, disputedAt: p.disputedAt?.toISOString() ?? null };
}
export type HistoryPayment = ReturnType<typeof serializeReportPayment>;
export async function loadTransactionReport(db: PrismaClient, businessId: string, filters: ReportFilters, timeZone: string, complete = false, scope?: Prisma.PaymentWhereInput) {
  const where: Prisma.PaymentWhereInput = { AND: [reportWhere(businessId, filters, timeZone), ...(scope ? [scope] : [])] };
  return db.$transaction(async tx => {
    const total = await tx.payment.count({ where });
    if (complete && total > REPORT_EXPORT_LIMIT) throw new ReportLimitError(`More than ${REPORT_EXPORT_LIMIT} transactions match. Narrow the date range or filters before exporting or printing.`);
    const records = await tx.payment.findMany({ where, select: REPORT_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: complete ? 0 : (filters.page - 1) * REPORT_PAGE_SIZE, take: complete ? REPORT_EXPORT_LIMIT : REPORT_PAGE_SIZE });
    const outcomes = await loadReportingDisputeOutcomes(tx, records);
    const payments = records.map(p => serializeReportPayment(p, outcomes.get(p.id)));
    return { payments, total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export function csvEscape(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\x00-\x1f\x7f-\x9f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
const dollars = (cents: number | null) => cents == null ? "" : (cents / 100).toFixed(2);
export function transactionReportCells(payments: HistoryPayment[], timeZone: string) {
  const localDate = reportingTimestampFormatter(timeZone);
  const headers = ["Transaction ID", "Original transaction date (UTC)", "Original transaction date (property-local)", "Display timezone", "Tenant first name", "Tenant last name", "Unit", "Type", "Status", "Internal status", "Method",
    "Original payment amount (USD)", "Tenant processing fee (USD)", "Total tenant charge (USD)", "Expected management proceeds (USD)", "Verified management proceeds (USD)",
    "Estimated Stripe processing cost (USD)", "Verified Stripe processing cost (USD)", "Original billing cycle", "Original description", "Original charge breakdown (JSON)", "Failure code", "Return first recorded (UTC)", "Dispute first recorded (UTC)",
    "Direct fee-ledger evidence", "Financial observation date (UTC)", "Quoted application fee (USD)", "Observed application fee (USD)",
    "Observed application-fee refunds (USD)", "Confirmed management correction (USD)", "Observed platform fee-ledger revenue as of observation (USD)",
    "Observed management shortfall (USD)", "Customer principal refunds (unknown) (USD)", "Customer refund state", "Observed successful customer refunds (USD)", "Pending customer refunds (USD)", "Failed/canceled customer refunds (USD)", "Customer tenant-fee refunds (unknown) (USD)", "Dispute outcome"];
  const rows = payments.map(p => [p.id, p.timestamp, localDate(p.timestamp), timeZone, p.payerFirstName, p.payerLastName, p.referenceLabel, p.paymentType, p.statusLabel, p.status, p.paymentMethod,
    dollars(p.subtotalCents), dollars(p.platformFeeCents), dollars(p.totalChargedCents), dollars(p.expectedManagementProceedsCents), dollars(p.verifiedManagementProceedsCents),
    dollars(p.expectedProcessorFeeCents), dollars(p.verifiedProcessorFeeCents), p.billingCycle, p.itemDescription, JSON.stringify(p.lineItemsSnapshot), p.failureCode, p.returnedAt, p.disputedAt,
    p.financialEvidence, p.financialObservationAt, dollars(p.quotedApplicationFeeCents), dollars(p.observedApplicationFeeCents),
    dollars(p.observedApplicationFeeRefundCents), dollars(p.confirmedManagementCorrectionCents), dollars(p.observedPlatformRevenueCents),
    dollars(p.observedManagementShortfallCents), dollars(p.customerPrincipalRefundCents), p.refundState, dollars(p.customerRefundCents), dollars(p.pendingCustomerRefundCents), dollars(p.failedCustomerRefundCents), dollars(p.customerTenantFeeRefundCents), p.disputeOutcome]);
  return { headers, rows };
}


export function transactionReportCsv(payments: HistoryPayment[], timeZone: string): string {
  const { headers,rows } = transactionReportCells(payments,timeZone);
  return [headers,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");
}
const html = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function transactionReportPrint(payments: HistoryPayment[], timeZone: string, businessName: string, filters: ReportFilters): string {
  const {headers,rows}=transactionReportCells(payments,timeZone);
  // Concise paper labels; canonical field names remain attached to each value.
  // All 39 cells, including empty/unknown observations, stay in original order.
  const labels = ["Transaction ID", "Original UTC", "Original property-local", "Timezone", "First name", "Last name", "Unit", "Type", "Status", "Recorded status", "Method",
    "Original amount", "Tenant processing fee", "Total tenant charge", "Expected management proceeds", "Verified management proceeds", "Estimated Stripe cost", "Verified Stripe cost", "Billing cycle", "Description", "Original charges (JSON)", "Failure code", "Return first recorded UTC", "Dispute first recorded UTC",
    "Direct fee-ledger evidence", "Financial observed UTC", "Quoted application fee", "Observed application fee", "Observed application-fee refunds", "Confirmed management correction", "Observed platform fee-ledger revenue (as observed)", "Observed management shortfall", "Principal refunds (unknown)", "Refund state", "Successful customer refunds", "Pending customer refunds", "Failed/canceled customer refunds", "Tenant-fee refunds (unknown)", "Dispute outcome"];
  const keyFields = new Set([2,4,5,6,7,8,10,11,13,33,38]);
  const records=rows.map(row=>'<tr><td><h2>Transaction ID <span>'+html(row[0])+'</span></h2><dl>'+headers.slice(1).map((label,index)=>{
    const field=index+1,wide=[19,20].includes(field)&&String(row[field]??"").length>100;
    return '<div class="field'+(wide?' wide':'')+(keyFields.has(field)?' key':'')+'"><dt title="'+html(label)+'">'+html(labels[field])+'</dt><dd>'+html(row[field])+'</dd></div>';
  }).join("")+'</dl></td></tr>').join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>RFL transaction report</title><style>body{font-family:Arial,sans-serif;margin:20px;font-size:10pt;line-height:1.1;color:#17251c}h1{font-size:15pt;margin:0 0 4px}body>p{font-size:9pt;margin:2px 0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10pt}td,th{border:1px solid #999;padding:3px;text-align:left}thead{display:table-header-group}th{background:#edf2ee}h2{font-size:10pt;margin:0 0 2px;break-after:avoid}h2 span{display:inline;font-size:10pt;overflow-wrap:anywhere}dl{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 10px;margin:0}.field{display:inline-flex;align-items:baseline;gap:3px;max-width:100%;min-width:0;break-inside:avoid}.wide{flex-basis:100%;display:block}dt{display:inline;font-size:9pt;font-weight:bold}dt::after{content:": "}dd{display:inline;margin:0;min-width:0;white-space:pre-line;overflow-wrap:anywhere}.key dd{font-weight:bold}@media screen and (max-width:600px){dl{display:block}.field{display:flex;flex-wrap:wrap;margin-bottom:3px}}@media print{@page{size:A4 landscape;margin:10mm}.actions{display:none}body{margin:0}tr{break-inside:avoid-page}table{print-color-adjust:exact}}</style></head><body><h1>'+html(businessName)+' - Payment History</h1><p>'+html(rows.length)+' matching transactions. Display timezone: '+html(timeZone)+'. All financial amounts are USD. Original transaction date means record creation; UTC and display-timezone fields show the same instant. Other date fields marked UTC remain UTC.</p><p>'+html(REPORT_DATE_HELP)+'</p><p>'+html(REPORT_STATE_HELP)+'</p><p>Lifecycle dates are original recorded events, not refund or dispute-resolution timestamps.</p><p>Selected filters: '+html(JSON.stringify({...filters,page:undefined}))+'</p><p>Expected figures and estimated costs are not verified proceeds or Stripe costs. Blank verified figures mean unavailable. Settlement is not a bank payout. Direct financial observations are historical as-of fee-ledger facts, not current net profit. Unknown customer principal refunds remain blank; refunds or returns can supersede earlier observations.</p><p class="actions">Use your browser Print command to print or save this complete report.</p><table><thead><tr><th scope="col">Transaction records - original payment facts and subsequent observations; amounts USD</th></tr></thead><tbody>'+records+'</tbody></table></body></html>';
}
