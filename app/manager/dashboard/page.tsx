import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { formatBillingCycleLabel, getCurrentBillingCycle, getDashboardPaymentScope, getDashboardStatus, getPaymentMethodLabel, type DashboardPayment } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { getSetupRoute } from "@/lib/setupProgress";
import { loadBusinessPaymentReadiness } from "@/lib/businessPaymentReadiness";
import { reportingTimeZone, reportingMonthRange } from "@/lib/reportingCalendar";
import { loadTransactionReport, parseReportFilters, ReportInputError } from "@/lib/transactionReporting";
import ManagerDashboardClient from "./ManagerDashboardClient";
export const dynamic = "force-dynamic";

export default async function ManagerDashboardPage(props: {searchParams?: Promise<Record<string,string|string[]|undefined>>}) {
  const {searchParams}=props ?? {};
  const { manager, business } = await requireManager();
  if (getSetupRoute(business) !== "/manager/dashboard") redirect("/setup/continue");
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(await searchParams ?? {})) for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key,v);
  let filters;
  try { filters = parseReportFilters(params); }
  catch (error) { if (error instanceof ReportInputError) return <main><h1>Payments</h1><p role="alert">{error.message}</p><Link href="/manager/dashboard">Clear filters</Link></main>; throw error; }
  const current = await loadBusinessPaymentReadiness(business.id);
  if (!current) redirect("/login/manager");
  const timeZone = reportingTimeZone(business.propertyTimeZone);
  const billingCycle = getCurrentBillingCycle(new Date(), business.propertyTimeZone);
  const report = await loadTransactionReport(prisma, business.id, filters, timeZone, false, getDashboardPaymentScope(business.id, billingCycle, business.propertyTimeZone));
  const payments: DashboardPayment[] = report.payments.map(payment => ({
    id: payment.id, paymentType: payment.paymentType as "Custom" | "Standard", status: getDashboardStatus(payment.status)!,
    statusDetail: payment.statusLabel, customerName: [payment.payerFirstName,payment.payerLastName].join(" "),
    reference: payment.referenceLabel ?? "-", amountCents: payment.subtotalCents,
    paymentMethod: getPaymentMethodLabel(payment.paymentMethod), timestamp: payment.timestamp,
  }));
  if ((await requireManager()).business.id !== business.id) redirect("/login/manager");
  return <ManagerDashboardClient readiness={current.readiness} businessName={business.name} accountCode={business.accountCode ?? "-"}
    managerName={manager.displayName ?? manager.email} billingCycleLabel={formatBillingCycleLabel(billingCycle)}
    payments={payments} total={report.total} filters={filters} timeZone={timeZone} legacyTimeZone={business.propertyTimeZone === null}
    nextCycleAt={reportingMonthRange(billingCycle,timeZone).lt.toISOString()}/>;
}
