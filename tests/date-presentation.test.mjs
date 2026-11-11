import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {reportingFixture} from "./helpers/reporting-harness.mjs";

const f=await reportingFixture();
const {formatReportingTimestamp:format,reportingTimeZone,reportingDayStart,nextReportingDate}=f.calendar;

for(const [instant,zone,text] of [
 ["2026-03-08T09:30:00Z","America/Los_Angeles","1:30:00 AM PST"],
 ["2026-03-08T10:30:00Z","America/Los_Angeles","3:30:00 AM PDT"],
 ["2026-11-01T08:30:00Z","America/Los_Angeles","1:30:00 AM PDT"],
 ["2026-11-01T09:30:00Z","America/Los_Angeles","1:30:00 AM PST"],
 ["2026-12-31T10:30:00Z","Pacific/Kiritimati","Jan 1, 2027"],
 ["2027-01-01T01:30:00Z","America/Los_Angeles","Dec 31, 2026"],
])test("shared formatter "+zone+" "+instant,()=>{
 const original=new Date(instant),before=original.toISOString();assert.ok(format(original,zone).includes(text));assert.equal(format(original,zone),format(instant,zone));assert.equal(original.toISOString(),before);
});

test("legacy fallback is explicit UTC; invalid named timezone is not silently inferred",()=>{
 assert.equal(reportingTimeZone(null),"UTC");assert.ok(format("2027-01-01T01:30:00Z",reportingTimeZone(null)).includes("UTC"));assert.throws(()=>reportingTimeZone("bad/zone"),/Invalid IANA/);
});

for(const [day,hours] of [["2026-03-08",23],["2026-11-01",25],["2026-12-31",24]])test("inclusive filter calendar day "+day+" retains exact "+hours+"-hour range",async()=>{
 const h=await reportingFixture(),zone="America/Los_Angeles",start=reportingDayStart(day,zone),end=reportingDayStart(nextReportingDate(day),zone);
 assert.equal((end-start)/3600000,hours);
 for(const instant of [new Date(start.getTime()-1),start,new Date(end.getTime()-1),end])await h.seed({createdAt:instant,paidAt:new Date("2027-02-01"),customerRefunds:[{stripeRefundId:"r",currency:"usd",status:"succeeded",amountCents:100}]});
 const where=h.report.reportWhere(h.business.id,h.filters("from="+day+"&to="+day),zone);
 const result=await h.report.loadTransactionReport(h.db,h.business.id,h.filters("from="+day+"&to="+day),zone);
 assert.equal(result.total,2);assert.deepEqual(new Set(result.payments.map(p=>p.timestamp)),new Set([start.toISOString(),new Date(end.getTime()-1).toISOString()]));
 assert.equal(where.AND[1].createdAt.gte.toISOString(),start.toISOString());assert.equal(where.AND[1].createdAt.lt.toISOString(),end.toISOString());
});

test("month/year billing-cycle authority remains property-local with legacy UTC compatibility",()=>{
 const instant=new Date("2027-01-01T01:00:00Z");assert.equal(f.dashboard.getCurrentBillingCycle(instant,"America/Los_Angeles"),"2026-12");assert.equal(f.dashboard.getCurrentBillingCycle(instant,null),"2027-01");assert.equal(f.dashboard.getCurrentBillingCycle(instant,"Pacific/Kiritimati"),"2027-01");
 assert.equal(f.dashboard.formatBillingCycleLabel("2026-12"),"December 2026");
});

function clients(h){
 h.mocks.react=React;h.mocks["next/link"]={__esModule:true,default:p=>React.createElement('a',p)};h.mocks["next/navigation"]={...h.mocks["next/navigation"],useRouter:()=>({refresh(){}})};
 return {history:h.load('app/manager/history/ManagerHistoryClient.tsx').default,dashboard:h.load('app/manager/dashboard/ManagerDashboardClient.tsx').default,admin:h.load('app/admin/AdminDashboardClient.tsx').default};
}

