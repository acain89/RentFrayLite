import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reportingFixture} from "./helpers/reporting-harness.mjs";
import {authHarness} from "./helpers/auth-harness.mjs";

const base=await reportingFixture();
const {loadReportingDisputeOutcomes:batch,loadReportingDisputeOutcome:single}=base.load("lib/paymentReportingOutcome.ts");
const metadata=status=>({reportingDisputes:[{id:"dp_private",status}],private:"PRIVATE_LEDGER"});
function journalStorage(rows){
 const queries=[];
 const db={auditLog:{findMany:async q=>{
  queries.push(q);assert.equal(q.where.actorType,"STRIPE_WEBHOOK");assert.equal(q.where.targetType,"PAYMENT");assert.equal(q.take,undefined,"Never truncate terminal history");
  assert.deepEqual(q.orderBy,[{createdAt:"desc"},{id:"desc"}]);
  const scopes=q.where.AND?.[0].OR??[{businessId:q.where.businessId,targetId:{in:[q.where.targetId]}}];
  return rows.filter(r=>scopes.some(s=>s.businessId===r.businessId&&s.targetId.in.includes(r.targetId))).map(r=>structuredClone(r));
 }}};
 return {db,queries};
}

test("batch outcomes match the original single reader with duplicate/out-of-order terminal observations",async()=>{
 const p=[{id:"p1",businessId:"a",disputedAt:new Date()},{id:"p2",businessId:"b",disputedAt:new Date()},{id:"p3",businessId:"a",disputedAt:new Date()}];
 const rows=[...['under_review','lost','under_review','lost'].map(s=>({businessId:"a",targetId:"p1",metadata:metadata(s)})),...['under_review','won','under_review'].map(s=>({businessId:"b",targetId:"p2",metadata:metadata(s)}))];
 const s=journalStorage(rows),out=await batch(s.db,p);
 assert.equal(s.queries.length,1);assert.deepEqual(s.queries[0].where.AND[0].OR,[{businessId:"a",targetId:{in:["p1","p3"]}},{businessId:"b",targetId:{in:["p2"]}}]);
 for(const row of p)assert.equal(out.get(row.id),await single(s.db,row));
 assert.deepEqual([...out.values()],["LOST","WON",null]);assert.doesNotMatch(JSON.stringify([...out]),/PRIVATE_LEDGER|dp_private/);
});

test("large scoped collections use 500-ID batches and retain arbitrarily late terminal facts",async()=>{
 const p=Array.from({length:1101},(_,i)=>({id:"p"+i,businessId:i%2?"b":"a",disputedAt:new Date()}));
 const rows=Array.from({length:1001},()=>({businessId:"a",targetId:"p0",metadata:metadata("under_review")}));rows.push({businessId:"a",targetId:"p0",metadata:metadata("lost")});
 const s=journalStorage(rows),out=await batch(s.db,p);assert.equal(out.size,1101);assert.equal(out.get("p0"),"LOST");
 assert.equal(s.queries.length,3);assert.deepEqual(s.queries.map(q=>q.where.AND[0].OR.reduce((n,s)=>n+s.targetId.in.length,0)),[500,500,101]);
});

test("absent dispute markers issue no audit reads and duplicate payment inputs do not duplicate reads",async()=>{
 const s=journalStorage([]);const p={id:"p",businessId:"owner",disputedAt:null};assert.equal((await batch(s.db,[p])).get("p"),null);assert.equal(s.queries.length,0);
 await batch(s.db,[{...p,disputedAt:new Date()},{...p,disputedAt:new Date()}]);assert.equal(s.queries.length,1);assert.deepEqual(s.queries[0].where.AND[0].OR[0].targetId.in,["p"]);
});

