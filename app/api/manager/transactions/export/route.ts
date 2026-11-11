import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportingTimeZone } from "@/lib/reportingCalendar";
import { loadTransactionReport, parseReportFilters, ReportInputError, ReportLimitError, transactionReportCsv, transactionReportPrint } from "@/lib/transactionReporting";
import { REPORT_HEADERS } from "@/lib/transactionReportView";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { business } = await requireManager();
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "csv";
  if (!["csv", "print"].includes(format) || params.getAll("format").length > 1) {
    return new Response("Invalid report format.", { status: 400, headers: REPORT_HEADERS });
  }
  params.delete("format");
  try {
    const filters = parseReportFilters(params), timeZone = reportingTimeZone(business.propertyTimeZone);
    const report = await loadTransactionReport(prisma, business.id, filters, timeZone, true);
    const body = format === "csv" ? transactionReportCsv(report.payments, timeZone) : transactionReportPrint(report.payments, timeZone, business.name, filters);
    if (new TextEncoder().encode(body).byteLength > 20 * 1024 * 1024) throw new ReportLimitError("Report is too large. Narrow the date range or filters.");
    if ((await requireManager()).business.id !== business.id) return new Response("Authentication required.", { status: 401, headers: REPORT_HEADERS });
    return new Response(body, { headers: { ...REPORT_HEADERS,
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/html; charset=utf-8",
      ...(format === "csv" ? { "Content-Disposition": 'attachment; filename="rfl-payment-history.csv"' } : {}),
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    } });
  } catch (error) {
    if (error instanceof ReportInputError || error instanceof ReportLimitError) return new Response(error.message, {
      status: error instanceof ReportLimitError ? 413 : 400, headers: REPORT_HEADERS,
    });
    throw error;
  }
}
