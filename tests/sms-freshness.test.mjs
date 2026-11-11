import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import twilio from "twilio";
import {webhookFixture} from "./helpers/connected-webhook-harness.mjs";

const env={NEXT_PUBLIC_BASE_URL:"https://example.test",TWILIO_ACCOUNT_SID:"AC"+"1".repeat(32),TWILIO_AUTH_TOKEN:"synthetic",TWILIO_PHONE_NUMBER:"+13125550100"};
async function fixture(model="DIRECT",method="CARD"){
 const f=await webhookFixture("isolated",model,method,model==="DIRECT"?"CUSTOM_PAYMENT":"RECURRING_PLAN");
 f.mocks.twilio={default:Object.assign(()=>{throw Error("Real provider construction forbidden");},{validateRequest:twilio.validateRequest})};
 const at=new Date(),version=f.load("lib/smsConsent.ts").SMS_CONSENT_VERSION;
 await f.db.payment.update({where:{id:f.payment.id},data:{payerPhone:"+13125550101"}});
 await f.db.checkoutSession.update({where:{id:f.checkout.id},data:{phone:"+13125550101",smsConsentAt:at,smsConsentVersion:version}});
 await f.db.business.update({where:{id:f.business.id},data:{contactPhone:"+13125550102",paymentSmsEnabled:true,smsConsentPhone:"+13125550102",smsConsentAt:at,smsConsentVersion:version}});
 const event=async(type)=>{const e=f.event(type);assert.equal((await f.send(e)).status,200);return e;};
 f.settle();await event();
 const delivery=f.load("lib/smsDelivery.ts"),sends=[];
 const provider={create:async x=>{sends.push(x);return {sid:"SM"+randomUUID().replaceAll("-","")};}};
 const rows=()=>f.db.smsNotification.findMany({where:{paymentId:f.payment.id}});
 const run=(id,p=provider,db=f.db)=>delivery.dispatchPaymentSms(db,p,id,env);
 const refund=async(status,amountCents=100,id=randomUUID())=>f.db.customerRefundObservation.create({data:{paymentId:f.payment.id,stripeRefundId:id,currency:"usd",amountCents,status}});
 const dispute=async(statuses)=>{
  await f.db.payment.update({where:{id:f.payment.id},data:{disputedAt:new Date()}});
  for(const status of statuses)await f.db.auditLog.create({data:{businessId:f.business.id,actorType:"STRIPE_WEBHOOK",targetType:"PAYMENT",targetId:f.payment.id,metadata:{reportingDisputeOutcome:status==="won"?"WON":status==="lost"?"LOST":"ACTIVE",reportingDisputes:[{id:"dp_same",status}]}}});
 };
 return {...f,event,delivery,sends,provider,rows,run,refund,observeDispute:dispute};
}

for(const model of ["DIRECT","LEGACY_DESTINATION"])for(const method of ["CARD","ACH"]){
 for(const [name,prepare,suppressed] of [
  ["unchanged success",async()=>{},false],
  ["full refund",f=>f.refund("succeeded",f.payment.totalChargedCents),true],
  ["partial refund",f=>f.refund("succeeded"),true],
  ["multiple partial refunds",async f=>{await f.refund("succeeded",100);await f.refund("succeeded",200);},true],
  ["pending refund",f=>f.refund("pending"),true],
  ["requires-action refund",f=>f.refund("requires_action"),true],
  ["failed refund",f=>f.refund("failed"),false],
  ["canceled refund",f=>f.refund("canceled"),false],
  ["invalid refund evidence",f=>f.refund("succeeded",f.payment.totalChargedCents+1),true],
  ["active dispute with original PAID enum",f=>f.observeDispute(["under_review"]),true],
  ["lost then stale active dispute",f=>f.observeDispute(["lost","under_review","lost"]),true],
  ["won then stale active dispute",f=>f.observeDispute(["won","under_review","won"]),false],
  ["unknown historical dispute",f=>f.db.payment.update({where:{id:f.payment.id},data:{disputedAt:new Date()}}),true],
 ])test(model+" "+method+": "+name+" applies equally to both recipients",async()=>{
  const f=await fixture(model,method);await prepare(f);
  const before=await f.current(),queued=await f.rows();assert.equal(queued.length,2);
  for(const n of queued){assert.equal((await f.run(n.id)).status,suppressed?"SKIPPED":"SENT");}
  const after=await f.rows();assert.equal(after.length,2);assert.equal(f.sends.length,suppressed?0:2);
  for(let i=0;i<after.length;i++){assert.equal(after[i].status,suppressed?"SUPPRESSED":"SENT");assert.equal(after[i].body,queued[i].body);assert.equal(after[i].transitionKey,queued[i].transitionKey);assert.equal(after[i].recipientType,queued[i].recipientType);}
  for(const n of after)await f.run(n.id);assert.equal(f.sends.length,suppressed?0:2);
  assert.deepEqual(await f.current(),before);
 });
}

