import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSetupRoute } from "@/lib/setupProgress";
import { reportingTimeZone } from "@/lib/reportingCalendar";
import { loadTransactionReport, parseReportFilters, ReportInputError } from "@/lib/transactionReporting";
import ManagerHistoryClient from "./ManagerHistoryClient";
export const dynamic = "force-dynamic";
export default async function ManagerHistoryPage(props: {searchParams?:Promise<Record<string,string|string[]|undefined>>}) {
  const {searchParams}=props ?? {};
  const { manager,business } = await requireManager();
  if(getSetupRoute(business)!=="/manager/dashboard")redirect("/setup/continue");
  const params=new URLSearchParams();
  for(const [key,value]of Object.entries(await searchParams??{}))for(const v of Array.isArray(value)?value:value===undefined?[]:[value])params.append(key,v);
  let filters;
  try { filters=parseReportFilters(params); }
  catch(error){if(error instanceof ReportInputError)return <main><h1>Payment History</h1><p role="alert">{error.message}</p><Link href="/manager/history">Clear filters</Link></main>;throw error;}
  const timeZone=reportingTimeZone(business.propertyTimeZone);
  const report=await loadTransactionReport(prisma,business.id,filters,timeZone);
  if((await requireManager()).business.id!==business.id)redirect("/login/manager");
  return <ManagerHistoryClient businessName={business.name} accountCode={business.accountCode??"-"} managerName={manager.displayName??manager.email}
    payments={report.payments} total={report.total} filters={filters} timeZone={timeZone} legacyTimeZone={business.propertyTimeZone===null}/>;
}