test("conflicting input ownership and foreign journal rows fail closed without exposing private data",async()=>{
 const p={id:"p",businessId:"owner",disputedAt:new Date()},s=journalStorage([]);
 await assert.rejects(()=>batch(s.db,[p,{...p,businessId:"foreign"}]),/Reporting ownership conflict/);assert.equal(s.queries.length,0);
 for(const bad of [{businessId:"foreign",targetId:"p"},{businessId:"owner",targetId:"other"}])await assert.rejects(()=>batch({auditLog:{findMany:async()=>[{...bad,metadata:metadata("lost")}] }},[p]),e=>e.message==="Reporting observation ownership mismatch");
});

test("manager dashboard/history/CSV/print batch only scoped rows and preserve pagination, filtering and privacy",async()=>{
 const f=await reportingFixture(),audits=[];
 for(let i=0;i<121;i++){const p=await f.seed({id:"p"+String(i).padStart(4,"0"),disputedAt:new Date(),payerFirstName:i===0?"=PRIVATE_FORMULA":"Tenant",referenceLabel:"12"});audits.push({businessId:p.businessId,targetId:p.id,metadata:metadata(i%2?"won":"lost")});}
 const foreign=await f.seed({businessId:f.businesses[1].id,disputedAt:new Date(),payerFirstName:"FOREIGN_PRIVATE"});audits.push({businessId:foreign.businessId,targetId:foreign.id,metadata:metadata("lost")});
 const s=journalStorage(audits);f.db.auditLog.findMany=s.db.auditLog.findMany;
 const pages=await Promise.all([f.list(),f.list("page=2"),f.list("page=3")]);assert.deepEqual(pages.map(p=>p.payments.length),[50,50,21]);assert.equal(new Set(pages.flatMap(p=>p.payments.map(r=>r.id))).size,121);assert.equal(s.queries.length,3);
 for(const q of s.queries)assert.ok(q.where.AND[0].OR.every(s=>s.businessId===f.business.id));
 const history=await f.history(""),dashboard=await f.dashboardPage("");assert.equal(history.props.total,121);assert.equal(dashboard.props.total,121);
 assert.deepEqual(history.props.payments.map(p=>p.statusLabel),dashboard.props.payments.map(p=>p.statusDetail));
 const filtered=await f.list("unit=12&method=ACH&status=SUCCESSFUL&type=STANDARD");assert.equal(filtered.total,121);
 const csv=await f.endpoint("format=csv"),print=await f.endpoint("format=print");const a=await csv.text(),b=await print.text();
 assert.equal(a.split("\r\n").length,122);assert.equal((b.match(/<tr>/g)??[]).length,122);assert.match(a,/'=PRIVATE_FORMULA/);
 for(const response of [csv,print])assert.match(response.headers.get("cache-control"),/no-store/);
 for(const text of [a,b])assert.doesNotMatch(text,/FOREIGN_PRIVATE|PRIVATE_LEDGER|dp_private/);
});

test("complete 10000-row loading uses twenty audit batches, preserving the export limit",async()=>{
 const f=await reportingFixture();const p=await f.seed({disputedAt:new Date()});
 const rows=Array.from({length:10000},(_,i)=>({...p,id:"p"+i}));let reads=0;
 f.db.payment.count=async()=>10000;f.db.payment.findMany=async q=>{assert.equal(q.take,10000);return rows;};
 f.db.auditLog.findMany=async q=>{reads++;assert.ok(q.where.AND[0].OR[0].targetId.in.length<=500);return [];};
 const result=await f.list("",true);assert.equal(result.payments.length,10000);assert.equal(reads,20);assert.equal(result.payments[0].disputeOutcome,"UNKNOWN");
});

test("administrator visits each payment once across more than two batches and keeps original period meanings",async()=>{
 const f=await reportingFixture(),now=new Date(),today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));let reads=0,auditReads=0;
 for(let i=0;i<1101;i++)await f.seed({id:String(i).padStart(5,"0"),status:i<500?"PAID":i<1000?"DISPUTED":"RETURNED",paymentMethod:"ACH",paidAt:today,returnedAt:today,disputedAt:i>=500&&i<1000?today:null});
 await f.seed({status:"RETURNED",paymentMethod:"CARD"});await f.seed({status:"PENDING"});
 const find=f.db.payment.findMany;f.db.payment.findMany=async q=>{reads++;assert.equal(q.take,500);return find(q);};
 f.db.auditLog.findMany=async()=>{auditReads++;return [];};
 const data=await f.load("lib/adminDashboard.ts").getAdminDashboardData();assert.equal(reads,3);assert.equal(auditReads,1);
 for(const period of ['today','month','allTime']){assert.equal(data.payments[period].count,500);assert.equal(data.payments[period].revenueCents,100000);assert.equal(data.issues.chargebacks[period].count,500);assert.equal(data.issues.achReturns[period].count,101);}
 assert.equal(data.payments.allTime.observedPlatformRevenueCents,null);assert.equal(data.payments.allTime.refundUnknownCount,500);
});

