import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reportingFixture } from "./helpers/reporting-harness.mjs";
import { webhookFixture } from "./helpers/connected-webhook-harness.mjs";
import twilio from "twilio";

const h = await reportingFixture();
const reporting = h.load("lib/smsDeliveryReporting.ts");
const { projectSmsDelivery, smsReceiptMessage, loadSmsDeliveryMetrics, loadSmsWorkerReport, SMS_DELIVERY_STATES } = reporting;
for (const status of SMS_DELIVERY_STATES) test("pure outbox projection: " + status, () => {
  for (const recipientType of ["TENANT", "MANAGEMENT"]) {
    const input = { status, recipientType, phone: "private-phone", body: "private-body", callbackToken: "private-token", reasonCode: null };
    const before = structuredClone(input), report = projectSmsDelivery(input, { status: "SENT" });
    assert.deepEqual(report, { status, recipientType, source: "OUTBOX" });
    assert.deepEqual(input, before); assert.doesNotMatch(JSON.stringify(report), /private-/);
    if (["QUEUED", "SENDING", "SENT"].includes(status)) assert.doesNotMatch(smsReceiptMessage(report), /confirmed delivery/);
  }
});
test("suppression reason overrides callback FAILED and unknown records stay unknown", () => {
  assert.equal(projectSmsDelivery({ status: "FAILED", recipientType: "TENANT", reasonCode: "OPTED_OUT" }).status, "SUPPRESSED");
  assert.equal(projectSmsDelivery({ status: "future", recipientType: "future" }).status, "UNKNOWN");
  assert.equal(projectSmsDelivery().source, "UNKNOWN");
  assert.equal(projectSmsDelivery(null, { status: "FAILED" }).status, "UNKNOWN");
  for (const status of ["QUEUED", "SENDING", "SENT"]) assert.equal(projectSmsDelivery(null, { status }).status, status);
});

function storage(notifications = [], receipts = []) {
  const queries = [], reads = [];
  const inPeriod = (r, q) => !q.where.updatedAt || r.updatedAt >= q.where.updatedAt.gte;
  function group(rows, by) {
    const map = new Map();
    for (const row of rows) {
      const fields = Object.fromEntries(by.map(k => [k, row[k] ?? null])), key = JSON.stringify(fields);
      if (!map.has(key)) map.set(key, { ...fields, _count: { _all: 0 } });
      map.get(key)._count._all++;
    }
    return [...map.values()];
  }
  const db = {
    smsNotification: {
      groupBy: async q => {
        queries.push(q);
        if(q.by.length===2){assert.deepEqual(q.by,["status","reasonCode"]);return group(notifications,q.by);}
        if(q.by.length===1){assert.deepEqual(q.by,["paymentId"]);assert.equal(q.where.recipientType,"TENANT");assert.equal(q.where.eventType,"SUCCESSFUL");return group(notifications.filter(n=>q.where.paymentId.in.includes(n.paymentId)&&n.recipientType==="TENANT"&&n.eventType==="SUCCESSFUL"),q.by);}
        assert.deepEqual(q.by, ["status", "recipientType", "reasonCode"]); return group(notifications.filter(r => inPeriod(r, q)), q.by);
      },
      aggregate: async q => {
        queries.push(q);
        const due=notifications.filter(n=>n.status===q.where.status&&(n.nextAttemptAt??n.createdAt)<=q.where.nextAttemptAt.lte);
        return {_count:{_all:due.length},_min:{createdAt:due.length?new Date(Math.min(...due.map(n=>+n.createdAt))):null}};
      },
      findMany: async q => { queries.push(q); return notifications.filter(n=>q.where.providerMessageId.in.includes(n.providerMessageId)&&n.recipientType===q.where.recipientType&&n.eventType===q.where.eventType); },
      findUnique: async q => { reads.push(q); return notifications.find(n => n.id === q.where.id) ?? null; },
      findFirst: async q => { reads.push(q); assert.equal(q.where.recipientType, "TENANT"); assert.equal(q.where.eventType, "SUCCESSFUL"); return notifications.filter(n => n.paymentId === q.where.paymentId && n.recipientType === "TENANT" && n.eventType === "SUCCESSFUL" && (!q.where.providerMessageId||n.providerMessageId===q.where.providerMessageId)).sort((a,b) => b.createdAt-a.createdAt || b.id.localeCompare(a.id))[0] ?? null; },
    },
    smsReceipt: {
      findMany: async q => { queries.push(q); assert.equal(q.take,500); assert.equal(q.select.providerMessageId,true); const sorted=[...receipts].sort((a,b)=>a.id.localeCompare(b.id)); const start=q.cursor?sorted.findIndex(r=>r.id===q.cursor.id)+q.skip:0; return sorted.slice(start,start+q.take); },
      findUnique: async q => { reads.push(q); return receipts.find(r => r.id === q.where.id) ?? null; },
    },
  };
  return { db, queries, reads };
}
const today = new Date("2026-11-05T00:00:00Z"), month = new Date("2026-11-01T00:00:00Z");
const row = (id, status, recipientType = "TENANT", patch = {}) => ({ id, paymentId: id, status, recipientType, eventType: "SUCCESSFUL", reasonCode: null, createdAt: today, updatedAt: today, ...patch });

