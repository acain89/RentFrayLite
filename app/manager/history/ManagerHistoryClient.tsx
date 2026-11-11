"use client";
import Link from "next/link";
import { REPORT_DATE_HELP, REPORT_STATE_HELP, REPORT_PAGE_SIZE, reportSearchParams, type ReportFilters, type HistoryPayment } from "@/lib/transactionReportView";
import { reportingTimestampFormatter } from "@/lib/reportingCalendar";
export type { HistoryPayment } from "@/lib/transactionReportView";
type Props={businessName:string;accountCode:string;managerName:string;payments:HistoryPayment[];total:number;filters:ReportFilters;timeZone:string;legacyTimeZone:boolean};
const money=(n:number|null)=>n===null?"Not verified / unavailable":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
export default function ManagerHistoryClient(p:Props){
  const query=reportSearchParams(p.filters).toString();
  const date=reportingTimestampFormatter(p.timeZone);
  return <main className="rfl-history-page"><header className="rfl-dashboard-header"><div><p className="rfl-eyebrow">Payment History</p><h1>{p.businessName}</h1>
    <p>Account code: <strong>{p.accountCode}</strong> | Signed in as {p.managerName}</p></div>
    <nav className="rfl-history-header-actions"><Link className="rfl-secondary-button" href="/manager/dashboard">Dashboard</Link><Link className="rfl-secondary-button" href="/manager/settings">Manage</Link></nav></header>
    <p>{p.legacyTimeZone?"UTC display compatibility: property timezone is not configured.":"Dates and filters use "+p.timeZone+"."}</p>
    <p>{REPORT_DATE_HELP}</p><p>{REPORT_STATE_HELP}</p>
    <section className="rfl-history-controls"><form action="/manager/history" method="get"><div className="rfl-history-filter-grid">
      <label>Tenant name<input name="name" aria-label="Tenant name" maxLength={100} defaultValue={p.filters.name}/></label>
      <label>Unit number<input name="unit" maxLength={100} defaultValue={p.filters.unit}/></label>
      <label>From date<input name="from" type="date" defaultValue={p.filters.from}/></label><label>To date<input name="to" type="date" defaultValue={p.filters.to}/></label>
      <label>Payment method<select aria-label="Payment method" name="method" defaultValue={p.filters.method}><option value="ALL">All</option><option value="ACH">ACH</option><option value="CARD">Card</option></select></label>
      <label>Payment status<select aria-label="Payment status" name="status" defaultValue={p.filters.status}>{[["ALL","All"],["PENDING","Pending"],["SUCCESSFUL","Paid records (includes refunds)"],["FAILED","Failed (including returns and disputes)"],["RETURNED","Returned records"],["DISPUTED","Disputed records"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Payment type<select aria-label="Payment type" name="type" defaultValue={p.filters.type}><option value="ALL">All</option><option value="STANDARD">Standard</option><option value="CUSTOM">Custom</option></select></label>
    </div><div className="rfl-history-control-actions"><button className="rfl-primary-button" type="submit">Apply filters</button><Link href="/manager/history">Clear filters</Link></div></form>
    <div className="rfl-history-control-actions"><a className="rfl-primary-button" href={"/api/manager/transactions/export?"+query}>Export CSV</a>{" "}
      <a className="rfl-secondary-button" href={"/api/manager/transactions/export?"+query+(query?"&":"")+"format=print"} target="_blank" rel="noopener noreferrer">Print</a></div>
    <p>Export and print include all matches, up to 10,000 transactions. Narrow filters for larger reports.</p></section>
    <section className="rfl-dashboard-payments"><h2>{p.total} matching transactions</h2>
    {!p.payments.length?<p>No matching payments.</p>:<div style={{overflowX:"auto"}}><table className="rfl-dashboard-table"><thead><tr>{["Tenant","Unit","Amount","Status","Method","Original transaction date","Type","Details"].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{p.payments.map(row=><tr key={row.id}><td>{row.payerFirstName} {row.payerLastName}</td><td>{row.referenceLabel??"-"}</td><td>{money(row.subtotalCents)}</td><td>{row.statusLabel}</td>
        <td>{row.paymentMethod??"-"}</td><td><time dateTime={row.timestamp} title={row.timestamp}>{date(row.timestamp)}</time></td><td>{row.paymentType}</td><td><details><summary>View transaction</summary>
          <dl><dt>Transaction ID</dt><dd>{row.id}</dd><dt>Original description</dt><dd>{row.itemDescription}</dd><dt>Original billing cycle</dt><dd>{row.billingCycle??(row.paymentType==="Custom"?"Not applicable":"Not recorded")}</dd>
            <dt>Tenant processing fee</dt><dd>{money(row.platformFeeCents)}</dd><dt>Total tenant charge</dt><dd>{money(row.totalChargedCents)}</dd>
            <dt>Expected management proceeds</dt><dd>{money(row.expectedManagementProceedsCents)}</dd><dt>Verified management proceeds</dt><dd>{money(row.verifiedManagementProceedsCents)}</dd>
            <dt>Estimated Stripe processing cost</dt><dd>{money(row.expectedProcessorFeeCents)}</dd><dt>Verified Stripe processing cost</dt><dd>{money(row.verifiedProcessorFeeCents)}</dd>
            <dt>Direct fee-ledger evidence</dt><dd>{row.financialEvidence}{row.financialObservationAt ? " as of " + date(row.financialObservationAt) : ""}</dd>
            <dt>Observed application fee</dt><dd>{money(row.observedApplicationFeeCents)}</dd><dt>Application-fee refunds</dt><dd>{money(row.observedApplicationFeeRefundCents)}</dd>
            <dt>Confirmed management correction</dt><dd>{money(row.confirmedManagementCorrectionCents)}</dd><dt>Observed management shortfall</dt><dd>{money(row.observedManagementShortfallCents)}</dd>
            <dt>Observed platform fee-ledger revenue</dt><dd>{money(row.observedPlatformRevenueCents)} (as of observation; not current net profit)</dd>
            <dt>Observed customer refunds</dt><dd>{money(row.customerRefundCents)}</dd>
            <dt>Pending customer refunds</dt><dd>{money(row.pendingCustomerRefundCents)}</dd>
            <dt>Failed / canceled customer refunds</dt><dd>{money(row.failedCustomerRefundCents)}</dd>
            <dt>Customer principal / tenant-fee refund allocation</dt><dd>Unknown / unavailable</dd>
            <dt>Failure code</dt><dd>{row.failureCode??"None recorded"}</dd>
            {row.pendingAt?<><dt>Processing first recorded</dt><dd>{date(row.pendingAt)}</dd></>:null}
            {row.paidAt?<><dt>Original payment confirmation</dt><dd>{date(row.paidAt)}</dd></>:null}
            {row.failedAt?<><dt>Failure first recorded</dt><dd>{date(row.failedAt)}</dd></>:null}
            {row.returnedAt?<><dt>Return first recorded</dt><dd>{date(row.returnedAt)}</dd></>:null}
            {row.disputedAt?<><dt>Dispute first recorded</dt><dd>{date(row.disputedAt)}</dd></>:null}</dl>
          <p>These are original recorded dates, not refund or dispute-resolution timestamps.</p>
          <p>Original charge breakdown</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(row.lineItemsSnapshot,null,2)}</pre>
          <p>Expected figures are not verified Stripe proceeds. Settlement is not a bank payout.</p>
        </details></td></tr>)}</tbody></table></div>}
      <nav aria-label="Transaction pages"><p>Page {p.filters.page} of {Math.max(1,Math.ceil(p.total/REPORT_PAGE_SIZE))}</p>
        {p.filters.page>1?<Link href={"/manager/history?"+reportSearchParams(p.filters,p.filters.page-1)}>Previous</Link>:null}{" "}
        {p.filters.page*REPORT_PAGE_SIZE<p.total?<Link href={"/manager/history?"+reportSearchParams(p.filters,p.filters.page+1)}>Next</Link>:null}</nav>
    </section>
  </main>;
}
