import type { PaymentStatus } from "@prisma/client";
import { reportingDate, nextReportingDate } from "@/lib/reportingCalendar";
export const REPORT_PAGE_SIZE = 50;
export const REPORT_EXPORT_LIMIT = 10000;
export const REPORT_DATE_HELP = "Original transaction date is when the payment record was created. From and To dates include both selected calendar days in the display timezone: from local midnight up to, but not including, midnight after To. Settlement, refund and dispute dates do not change this range.";
export const REPORT_STATE_HELP = "Paid records include refunded payments. Failed includes returns and disputes. Row labels show refund and dispute outcomes separately.";
export const REPORT_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export const RECORDED_PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "PAID", "FAILED", "RETURNED", "DISPUTED"];
export type PrimaryPaymentStatus = "PENDING" | "SUCCESSFUL" | "FAILED";
export function primaryPaymentStatus(status: PaymentStatus): PrimaryPaymentStatus | null {
  if (status === "PAID") return "SUCCESSFUL";
  if (status === "PENDING") return "PENDING";
  if (["FAILED", "RETURNED", "DISPUTED"].includes(status)) return "FAILED";
  return null;
}
export function paymentStatusLabel(status: PaymentStatus): string {
  if (primaryPaymentStatus(status) === null) throw new Error("Not a recorded payment status.");
  if (status === "RETURNED") return "Failed (Returned)";
  if (status === "DISPUTED") return "Failed (Disputed)";
  return primaryPaymentStatus(status) === "SUCCESSFUL" ? "Successful" : primaryPaymentStatus(status) === "PENDING" ? "Pending" : "Failed";
}
export type ReportFilters = { from: string; to: string; name: string; unit: string; method: string; status: string; type: string; page: number };
export class ReportInputError extends Error {}
export class ReportLimitError extends Error {}
export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const allowed = new Set(["from", "to", "name", "unit", "method", "status", "type", "page"]);
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new ReportInputError("Invalid report filters.");
  const result: ReportFilters = { from: params.get("from") ?? "", to: params.get("to") ?? "", name: (params.get("name") ?? "").trim(),
    unit: (params.get("unit") ?? "").trim(), method: params.get("method") ?? "ALL", status: params.get("status") ?? "ALL", type: params.get("type") ?? "ALL", page: 1 };
  if (result.name.length > 100 || result.unit.length > 100 || /[\x00-\x1f\x7f]/.test(result.name + result.unit)) throw new ReportInputError("Search values are too long or invalid.");
  try { if (result.from) reportingDate(result.from); if (result.to) { reportingDate(result.to); reportingDate(nextReportingDate(result.to)); } }
  catch { throw new ReportInputError("Enter valid report dates."); }
  if (result.from && result.to && result.from > result.to) throw new ReportInputError("The end date must follow the start date.");
  if (!["ALL", "ACH", "CARD"].includes(result.method) || !["ALL", "PENDING", "SUCCESSFUL", "FAILED", "RETURNED", "DISPUTED"].includes(result.status) ||
      !["ALL", "STANDARD", "CUSTOM"].includes(result.type)) throw new ReportInputError("Invalid report filter selection.");
  const page = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,4}$/.test(page)) throw new ReportInputError("Invalid report page.");
  result.page = Number(page);
  return result;
}
export function reportSearchParams(filters: ReportFilters, page = 1) {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "name", "unit", "method", "status", "type"] as const) if (filters[key] && filters[key] !== "ALL") params.set(key, filters[key]);
  if (page !== 1) params.set("page", String(page));
  return params;
}

export type { HistoryPayment } from "@/lib/transactionReporting";