test("admin counts every supported state by recipient and excludes only true legacy aliases across all periods", async () => {
  const notifications = SMS_DELIVERY_STATES.flatMap(status => [row("t"+status, status), row("m"+status, status,"MANAGEMENT")]);
  notifications.push(row("optout","FAILED","TENANT",{reasonCode:"OPTED_OUT"}), row("mgmtOnly","FAILED","MANAGEMENT"), row("pendingOnly","FAILED","TENANT",{eventType:"PENDING"}));
  const receipts = [
    {id:"alias",paymentId:"tFAILED",status:"FAILED",updatedAt:today},
    {id:"l1",paymentId:"mgmtOnly",status:"SENT",updatedAt:today},
    {id:"l2",paymentId:"pendingOnly",status:"FAILED",updatedAt:today},
    {id:"old",paymentId:"old",status:"SENT",updatedAt:new Date("2026-10-31T23:59:59Z")},
  ];
  const s=storage(notifications,receipts), before=structuredClone({notifications,receipts});
  const metrics=await loadSmsDeliveryMetrics(s.db,today,month);
  assert.equal(metrics.allTime.total.FAILED,4); assert.equal(metrics.allTime.tenant.FAILED,2); assert.equal(metrics.allTime.management.FAILED,2);
  assert.equal(metrics.allTime.total.SUPPRESSED,3); assert.equal(metrics.allTime.total.UNKNOWN,3);
  assert.equal(metrics.allTime.legacy.UNKNOWN,1); assert.equal(metrics.allTime.legacy.SENT,2);
  assert.equal(metrics.today.legacy.SENT,1); assert.equal(metrics.month.legacy.SENT,1);
  for(const p of Object.values(metrics)) for(const status of SMS_DELIVERY_STATES) assert.equal(p.total[status],p.tenant[status]+p.management[status]+p.legacy[status]+p.unknownRecipient[status]);
  assert.equal(s.queries.length,5); assert.deepEqual({notifications,receipts},before);
});

test("worker reports durable suppression, ambiguity and safe retries rather than legacy dispatch classifications; no aliases counted twice", async () => {
  const notifications=[row("n","AMBIGUOUS"),row("supp","SUPPRESSED","MANAGEMENT"),row("retry","QUEUED"),row("sent","SENT")];
  const receipts=[{id:"bridge",paymentId:"n",status:"FAILED"},{id:"legacy",paymentId:"legacy",status:"FAILED"}];
  const s=storage(notifications,receipts);
  const attempts=[{receiptId:"n",status:"FAILED"},{receiptId:"supp",status:"FAILED"},{receiptId:"retry",status:"SKIPPED"},{receiptId:"sent",status:"SENT"},{receiptId:"bridge",status:"SKIPPED"},{receiptId:"legacy",status:"SKIPPED"}];
  const result=await loadSmsWorkerReport(s.db,attempts);
  assert.equal(result.processed,5); assert.equal(result.ambiguous,1); assert.equal(result.suppressed,1); assert.equal(result.queued,1); assert.equal(result.sent,1); assert.equal(result.delivered,0); assert.equal(result.failed,0); assert.equal(result.unknown,1); assert.equal(result.skipped,3);
  assert.equal(result.statusBasis,"CURRENT_DURABLE_OUTCOME"); assert.equal(result.results.filter(r=>r.receiptId==="n").length,1);
  assert.equal(result.results.find(r=>r.receiptId==="supp").recipientType,"MANAGEMENT");
  assert.ok(s.reads.every(q=>!q.select.phone&&!q.select.body&&!q.select.callbackToken));
  assert.equal(result.processed,result.queued+result.sending+result.sent+result.delivered+result.failed+result.suppressed+result.ambiguous+result.unknown);
});

