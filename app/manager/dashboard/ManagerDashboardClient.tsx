"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DashboardPayment } from "@/lib/dashboard";
import type { PaymentReadiness } from "@/lib/paymentReadiness";
import { REPORT_STATE_HELP, REPORT_PAGE_SIZE, reportSearchParams, type ReportFilters } from "@/lib/transactionReportView";
import { reportingTimestampFormatter } from "@/lib/reportingCalendar";
type Props = {readiness:PaymentReadiness;businessName:string;accountCode:string;managerName:string;billingCycleLabel:string;
  payments:DashboardPayment[];total:number;filters:ReportFilters;timeZone:string;legacyTimeZone:boolean;nextCycleAt:string};
export default function ManagerDashboardClient(p:Props) {
  const router=useRouter();
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>,refreshed=false;
    const check=()=>{
      clearTimeout(timer);
      const remaining=Date.parse(p.nextCycleAt)-Date.now();
      if(remaining<=0){if(!refreshed){refreshed=true;router.refresh();}return;}
      timer=setTimeout(check,Math.min(remaining+25,2147483647));
    };
    const visible=()=>{if(document.visibilityState==="visible")check();};
    check();window.addEventListener("focus",check);document.addEventListener("visibilitychange",visible);
    return()=>{clearTimeout(timer);window.removeEventListener("focus",check);document.removeEventListener("visibilitychange",visible);};
  },[p.nextCycleAt,router]);
  const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
  const date=reportingTimestampFormatter(p.timeZone);
  const href=(status:string,page=1)=>"/manager/dashboard?"+reportSearchParams({...p.filters,status},page);
  return <main className="rfl-dashboard-page">
    <aside aria-label="Payment readiness" role="status"><strong>{p.readiness.title}</strong>{p.readiness.reasons.map(r=><p key={r.code}><Link href={r.route}>{r.message}</Link></p>)}</aside>
    <header className="rfl-dashboard-header"><div><p className="rfl-eyebrow">Manager dashboard</p><h1>{p.businessName}</h1>
      <p>Account code: <strong>{p.accountCode}</strong> | Signed in as {p.managerName}</p></div>
      <nav className="rfl-history-header-actions" aria-label="Management"><Link className="rfl-primary-button" href="/manager/history">Payment History</Link>
        <Link className="rfl-secondary-button" href="/manager/settings">Manage</Link>
        <button
  className="rfl-secondary-button rfl-dashboard-signout"
  type="button"
  onClick={async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }
    } finally {
      window.location.assign("/");
    }
  }}
>
  Sign Out
</button></nav></header>
    <section className="rfl-dashboard-cycle-header"><div><p>Current billing cycle</p><h2>{p.billingCycleLabel}</h2>
      <p>{p.legacyTimeZone?"UTC display compatibility: property timezone is not configured.":p.timeZone}</p>
      <p>Standard payments use their recorded billing cycle; Custom payments use their original transaction month in the display timezone.</p></div></section>
    <section className="rfl-dashboard-payments"><header className="rfl-dashboard-payments-header"><h2>Payment transactions</h2>
      <nav className="rfl-dashboard-filters" aria-label="Filter payments">{[["ALL","All"],["PENDING","Pending"],["SUCCESSFUL","Paid records"],["FAILED","Failed / returned / disputed"]].map(([value,label])=>
        <Link key={value} className={"rfl-dashboard-filter"+(p.filters.status===value?" rfl-dashboard-filter-active":"")} href={href(value)}>{label}</Link>)}</nav></header>
      <p>{p.total} matching transactions</p>
      <p>{REPORT_STATE_HELP}</p><p>Original transaction dates show when the payment record was created, not settlement or refund dates.</p>
      {p.payments.length===0?<div className="rfl-dashboard-empty"><h3>No matching payments</h3><p>Recorded payments for this cycle will appear here.</p></div>:
      <div style={{overflowX:"auto"}}><table className="rfl-dashboard-table"><thead><tr>{["Tenant","Unit","Amount","Status","Method","Original transaction date","Type"].map(h=><th key={h}>{h}</th>)}</tr></thead>
        <tbody>{p.payments.map(row=><tr key={row.id}><td>{row.customerName}</td><td>{row.reference}</td><td>{money(row.amountCents)}</td>
          <td><span className={"rfl-payment-status rfl-payment-status-"+(row.status==="SUCCESSFUL"?"paid":row.status.toLowerCase())}>{row.statusDetail}</span></td>
          <td>{row.paymentMethod}</td><td><time dateTime={row.timestamp} title={row.timestamp}>{date(row.timestamp)}</time></td><td>{row.paymentType}</td></tr>)}</tbody></table></div>}
      <nav aria-label="Transaction pages"><p>Page {p.filters.page} of {Math.max(1,Math.ceil(p.total/REPORT_PAGE_SIZE))}</p>
        {p.filters.page>1?<Link href={href(p.filters.status,p.filters.page-1)}>Previous</Link>:null}{" "}
        {p.filters.page*REPORT_PAGE_SIZE<p.total?<Link href={href(p.filters.status,p.filters.page+1)}>Next</Link>:null}</nav>
    </section>
  </main>;
}