for(const state of ["RETURNED","FAILED","DISPUTED"])test("queued success suppressed after "+state,async()=>{
 const f=await fixture("LEGACY_DESTINATION",state==="RETURNED"?"ACH":"CARD");
 await f.db.payment.update({where:{id:f.payment.id},data:{status:state}});
 for(const n of await f.rows())await f.run(n.id);
 assert.equal(f.sends.length,0);assert.ok((await f.rows()).every(n=>n.reasonCode==="SUPERSEDED_PAYMENT_STATE"));
});

for(const terminal of ["lost","won"])test("queued active-dispute wording suppressed after dispute closed "+terminal+" without replacement",async()=>{
 const f=await fixture();f.dispute("fraudulent");
 await f.event("charge.dispute.created");
 const queued=(await f.rows()).filter(n=>n.paymentState==="DISPUTED");assert.equal(queued.length,2);
 f.live.disputes[0].status=terminal;if(terminal==="won")f.intent.latest_charge.disputed=false;
 const e=await f.event(terminal==="won"?"charge.dispute.funds_reinstated":"charge.dispute.closed");
 assert.equal((await f.send(e)).status,200);const before=await f.rows(),payment=await f.current();
 for(const n of queued)await f.run(n.id);
 const after=await f.rows();assert.equal(after.length,before.length);assert.equal(f.sends.length,0);
 assert.ok(queued.every(n=>after.find(r=>r.id===n.id).status==="SUPPRESSED"));assert.deepEqual(await f.current(),payment);
});

test("same DISPUTED enum: active wording remains valid, closed lost/won and unknown suppress",async()=>{
 for(const outcome of ["under_review","lost","won",null]){
  const f=await fixture();await f.db.payment.update({where:{id:f.payment.id},data:{status:"DISPUTED",disputedAt:new Date()}});
  if(outcome)await f.observeDispute([outcome]);
  const n=(await f.rows())[0];await f.db.smsNotification.update({where:{id:n.id},data:{paymentState:"DISPUTED",eventType:"FAILED",body:"Original payment is disputed. Reply STOP to opt out."}});
  const before=await f.current();await f.run(n.id);
  assert.equal(f.sends.length,outcome==="under_review"?1:0);assert.deepEqual(await f.current(),before);
 }
});

test("delivered/ambiguous reservations never reenter dispatch after refunds",async()=>{
 const f=await fixture();const [delivered,ambiguous]=await f.rows();
 await f.db.smsNotification.update({where:{id:delivered.id},data:{status:"DELIVERED",providerMessageId:"SM"+"a".repeat(32),deliveredAt:new Date()}});
 await f.run(ambiguous.id,{create:async()=>{throw Error("ambiguous acceptance private-marker");}});
 await f.refund("succeeded");const before=await f.rows();
 for(const n of before)await f.run(n.id);assert.deepEqual(await f.rows(),before);assert.equal(f.sends.length,0);
});