test("legacy message identity preserves a different historical send and deduplicates only matching tenant-success messages", async()=>{
  const notifications=[row("n","DELIVERED","TENANT",{paymentId:"p",providerMessageId:"SM_match"}),row("m","FAILED","MANAGEMENT",{paymentId:"other",providerMessageId:"SM_management"})];
  const receipts=[{id:"alias",paymentId:"p",status:"SENT",providerMessageId:"SM_match",updatedAt:today},{id:"distinct",paymentId:"p",status:"SENT",providerMessageId:"SM_old",updatedAt:today},{id:"other",paymentId:"other",status:"SENT",providerMessageId:"SM_management",updatedAt:today}];
  const s=storage(notifications,receipts), m=await loadSmsDeliveryMetrics(s.db,today,month);
  assert.equal(m.allTime.total.DELIVERED,1); assert.equal(m.allTime.legacy.SENT,2);
  const worker=await loadSmsWorkerReport(s.db,[{receiptId:"n",status:"SKIPPED"},...receipts.map(r=>({receiptId:r.id,status:"SKIPPED"}))]);
  assert.equal(worker.processed,3); assert.equal(worker.delivered,1); assert.equal(worker.sent,2);
  assert.doesNotMatch(JSON.stringify({worker,m}),/SM_match|SM_old|SM_management/);
});

test("legacy metrics scan more than one batch without losing or duplicating records",async()=>{
  const receipts=Array.from({length:501},(_,i)=>({id:String(i).padStart(4,"0"),paymentId:"p"+i,status:i===500?"FAILED":"SENT",updatedAt:today}));
  const s=storage([],receipts),m=await loadSmsDeliveryMetrics(s.db,today,month);
  assert.equal(m.allTime.legacy.SENT,500);assert.equal(m.allTime.legacy.UNKNOWN,1);
  assert.equal(s.queries.filter(q=>q.take===500).length,2);
});

test("worker summary distinguishes every durable state and preserves legacy acceptance without claiming delivery", async () => {
  const notifications=SMS_DELIVERY_STATES.map(status=>row(status,status));
  const s=storage(notifications,[{id:"legacy-sent",paymentId:"historical",status:"SENT"}]);
  const result=await loadSmsWorkerReport(s.db,[...notifications.map(n=>({receiptId:n.id,status:"SKIPPED"})),{receiptId:"legacy-sent",status:"SKIPPED"}]);
  assert.equal(result.processed,9); assert.equal(result.sent,2);
  for(const key of ["queued","sending","delivered","failed","suppressed","ambiguous","unknown"]) assert.equal(result[key],1);
  assert.deepEqual(result.results.find(r=>r.receiptId==="legacy-sent"),{receiptId:"legacy-sent",status:"SENT",recipientType:"TENANT",source:"LEGACY"});
});

test("admin financial consumer uses canonical failed counts while keeping financial calculations intact", async () => {
  const f=await reportingFixture(); await f.seed();
  const s=storage([row("management","FAILED","MANAGEMENT"),row("tenant","FAILED"),row("supp","FAILED","TENANT",{reasonCode:"OPTED_OUT"})],[{id:"legacy",paymentId:"tenant",status:"FAILED",updatedAt:today}]);
  f.db.smsNotification=s.db.smsNotification; f.db.smsReceipt=s.db.smsReceipt;
  const data=await f.load("lib/adminDashboard.ts").getAdminDashboardData();
  assert.equal(data.issues.smsFailed.allTime,2); assert.equal(data.issues.smsDelivery.allTime.management.FAILED,1);
  assert.equal(data.issues.smsDelivery.allTime.total.SUPPRESSED,1); assert.equal(data.payments.allTime.revenueCents,200);
});

