"use client";
import Link from "next/link";
import ManagerPushControls from "@/components/ManagerPushControls";
import LogoutButton from "@/components/LogoutButton";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DashboardPayment } from "@/lib/dashboard";
import type { PaymentReadiness } from "@/lib/paymentReadiness";
import { REPORT_STATE_HELP, REPORT_PAGE_SIZE, reportSearchParams, type ReportFilters } from "@/lib/transactionReportView";
import { reportingTimestampFormatter } from "@/lib/reportingCalendar";
type Props = {notificationHistory?:ReactNode;readiness:PaymentReadiness;businessName:string;accountCode:string;managerName:string;billingCycleLabel:string;
  summary:{paid:number;pending:number;issues:number};billingCycle:string;currentCycle:string;
  payments:DashboardPayment[];total:number;filters:ReportFilters;timeZone:string;legacyTimeZone:boolean;nextCycleAt:string};
export default function ManagerDashboardClient(p:Props) {
  const router=useRouter();
  const [shareMessage, setShareMessage] = useState("");
  async function sharePaymentLink() {
    const url = new URL("/" + p.accountCode, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: p.businessName, url });
      else { await navigator.clipboard.writeText(url); setShareMessage("Payment link copied."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareMessage("Unable to share. Open your payment page to copy its link.");
    }
  }
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
  const href=(status:string,page=1)=>{
    const query=reportSearchParams({...p.filters,status},page);
    if(p.billingCycle!==p.currentCycle) query.set("cycle",p.billingCycle);
    return "/manager/dashboard?"+query;
  };
  const pages=Math.max(1,Math.ceil(p.total/REPORT_PAGE_SIZE));
  return <main className="rfl-dashboard-page rfl-manager-home">
    <header className="rfl-home-header">
      <div className="rfl-home-identity"><p className="rfl-eyebrow">RentFrayLite</p><h1>{p.businessName}</h1>
        <button className="rfl-home-code" onClick={sharePaymentLink} type="button" aria-label={"Share payment link for account code "+p.accountCode}>{p.accountCode} <span aria-hidden="true">{"\u2197"}</span></button>
      </div>
      <div className="rfl-home-account-actions">
      <details className="rfl-home-menu"><summary aria-label="Account menu">Account</summary><div>
        <p>{p.managerName}</p><Link href="/manager/settings">Settings</Link>
        <LogoutButton href="/" label="Sign Out" />
      </div></details>
      {p.accountCode && p.accountCode !== "-" && <Link className="rfl-qr-dashboard-link" prefetch={false} href="/manager/payment-qr">Print Payment QR Code</Link>}
      </div>
    </header>
    <ManagerPushControls />
    {p.notificationHistory}
    <aside className={"rfl-home-readiness"+(p.readiness.ready?" is-ready":"")} aria-label="Payment readiness" role="status">
      <span aria-hidden="true">{p.readiness.ready?"\u25cf":"!"}</span> <strong>{p.readiness.title}</strong>
      {p.readiness.reasons.map(r=><p key={r.code}><Link href={r.route}>{r.message}</Link></p>)}
    </aside>
    <nav className="rfl-home-nav" aria-label="Management"><Link href="/manager/dashboard" aria-current="page">Overview</Link><Link href="/manager/history" aria-label="Payment History">History</Link><Link href="/manager/settings">Manage</Link></nav>
    <section className="rfl-home-month" aria-label="Billing month"><div><p className="rfl-eyebrow">Monthly activity</p><h2>{p.billingCycleLabel}</h2></div>
      <form action="/manager/dashboard"><label htmlFor="dashboard-cycle">Choose month</label><div><input id="dashboard-cycle" type="month" name="cycle" required defaultValue={p.billingCycle}/><button type="submit">View</button></div></form>
    </section>
    <section className="rfl-home-summary" aria-label="Monthly payment counts">
      {([["SUCCESSFUL","Paid",p.summary.paid],["PENDING","Pending",p.summary.pending],["FAILED","Needs attention",p.summary.issues]] as const).map(([status,label,count])=><Link href={href(status)} key={status} className={"rfl-summary-"+status.toLowerCase()}><span><i className="rfl-board-dot" aria-hidden="true"/>{label}</span><strong>{count.toLocaleString("en-US")}</strong><small>payment{count===1?"":"s"}</small></Link>)}
    </section>
    <details className="rfl-home-help"><summary>About these totals</summary><div><p>Counts cover the whole selected billing month, independently of list filters. Paid records are not verified bank payouts.</p><p>{REPORT_STATE_HELP}</p><p>Standard payments use their recorded billing cycle; Custom payments use their original transaction month in the display timezone.</p><p>Original transaction dates show when the payment record was created, not settlement or refund dates.</p><p>{p.legacyTimeZone?"UTC display compatibility: property timezone is not configured.":"Display timezone: "+p.timeZone}</p></div></details>
    <section className="rfl-dashboard-payments rfl-home-payments"><header className="rfl-dashboard-payments-header"><h2>Payments <span>{p.total.toLocaleString("en-US")}</span></h2>
      <button className="rfl-home-share" onClick={sharePaymentLink} type="button">Share payment link <span aria-hidden="true">{"\u2197"}</span></button></header>
      <p className="rfl-home-share-message" role="status">{shareMessage}</p>
      <nav className="rfl-dashboard-filters" aria-label="Filter payments">{[["ALL","All"],["PENDING","Pending"],["SUCCESSFUL","Paid"],["FAILED","Issues"]].map(([value,label])=>
        <Link key={value} aria-current={p.filters.status===value?"page":undefined} className={"rfl-dashboard-filter"+(p.filters.status===value?" rfl-dashboard-filter-active":"")} href={href(value)}>{label}</Link>)}</nav>
      <table className="rfl-dashboard-table rfl-home-table rfl-payment-board"><thead><tr>{["Status","Amount","Name","Tier","Unit"].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead>
        <tbody>{p.payments.map(row=><tr key={row.id} className={"rfl-board-"+row.status.toLowerCase()}>
          <td data-label="Status"><span className={"rfl-payment-status rfl-payment-status-"+(row.status==="SUCCESSFUL"?"paid":row.status.toLowerCase())}><i className="rfl-board-dot" aria-hidden="true"/>{row.statusDetail}</span></td>
          <td data-label="Amount" className="rfl-home-row-amount">{money(row.amountCents)}</td>
          <td data-label="Name"><strong>{row.customerName}</strong><span className="rfl-home-row-meta"><time dateTime={row.timestamp} title={row.timestamp}>{date(row.timestamp)}</time> {"\u00b7"} {row.paymentMethod}</span></td>
          <td data-label="Tier">{row.tierLabel}</td>
          <td data-label="Unit">{row.reference}</td>
        </tr>)}</tbody></table>
      {p.payments.length===0?<div className="rfl-dashboard-empty"><span className="rfl-home-empty-symbol" aria-hidden="true">{"\u2197"}</span><h3>{p.filters.status==="ALL" && p.total===0?"No payments yet":"No matching payments"}</h3><p>{p.filters.status==="ALL"?"Share your link so customers can make a payment.":"Try another filter or billing month."}</p><a href={"/"+p.accountCode}>Open payment page</a></div>:null}
      {pages>1?<nav className="rfl-home-pagination" aria-label="Transaction pages"><span>Page {p.filters.page} of {pages}</span>
        {p.filters.page>1?<Link href={href(p.filters.status,p.filters.page-1)}>Previous</Link>:null}
        {p.filters.page<pages?<Link href={href(p.filters.status,p.filters.page+1)}>Next</Link>:null}</nav>:null}
    </section>
  </main>;
}