test("concurrent claims reserve once and create no replacement notifications",async()=>{
 const f=await fixture();await f.refund("succeeded");const before=await f.rows(),n=before[0];
 await Promise.all(Array.from({length:8},()=>f.run(n.id)));
 const after=await f.rows();assert.equal(after.length,before.length);assert.equal(after.find(r=>r.id===n.id).attempts,1);assert.equal(f.sends.length,0);
});

test("missing observation storage fails closed with existing bounded safe retry",async()=>{
 const f=await fixture(),n=(await f.rows())[0];
 const db=new Proxy(f.db,{get(t,k){if(k==="$transaction")return(fn,o)=>t.$transaction(tx=>fn(new Proxy(tx,{get(a,b){if(b==="customerRefundObservation")return {findMany:async()=>{throw Error("private-storage-marker");}};return a[b];}})),o);return t[k];}});
 await f.run(n.id,f.provider,db);const row=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal(row.status,"QUEUED");assert.equal(row.reasonCode,"SAFE_RETRY_PENDING");assert.equal(f.sends.length,0);
});

for(const guard of ["CONSENT_CHANGED","OPTED_OUT","MANAGEMENT_DISABLED_OR_UNCONSENTED"])test("freshness preserves "+guard+" before any send",async()=>{
 const f=await fixture();const recipient=guard==="MANAGEMENT_DISABLED_OR_UNCONSENTED"?"MANAGEMENT":"TENANT",n=(await f.rows()).find(n=>n.recipientType===recipient);
 if(guard==="CONSENT_CHANGED")await f.db.checkoutSession.update({where:{id:f.checkout.id},data:{smsConsentAt:null}});
 if(guard==="OPTED_OUT")await f.db.smsSuppression.upsert({where:{phoneHash:n.phoneHash},create:{phoneHash:n.phoneHash,reasonCode:"RECIPIENT_STOP"},update:{}});
 if(guard==="MANAGEMENT_DISABLED_OR_UNCONSENTED")await f.db.business.update({where:{id:f.business.id},data:{paymentSmsEnabled:false}});
 await f.run(n.id);const row=await f.db.smsNotification.findUnique({where:{id:n.id}});assert.equal(row.status,"SUPPRESSED");assert.equal(row.reasonCode,guard);assert.equal(f.sends.length,0);
});

for(const state of ["PENDING","FAILED","RETURNED"])test("accurate current "+state+" wording remains sendable",async()=>{
 const f=await fixture("DIRECT","ACH");await f.db.payment.update({where:{id:f.payment.id},data:{status:state}});
 const payment=await f.current();
 for(const n of await f.rows())await f.db.smsNotification.update({where:{id:n.id},data:{paymentState:state,eventType:state==="PENDING"?"PENDING":"FAILED",body:f.load("lib/smsNotifications.ts").paymentSmsBody(payment,state,n.recipientType)}});
 for(const n of await f.rows())await f.run(n.id);
 assert.equal(f.sends.length,2);assert.deepEqual(await f.current(),payment);
});

test("freshness reads run after the Payment lock and a refund committed before that lock is seen",async()=>{
 const f=await fixture(),n=(await f.rows())[0];let locked=false,reads=0;
 const db=new Proxy(f.db,{get(t,k){if(k==="$transaction")return(fn,o)=>t.$transaction(tx=>fn(new Proxy(tx,{get(a,b){
  if(b==="$queryRaw")return async q=>{if(/FROM "Payment"/.test(q.sql)){await f.refund("succeeded");locked=true;}return a.$queryRaw(q);};
  if(b==="customerRefundObservation")return new Proxy(a[b],{get(m,op){if(op==="findMany")return async q=>{assert.equal(locked,true);assert.equal(q.where.paymentId,f.payment.id);reads++;return m.findMany(q);};return m[op];}});
  return a[b];
 }})),o);return t[k];}});
 await f.run(n.id,f.provider,db);assert.equal(reads,1);assert.equal(f.sends.length,0);assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).status,"SUPPRESSED");
});