test("dashboard/history and CSV/print display the same original instant and explain state/date filters",async()=>{
 const h=await reportingFixture();await h.db.business.update({where:{id:h.business.id},data:{propertyTimeZone:"America/Los_Angeles"}});
 const instant=new Date("2026-11-01T08:30:00Z");const p=await h.seed({createdAt:instant,paidAt:new Date("2026-11-04"),returnedAt:null,disputedAt:null,customerRefunds:[{stripeRefundId:"r",currency:"usd",status:"succeeded",amountCents:100}]});
 await h.seed({businessId:h.businesses[1].id,payerFirstName:"FOREIGN_PRIVATE"});
 const c=clients(h),history=await h.history("status=SUCCESSFUL"),dashboard=await h.dashboardPage("status=SUCCESSFUL");
 const historyHtml=renderToStaticMarkup(React.createElement(c.history,history.props)),dashboardHtml=renderToStaticMarkup(React.createElement(c.dashboard,dashboard.props));
 const expected=format(instant,"America/Los_Angeles");
 for(const html of [historyHtml,dashboardHtml]){assert.ok(html.includes(expected));assert.ok(html.includes(p.createdAt.toISOString()));assert.ok(html.includes("Paid records"));assert.ok(html.includes("Paid records include refunded payments"));assert.ok(html.includes("Partially refunded"));assert.doesNotMatch(html,/FOREIGN_PRIVATE/);}
 assert.ok(historyHtml.includes("From and To dates include both selected calendar days"));assert.ok(historyHtml.includes("Original payment confirmation"));assert.ok(historyHtml.includes("not refund or dispute-resolution timestamps"));
 assert.ok(dashboardHtml.includes("Standard payments use their recorded billing cycle"));
 const record=history.props.payments[0],{headers,rows}=h.report.transactionReportCells([record],"America/Los_Angeles");
 assert.equal(rows[0][headers.indexOf("Original transaction date (UTC)")],instant.toISOString());assert.equal(rows[0][headers.indexOf("Original transaction date (property-local)")],expected);
 for(const response of [await h.endpoint("format=csv"),await h.endpoint("format=print")]){assert.match(response.headers.get("cache-control"),/no-store/);const text=await response.text();assert.ok(text.includes(expected));assert.ok(text.includes(instant.toISOString()));assert.doesNotMatch(text,/FOREIGN_PRIVATE/);}
 const print=h.report.transactionReportPrint([record],"America/Los_Angeles","<private>",h.filters("from=2026-11-01&to=2026-11-01"));assert.ok(print.includes("&lt;private&gt;"));assert.ok(print.includes("up to, but not including"));assert.ok(print.includes("not refund or dispute-resolution timestamps"));
});

test("legacy manager views and exports agree on UTC without assigning a historical timezone",async()=>{
 const h=await reportingFixture();await h.db.business.update({where:{id:h.business.id},data:{propertyTimeZone:null,firstStandardBillingDate:null}});const original=await h.seed();const c=clients(h),page=await h.history("");const html=renderToStaticMarkup(React.createElement(c.history,page.props));assert.ok(html.includes("UTC display compatibility"));assert.ok(html.includes(format(original.createdAt,"UTC")));assert.equal((await h.db.business.findUnique({where:{id:h.business.id}})).propertyTimeZone,null);
 const {headers,rows}=h.report.transactionReportCells(page.props.payments,"UTC");assert.equal(rows[0][headers.indexOf("Display timezone")],"UTC");assert.equal(rows[0][headers.indexOf("Original transaction date (UTC)")],original.createdAt.toISOString());
});

test("administrator presentation names UTC periods and the specific recorded event without changing metrics",async()=>{
 const h=await reportingFixture();await h.seed();const data=await h.load('lib/adminDashboard.ts').getAdminDashboardData(),before=structuredClone(data),c=clients(h);const html=renderToStaticMarkup(React.createElement(c.admin,{initialData:data}));
 for(const text of ["Today (UTC)","This Month (UTC)","original recorded payment confirmation date in UTC","first recorded return date (UTC)","first recorded dispute date (UTC)","not its resolution date"])assert.ok(html.includes(text));assert.deepEqual(data,before);
});

test("lifecycle UTC export dates remain original observations, not a refund/dispute-resolution time",async()=>{
 const h=await reportingFixture(),returnedAt=new Date("2026-11-03T12:00:00Z"),disputedAt=new Date("2026-11-04T12:00:00Z");await h.seed({status:"RETURNED",returnedAt,disputedAt,customerRefunds:[{stripeRefundId:"r",currency:"usd",status:"succeeded",amountCents:100,observedAt:new Date("2026-12-31")} ]});
 const report=await h.list(),{headers,rows}=h.report.transactionReportCells(report.payments,"Asia/Tokyo");assert.equal(rows[0][headers.indexOf("Return first recorded (UTC)")],returnedAt.toISOString());assert.equal(rows[0][headers.indexOf("Dispute first recorded (UTC)")],disputedAt.toISOString());assert.equal(report.payments[0].timestamp,"2026-11-15T12:00:00.000Z");assert.doesNotMatch(JSON.stringify(rows),/2026-12-31/);
});

test("filter values, report limits and named-date validation remain intact",()=>{
 const source=readFileSync('lib/transactionReportView.ts','utf8');assert.match(source,/REPORT_PAGE_SIZE = 50/);assert.match(source,/REPORT_EXPORT_LIMIT = 10000/);assert.equal(f.filters('status=SUCCESSFUL').status,'SUCCESSFUL');assert.equal(f.filters('status=FAILED').status,'FAILED');assert.throws(()=>f.filters('from=2026-02-30'),/valid report dates/);
});

test("large exports reuse a report-local formatter without allocating one per row",async()=>{
 const h=await reportingFixture();await h.seed();const row=(await h.list()).payments[0],original=Intl.DateTimeFormat;let allocations=0;
 Intl.DateTimeFormat=new Proxy(original,{construct(target,args){allocations++;return Reflect.construct(target,args);}});
 try{const result=h.report.transactionReportCells(Array(1001).fill(row),"America/Los_Angeles");assert.equal(result.rows.length,1001);assert.ok(allocations<=3,"Formatter allocation must stay constant as row count grows");}
 finally{Intl.DateTimeFormat=original;}
});
