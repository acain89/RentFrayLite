import Link from "next/link";
import { isValidBillingCycle } from "@/lib/billingCalendar";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { formatBillingCycleLabel, getCurrentBillingCycle, getDashboardPaymentScope, getDashboardStatus, getDashboardTierLabel, getPaymentMethodLabel, type DashboardPayment } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { getSetupRoute } from "@/lib/setupProgress";
import { loadBusinessPaymentReadiness } from "@/lib/businessPaymentReadiness";
import { reportingTimeZone, reportingMonthRange, reportingDate } from "@/lib/reportingCalendar";
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
  let selectedCycle: string | null = null;
  try {
    const cycles = params.getAll("cycle");
    if (cycles.length > 1 || (cycles.length === 1 && !isValidBillingCycle(cycles[0]))) throw new ReportInputError("Choose a valid billing month.");
    if (cycles.length === 1) {
      try { reportingMonthRange(cycles[0], reportingTimeZone(business.propertyTimeZone)); }
      catch (error) { if (error instanceof RangeError) throw new ReportInputError("Choose a valid billing month."); throw error; }
    }
    selectedCycle = cycles[0] ?? null;
    params.delete("cycle");
    filters = parseReportFilters(params);
  }
  catch (error) { if (error instanceof ReportInputError) return <main><h1>Payments</h1><p role="alert">{error.message}</p><Link href="/manager/dashboard">Clear filters</Link></main>; throw error; }
  const current = await loadBusinessPaymentReadiness(business.id);
  if (!current) redirect("/login/manager");
  const timeZone = reportingTimeZone(business.propertyTimeZone);
  const currentCycle = getCurrentBillingCycle(new Date(), business.propertyTimeZone);
  const billingCycle = selectedCycle ?? currentCycle;
  const scope = getDashboardPaymentScope(business.id, billingCycle, business.propertyTimeZone);
  const [paid, pending, issues] = await prisma.$transaction(async tx => Promise.all([
    tx.payment.count({ where: { AND: [scope, { status: "PAID" }] } }),
    tx.payment.count({ where: { AND: [scope, { status: "PENDING" }] } }),
    tx.payment.count({ where: { AND: [scope, { status: { in: ["FAILED", "RETURNED", "DISPUTED"] } }] } }),
  ]), { isolationLevel: "RepeatableRead" });
  const billingCycleLabel = Number(billingCycle.slice(0,4)) < 100
    ? new Intl.DateTimeFormat("en-US", { month:"long", year:"numeric", timeZone:"UTC", calendar:"gregory" }).format(reportingDate(billingCycle+"-01"))
    : formatBillingCycleLabel(billingCycle);
  const report = await loadTransactionReport(prisma, business.id, filters, timeZone, false, getDashboardPaymentScope(business.id, billingCycle, business.propertyTimeZone));
  const payments: DashboardPayment[] = report.payments.map(payment => ({
    id: payment.id, paymentType: payment.paymentType as "Custom" | "Standard", status: getDashboardStatus(payment.status)!,
    statusDetail: payment.statusLabel, customerName: [payment.payerFirstName,payment.payerLastName].join(" "),
    tierLabel: getDashboardTierLabel(payment.sourceType, payment.lineItemsSnapshot),
    reference: payment.referenceLabel ?? "-", amountCents: payment.subtotalCents,
    paymentMethod: getPaymentMethodLabel(payment.paymentMethod), timestamp: payment.timestamp,
  }));
  if ((await requireManager()).business.id !== business.id) redirect("/login/manager");
  return <ManagerDashboardClient readiness={current.readiness} businessName={business.name} accountCode={business.accountCode ?? "-"}
    summary={{paid,pending,issues}} billingCycle={billingCycle} currentCycle={currentCycle}
    managerName={manager.displayName ?? manager.email} billingCycleLabel={billingCycleLabel}
    payments={payments} total={report.total} filters={filters} timeZone={timeZone} legacyTimeZone={business.propertyTimeZone === null}
    nextCycleAt={reportingMonthRange(currentCycle,timeZone).lt.toISOString()}/>;
}