test("administrator uses one repeatable-read view even when live rows change between reads",async()=>{
 const f=await reportingFixture(),paid=await f.seed({paidAt:new Date(),customerRefunds:[{stripeRefundId:"r",currency:"usd",status:"succeeded",amountCents:100}]}),snapshot=structuredClone(paid);
 let transactions=0,paymentReads=0;const original=f.db.$transaction.bind(f.db);
 f.db.$transaction=async(fn,options)=>{transactions++;assert.equal(options.isolationLevel,"RepeatableRead");assert.equal(options.timeout,60000);return original(async tx=>{
  const view={...tx,payment:{findMany:async q=>{paymentReads++;assert.equal(q.take,500);await f.db.payment.update({where:{id:paid.id},data:{status:"DISPUTED",platformFeeCents:999999}});return [snapshot];}}};
  return fn(view);
 },options);};
 const data=await f.load("lib/adminDashboard.ts").getAdminDashboardData();assert.equal(transactions,1);assert.equal(paymentReads,1);
 for(const period of ['today','month','allTime']){assert.equal(data.payments[period].count,1);assert.equal(data.payments[period].revenueCents,200);assert.equal(data.payments[period].customerRefundCents,100);assert.equal(data.issues.chargebacks[period].count,0);}
});

test("administrator preserves null settlement dates, unknown observations and gross-versus-observed distinctions",async()=>{
 const f=await reportingFixture();await f.seed({paidAt:null});await f.seed({paidAt:new Date(),customerRefunds:[{stripeRefundId:"r",currency:"usd",status:"pending",amountCents:100}]});
 const data=await f.load("lib/adminDashboard.ts").getAdminDashboardData();assert.equal(data.payments.allTime.count,2);assert.equal(data.payments.today.count,1);assert.equal(data.payments.allTime.revenueCents,400);assert.equal(data.payments.allTime.customerRefundCents,0);assert.equal(data.payments.allTime.pendingCustomerRefundCents,100);assert.equal(data.payments.allTime.refundUnknownCount,1);assert.equal(data.payments.allTime.observedPlatformRevenueCents,null);assert.equal(data.payments.allTime.observedApplicationFeeRefundCents,null);
});

for(const surface of ['api','page'])test("administrator "+surface+" revalidates authority after report loading",async()=>{
 const f=await authHarness();await f.issue('ADMIN');let loads=0;
 f.mocks['@/lib/adminDashboard']={getAdminDashboardData:async()=>{loads++;await f.db.session.deleteMany({where:{adminAccessId:f.admins[0].id}});return {private:"PRIVATE_METRICS"};}};
 if(surface==='api'){const response=await f.load('app/api/admin/dashboard/route.ts').GET();assert.equal(response.status,401);assert.doesNotMatch(await response.text(),/PRIVATE_METRICS/);}
 else await assert.rejects(()=>f.load('app/admin/page.tsx').default(),/REDIRECT/);
 assert.equal(loads,1);
});

test("single report snapshot contains no provider or financial write operations; escaping remains intact",()=>{
 const source=readFileSync('lib/adminDashboard.ts','utf8');assert.doesNotMatch(source,/\.update\(|\.create\(|\.delete\(|from ["'](?:stripe|twilio)["']/);
 assert.match(source,/RepeatableRead/);assert.match(source,/take: 500/);
});