test("worker endpoint authorizes before dispatch/reporting and returns only durable sanitized summaries", async () => {
  const f=await reportingFixture(), s=storage([row("n","AMBIGUOUS")]); let calls=0;
  f.db.smsNotification=s.db.smsNotification; f.db.smsReceipt=s.db.smsReceipt;
  f.mocks["@/lib/smsReceipts"]={processQueuedSmsReceipts:async limit=>{calls++;assert.equal(limit,20);return [{receiptId:"n",status:"FAILED",reason:"private-marker"}];}};
  // The harness supplies synthetic process.env to each module.
  const {authHarness}=await import("./helpers/auth-harness.mjs");
  const apiFixture=await authHarness("isolated",f.db,f.mocks,{CRON_SECRET:"synthetic-worker-secret"});
  const api=apiFixture.load("app/api/internal/sms/process/route.ts");
  assert.equal((await api.POST(new Request("https://example.test/api/internal/sms/process",{method:"POST"}))).status,401); assert.equal(calls,0);
  const response=await api.POST(new Request("https://example.test/api/internal/sms/process",{method:"POST",headers:{authorization:"Bearer synthetic-worker-secret"}}));
  const json=await response.json(); assert.equal(response.status,200); assert.equal(json.ambiguous,1); assert.equal(json.failed,0); assert.equal(calls,1); assert.doesNotMatch(JSON.stringify(json),/private-marker|synthetic-worker-secret/);
});

test("real signed callback observations agree with shared reporting and preserve delivery terminality without provider sends", async () => {
  const f=await webhookFixture("isolated","DIRECT","CARD");
  f.mocks.twilio={default:Object.assign(()=>{throw Error("No provider client permitted");},{validateRequest:twilio.validateRequest})};
  const delivery=f.load("lib/smsDelivery.ts"), report=f.load("lib/smsDeliveryReporting.ts");
  const env={NEXT_PUBLIC_BASE_URL:"https://example.test",TWILIO_ACCOUNT_SID:"AC"+"1".repeat(32),TWILIO_AUTH_TOKEN:"synthetic-signature",TWILIO_PHONE_NUMBER:"+13125550100"};
  const n=await f.db.smsNotification.create({data:{paymentId:f.payment.id,transitionKey:"synthetic",recipientType:"TENANT",eventType:"SUCCESSFUL",paymentState:"PAID",phone:"+13125550101",phoneHash:"synthetic",body:"private-body",callbackToken:"private-token",status:"SENT",providerMessageId:"SM"+"2".repeat(32)}});
  async function callback(status, extra={}) {
    const url=env.NEXT_PUBLIC_BASE_URL+"/api/twilio/status?notification="+n.id+"&token="+n.callbackToken;
    const params={AccountSid:env.TWILIO_ACCOUNT_SID,MessageSid:n.providerMessageId,MessageStatus:status,From:env.TWILIO_PHONE_NUMBER,To:n.phone,...extra};
    await delivery.applySmsStatus(f.db,new Request(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","x-twilio-signature":twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN,url,params)},body:new URLSearchParams(params)}),env);
  }
  const current=async()=>report.projectSmsDelivery(await f.db.smsNotification.findUnique({where:{id:n.id}}));
  async function assertSurfaces(status) {
    const stored=await f.db.smsNotification.findUnique({where:{id:n.id}});
    const metrics=await loadSmsDeliveryMetrics(storage([stored]).db,today,month);
    const worker=await report.loadSmsWorkerReport(f.db,[{receiptId:n.id,status:"FAILED"}]);
    assert.equal(metrics.allTime.total[status],1); assert.equal(worker.results[0].status,status);
    assert.equal((await current()).status,status);
  }
  await callback("undelivered"); assert.equal((await current()).status,"FAILED");
  await assertSurfaces("FAILED");
  await callback("sent"); assert.equal((await current()).status,"FAILED");
  await callback("delivered"); await callback("delivered"); await callback("failed"); assert.equal((await current()).status,"DELIVERED");
  await assertSurfaces("DELIVERED");
  assert.equal(f.calls.creates.length,0);
});

test("tenant receipt reads are scoped and select no recipient secrets; reporting imports no providers",()=>{
  const result=readFileSync("lib/paymentResult.ts","utf8"), helper=readFileSync("lib/smsDeliveryReporting.ts","utf8");
  assert.match(result,/smsNotifications: \{ where: TENANT_RECEIPT_NOTIFICATION/); assert.match(result,/take: 1, select: SMS_REPORT_SELECT/);
  assert.doesNotMatch(helper,/from ["'](?:twilio|stripe|@\/lib\/(?:smsDelivery|smsReceipts|prisma))["']/);
});
