import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness, postgres } from '../helpers/checkout-harness.mjs';
import { webhookFixture } from '../helpers/connected-webhook-harness.mjs';
import { reconciliationFixture } from '../helpers/reconciliation-harness.mjs';
import { reportingFixture } from '../helpers/reporting-harness.mjs';
assert.ok(postgres, 'Verified PostgreSQL configuration required');
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),get resolve(){return resolve;}};};
async function blockedBy(pattern,pid){
 const until=Date.now()+5000;
 while(Date.now()<until){
  const rows=await postgres.$queryRawUnsafe("SELECT query,pg_blocking_pids(pid) blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
  if(rows.some(r=>pattern.test(r.query)&&r.blockers.includes(pid)))return;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.fail('Expected exact PostgreSQL blocker was not observed');
}
const env={NEXT_PUBLIC_BASE_URL:'https://example.test',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic',TWILIO_PHONE_NUMBER:'+13125550100'};
let phoneSequence=2000;
async function smsFixture(){
 const f=await webhookFixture('postgres','DIRECT','CARD');
 f.settle();assert.equal((await f.send(f.event())).status,200);
 f.mocks.twilio={default:()=>{throw Error('Provider construction forbidden');}};
 const at=new Date(),version=f.load('lib/smsConsent.ts').SMS_CONSENT_VERSION;
 const phone='+1312555'+String(++phoneSequence);
 await f.db.payment.update({where:{id:f.payment.id},data:{payerPhone:phone}});
 await f.db.checkoutSession.update({where:{id:f.checkout.id},data:{phone,smsConsentAt:at,smsConsentVersion:version}});
 await f.db.business.update({where:{id:f.business.id},data:{contactPhone:phone,paymentSmsEnabled:true,smsConsentPhone:phone,smsConsentAt:at,smsConsentVersion:version}});
 const delivery=f.load('lib/smsDelivery.ts'),phoneHash=f.load('lib/smsNotifications.ts').smsPhoneHash(phone);
 // Intended-due synthetic messages use a fixed past time; explicit overrides win.
 const create=(recipientType='MANAGEMENT',patch={})=>f.db.smsNotification.create({data:{nextAttemptAt:new Date(0),paymentId:f.payment.id,recipientType,eventType:'SUCCESSFUL',paymentState:'PAID',transitionKey:randomUUID(),phone,phoneHash,body:'Synthetic verification',consentVersion:version,consentAt:at,callbackToken:randomUUID(),...patch}});
 let sends=0;
 const provider={create:async()=>{sends++;return {sid:'SM'+randomUUID().replaceAll('-','')};}};
 return {...f,delivery,create,provider,getSends:()=>sends,dispatch:(id,p=provider)=>delivery.dispatchPaymentSms(f.db,p,id,env)};
}
function refundData(p,amount=100,status='succeeded'){
 return {paymentId:p.id,stripeRefundId:'re_'+randomUUID().replaceAll('-',''),stripePlatformAccountId:p.stripePlatformAccountId,stripeAccountId:p.stripeConnectedAccountId,stripeMode:'test',chargeModel:p.chargeModel,pricingVersion:p.pricingVersion,stripeChargeId:p.stripeChargeId,stripePaymentIntentId:p.stripePaymentIntentId,amountCents:amount,currency:'usd',status,stripeCreatedAt:new Date()};
}
test('PG parallel Checkout reservations preserve one original payment/session',async()=>{
 const f=await harness('CARD','postgres'),q=await f.prepare();
 const responses=await Promise.all(Array.from({length:6},()=>f.start(q)));
 assert.ok(responses.every(r=>[200,409].includes(r.status)));
 const payments=await f.payments();assert.equal(payments.length,1);
 assert.equal(f.live.keys.size,1);assert.equal(f.live.sessions.size,1);
 assert.equal(payments[0].totalChargedCents,q.totalCents);
 assert.deepEqual(payments[0].lineItemsSnapshot,q.lineItems);
 assert.equal((await f.db.checkoutSession.findUnique({where:{id:q.id}})).paymentId,payments[0].id);
});
for(const model of ['DIRECT','LEGACY_DESTINATION'])test('PG '+model+' concurrent duplicate webhook has one durable payment outcome',async()=>{
 const f=await webhookFixture('postgres',model,'CARD');f.settle();const e=f.event();
 const responses=await Promise.all([f.send(e),f.send(e)]);
 assert.ok(responses.every(r=>r.status===200));
 assert.equal((await f.send(e)).status,200);
 assert.equal((await f.current()).status,'PAID');
 const rows=await f.db.auditLog.findMany({where:{actorType:'STRIPE_WEBHOOK',metadata:{path:['stripeEventId'],equals:e.id}}});
 assert.equal(rows.length,1);assert.equal(await f.db.payment.count({where:{checkoutAttemptId:f.checkout.id}}),1);
 assert.equal((await f.current()).totalChargedCents,f.payment.totalChargedCents);
});
test('PG refund observations are durable, duplicate-safe and terminal under stale events',async()=>{
 const f=await reconciliationFixture('postgres',20,'CARD','DIRECT'),original=await f.current();
 const r={id:'re_'+randomUUID().replaceAll('-',''),object:'refund',charge:f.charge.id,payment_intent:f.intent.id,currency:'usd',amount:100,status:'pending',created:Math.floor(Date.now()/1000)};
 f.stripe.refunds={list:async()=>({data:[structuredClone(r)],has_more:false}),create:()=>{throw Error('Refund execution forbidden');}};
 const event=f.event('refund.updated',{data:{object:structuredClone(r)}});
 assert.equal((await f.send(event)).status,200);
 r.status='succeeded';f.charge.amount_refunded=100;
 const terminal=f.event('refund.updated',{data:{object:structuredClone(r)}});
 assert.ok((await Promise.all([f.send(terminal),f.send(terminal)])).every(r=>r.status===200));
 assert.equal((await f.send(event)).status,200);
 const rows=await f.db.customerRefundObservation.findMany({where:{paymentId:f.payment.id}});
 assert.equal(rows.length,1);assert.equal(rows[0].status,'succeeded');assert.equal(rows[0].amountCents,100);
 assert.deepEqual(await f.current(),original);assert.equal(f.financial.creates.length,0);
 assert.equal(await f.db.auditLog.count({where:{actorType:'STRIPE_WEBHOOK',metadata:{path:['stripeEventId'],equals:terminal.id}}}),1);
});
test('SMS fixture default is already due and reaches the real atomic claim',async()=>{
 const f=await smsFixture(),n=await f.create();
 assert.equal(n.nextAttemptAt.getTime(),0);assert.ok(n.nextAttemptAt.getTime()<Date.now());
 assert.equal(n.status,'QUEUED');assert.equal(n.attempts,0);assert.equal(n.claimedAt,null);
 assert.equal((await f.dispatch(n.id)).status,'SENT');
 const row=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal(row.status,'SENT');assert.equal(row.attempts,1);assert.equal(f.getSends(),1);
});
test('SMS fixture preserves exact past timestamp overrides',async()=>{
 const f=await smsFixture(),due=new Date('2001-02-03T04:05:06.789Z'),n=await f.create('TENANT',{nextAttemptAt:due});
 assert.equal(n.nextAttemptAt.getTime(),due.getTime());
 assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).nextAttemptAt.getTime(),due.getTime());
 await f.dispatch(n.id);assert.equal(f.getSends(),1);
});
test('SMS fixture future override remains unclaimed with no provider invocation',async()=>{
 const f=await smsFixture(),due=new Date('2099-01-02T03:04:05.678Z'),n=await f.create('TENANT',{nextAttemptAt:due});
 assert.equal(n.nextAttemptAt.getTime(),due.getTime());
 const before=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.ok(due.getTime()>Date.now());assert.equal((await f.dispatch(n.id)).status,'SKIPPED');
 assert.deepEqual(await f.db.smsNotification.findUnique({where:{id:n.id}}),before);assert.equal(f.getSends(),0);
});
test('SMS fixture retry-delay override preserves attempts and remains ineligible',async()=>{
 const f=await smsFixture(),due=new Date('2099-02-03T04:05:06.789Z');
 const n=await f.create('MANAGEMENT',{nextAttemptAt:due,attempts:2,reasonCode:'SAFE_RETRY_PENDING'});
 const before=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal(n.nextAttemptAt.getTime(),due.getTime());assert.equal(n.attempts,2);
 await Promise.all([f.dispatch(n.id),f.dispatch(n.id)]);
 assert.deepEqual(await f.db.smsNotification.findUnique({where:{id:n.id}}),before);assert.equal(f.getSends(),0);
});
test('SMS fixture active lease cannot be reclaimed despite past due timestamp',async()=>{
 const f=await smsFixture(),now=new Date(),n=await f.create('MANAGEMENT',{status:'SENDING',attempts:1,claimedAt:now});
 const before=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal((await f.delivery.recoverInterruptedSms(f.db,now)).count,0);
 await Promise.all([f.dispatch(n.id),f.dispatch(n.id)]);
 assert.deepEqual(await f.db.smsNotification.findUnique({where:{id:n.id}}),before);assert.equal(f.getSends(),0);
});
test('SMS fixture expired lease becomes ambiguous without requeue or resend',async()=>{
 const f=await smsFixture(),now=new Date(),n=await f.create('TENANT',{status:'SENDING',attempts:1,claimedAt:new Date(now.getTime()-120001)});
 assert.equal((await f.delivery.recoverInterruptedSms(f.db,now)).count,1);
 const row=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal(row.status,'AMBIGUOUS');assert.equal(row.reasonCode,'WORKER_INTERRUPTED');assert.equal(row.attempts,1);
 await f.dispatch(n.id);assert.deepEqual(await f.db.smsNotification.findUnique({where:{id:n.id}}),row);assert.equal(f.getSends(),0);
});
test('SMS fixture exact lease boundary is not expired',async()=>{
 const f=await smsFixture(),now=new Date(),n=await f.create('TENANT',{status:'SENDING',attempts:1,claimedAt:new Date(now.getTime()-120000)});
 const before=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal((await f.delivery.recoverInterruptedSms(f.db,now)).count,0);
 await f.dispatch(n.id);assert.deepEqual(await f.db.smsNotification.findUnique({where:{id:n.id}}),before);assert.equal(f.getSends(),0);
});
test('SMS fixture suppressed status cannot be claimed by making it due',async()=>{
 const f=await smsFixture(),n=await f.create('TENANT',{status:'SUPPRESSED',reasonCode:'OPTED_OUT'});
 const before=await f.db.smsNotification.findUnique({where:{id:n.id}});
 await f.dispatch(n.id);assert.deepEqual(await f.db.smsNotification.findUnique({where:{id:n.id}}),before);assert.equal(f.getSends(),0);
});
test('SMS fixture persistent STOP still suppresses an already-due claim',async()=>{
 const f=await smsFixture(),n=await f.create('TENANT');
 await f.db.smsSuppression.create({data:{phoneHash:n.phoneHash,reasonCode:'INBOUND_STOP'}});
 await f.dispatch(n.id);const row=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal(row.status,'SUPPRESSED');assert.equal(row.reasonCode,'OPTED_OUT');assert.equal(row.attempts,1);assert.equal(f.getSends(),0);
});

test('PG competing SMS claims send once and preserve payment facts',async()=>{
 const f=await smsFixture(),n=await f.create(),before=await f.current();
 await Promise.all(Array.from({length:5},()=>f.dispatch(n.id)));
 assert.equal(f.getSends(),1);
 const row=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal(row.status,'SENT');assert.equal(row.attempts,1);
 await f.dispatch(n.id);assert.equal(f.getSends(),1);assert.deepEqual(await f.current(),before);
});
for(const kind of ['partial-refund','full-refund','pending-refund','active-dispute','lost-dispute'])test('PG Payment-lock freshness after '+kind+' suppresses queued success',async()=>{
 const f=await smsFixture(),p=await f.current(),n=await f.create('TENANT'),held=deferred(),release=deferred();let pid;
 const writer=f.db.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id"=$1 FOR UPDATE',p.id);
  pid=(await tx.$queryRawUnsafe('SELECT pg_backend_pid() pid'))[0].pid;held.resolve();await release.promise;
  if(kind.endsWith('refund'))await tx.customerRefundObservation.create({data:refundData(p,kind==='full-refund'?p.totalChargedCents:100,kind==='pending-refund'?'pending':'succeeded')});
  else{
   await tx.payment.update({where:{id:p.id},data:{disputedAt:new Date()}});
   await tx.auditLog.create({data:{businessId:p.businessId,actorType:'STRIPE_WEBHOOK',action:'SYNTHETIC_DISPUTE_OBSERVED',targetType:'PAYMENT',targetId:p.id,metadata:{reportingDisputeOutcome:kind==='lost-dispute'?'LOST':'ACTIVE',reportingDisputes:[{id:'dp_synthetic',status:kind==='lost-dispute'?'lost':'under_review'}]}}});
  }
 },{timeout:15000});
 await held.promise;const send=f.dispatch(n.id);
 try{await blockedBy(/Payment.*FOR UPDATE/s,pid);assert.equal(f.getSends(),0);}finally{release.resolve();}
 await writer;await send;
 const row=await f.db.smsNotification.findUnique({where:{id:n.id}});
 assert.equal(row.status,'SUPPRESSED');assert.equal(row.reasonCode,kind.endsWith('refund')?'SUPERSEDED_REFUND_OUTCOME':'SUPERSEDED_DISPUTE_OUTCOME');assert.equal(f.getSends(),0);
 const after=await f.current();assert.equal(after.totalChargedCents,p.totalChargedCents);assert.deepEqual(after.lineItemsSnapshot,p.lineItemsSnapshot);
});
test('PG SMS safe retry remains bounded and respects due time',async()=>{
 const f=await smsFixture(),n=await f.create();let calls=0;
 const provider={create:async()=>{calls++;throw Object.assign(Error('Synthetic rate limit'),{status:429});}};
 for(let attempt=1;attempt<=3;attempt++){
  await f.dispatch(n.id,provider);
  const row=await f.db.smsNotification.findUnique({where:{id:n.id}});assert.equal(row.attempts,attempt);
  assert.equal(row.status,attempt<3?'QUEUED':'FAILED');
  await f.dispatch(n.id,provider);assert.equal(calls,attempt);
  if(attempt<3)await f.db.smsNotification.update({where:{id:n.id},data:{nextAttemptAt:new Date(0)}});
 }
 assert.equal(calls,3);
});
test('PG ambiguous send and interrupted lease never create an automatic resend',async()=>{
 const f=await smsFixture(),n=await f.create();let calls=0;
 const provider={create:async()=>{calls++;throw Error('Synthetic uncertain acceptance');}};
 await f.dispatch(n.id,provider);await f.dispatch(n.id,provider);
 assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).status,'AMBIGUOUS');assert.equal(calls,1);
 const interrupted=await f.create('TENANT',{status:'SENDING',attempts:1,claimedAt:new Date(Date.now()-180000)});
 await f.delivery.recoverInterruptedSms(f.db);
 assert.equal((await f.db.smsNotification.findUnique({where:{id:interrupted.id}})).status,'AMBIGUOUS');
 await f.dispatch(interrupted.id,provider);assert.equal(calls,1);
});
test('PG tenant without consent is suppressed before provider access',async()=>{
 const f=await smsFixture(),n=await f.create('TENANT',{consentAt:null});
 await f.dispatch(n.id);
 assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).reasonCode,'CONSENT_ABSENT');
 assert.equal(f.getSends(),0);
});
test('PG management opt-out remains authoritative',async()=>{
 const f=await smsFixture(),n=await f.create();
 await f.db.business.update({where:{id:f.business.id},data:{paymentSmsEnabled:false}});
 await f.dispatch(n.id);
 assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).reasonCode,'MANAGEMENT_DISABLED_OR_UNCONSENTED');
 assert.equal(f.getSends(),0);
});
test('PG concurrent STOP lock suppresses a claimed message before sending',async()=>{
 const f=await smsFixture(),n=await f.create(),held=deferred(),release=deferred();let pid;
 const stop=f.db.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text','sms:'+n.phoneHash);
  pid=(await tx.$queryRawUnsafe('SELECT pg_backend_pid() pid'))[0].pid;held.resolve();await release.promise;
  await f.delivery.suppressPhone(tx,n.phone,'INBOUND_STOP');
 },{timeout:15000});
 await held.promise;const send=f.dispatch(n.id);
 try{await blockedBy(/pg_advisory_xact_lock/,pid);assert.equal(f.getSends(),0);}finally{release.resolve();}
 await stop;await send;
 assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).reasonCode,'OPTED_OUT');
 assert.equal(f.getSends(),0);
});
test('PG failed refund leaves accurate success notification eligible',async()=>{
 const f=await smsFixture(),p=await f.current(),n=await f.create();
 await f.db.customerRefundObservation.create({data:refundData(p,100,'failed')});
 await f.dispatch(n.id);
 assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).status,'SENT');
 assert.equal(f.getSends(),1);
});
test('PG terminal won dispute defeats a stale active observation in dispatch projection',async()=>{
 const f=await smsFixture(),p=await f.current(),n=await f.create();
 await f.db.payment.update({where:{id:p.id},data:{disputedAt:new Date()}});
 for(const [status,outcome] of [['won','WON'],['under_review','ACTIVE']])
  await f.db.auditLog.create({data:{businessId:p.businessId,actorType:'STRIPE_WEBHOOK',action:'SYNTHETIC_DISPUTE_OBSERVED',targetType:'PAYMENT',targetId:p.id,metadata:{reportingDisputeOutcome:outcome,reportingDisputes:[{id:'dp_terminal',status}]}}});
 await f.dispatch(n.id);
 assert.equal((await f.db.smsNotification.findUnique({where:{id:n.id}})).status,'SENT');assert.equal(f.getSends(),1);
});
test('PG reporting is scoped, paginated, unknown-aware and consistent with administrator counts',async()=>{
 const f=await reportingFixture('postgres'),first=await f.seed(),unknown=await f.seed();
 const copies=Array.from({length:999},(_,i)=>{
  const id=randomUUID();
  return {...first,id,stripePlatformAccountId:'acct_platform',stripeMode:'test',stripeChargeId:'ch_synthetic_'+id,stripePaymentIntentId:'pi_synthetic_'+id,disputedAt:i<600?new Date():null};
 });
 await f.db.payment.createMany({data:copies});
 for(const [i,amount,status] of [[0,first.totalChargedCents,'succeeded'],[1,100,'succeeded'],[2,100,'pending'],[3,100,'failed'],[4,100,'succeeded'],[4,200,'succeeded']])
  await f.db.customerRefundObservation.create({data:{...refundData(copies[i],amount,status),stripeAccountId:'acct_platform'}});
 const foreign=await f.seed({businessId:f.businesses[1].id,payerFirstName:'ForeignSynthetic'});
 await f.db.payment.update({where:{id:first.id},data:{disputedAt:new Date()}});
 const journal={actorType:'STRIPE_WEBHOOK',action:'SYNTHETIC_DISPUTE_OBSERVED',targetType:'PAYMENT',targetId:first.id};
 await f.db.auditLog.create({data:{...journal,businessId:first.businessId,metadata:{reportingDisputeOutcome:'ACTIVE',reportingDisputes:[{id:'dp_scope',status:'under_review'}]}}});
 await f.db.auditLog.create({data:{...journal,businessId:foreign.businessId,metadata:{reportingDisputeOutcome:'LOST',reportingDisputes:[{id:'dp_scope',status:'lost'}]}}});
 const beforeReport=await f.db.payment.findUnique({where:{id:first.id}});
 const started=performance.now(),page=await f.list(),all=await f.list('',true),elapsedMs=performance.now()-started;
 assert.equal(page.total,1001);assert.equal(page.payments.length,50);assert.equal(all.payments.length,1001);
 assert.ok(all.payments.every(p=>p.id!==foreign.id));
 assert.equal(all.payments.find(p=>p.id===first.id).disputeOutcome,'ACTIVE');
 assert.equal(all.payments.find(p=>p.id===unknown.id).verifiedProcessorFeeCents,null);
 assert.equal(all.payments.find(p=>p.id===unknown.id).customerRefundCents,null);
 for(const [i,state] of [[0,'FULL'],[1,'PARTIAL'],[2,'PENDING'],[3,'FAILED'],[4,'PARTIAL']])
  assert.equal(all.payments.find(p=>p.id===copies[i].id).refundState,state);
 assert.equal(all.payments.find(p=>p.id===copies[4].id).customerRefundCents,300);
 const scoped=await f.db.payment.findMany({where:{businessId:f.business.id},select:{id:true,businessId:true,disputedAt:true}});
 const queries=[],outcomes=await f.load('lib/paymentReportingOutcome.ts').loadReportingDisputeOutcomes({auditLog:{findMany:args=>{queries.push(args);return f.db.auditLog.findMany(args);}}},scoped);
 assert.equal(queries.length,2);assert.equal(outcomes.get(first.id),'ACTIVE');
 for(const query of queries)for(const owner of query.where.AND[0].OR){
  assert.equal(owner.businessId,f.business.id);assert.ok(owner.targetId.in.length<=500);
  assert.ok(owner.targetId.in.every(id=>scoped.some(p=>p.id===id)));
 }
 const admin=await f.load('lib/adminDashboard.ts').getAdminDashboardData();
 assert.equal(admin.payments.allTime.count,await f.db.payment.count({where:{status:'PAID'}}));
 assert.ok(admin.payments.allTime.refundUnknownCount>0);
 const csv=await f.endpoint('');assert.equal(csv.status,200);assert.match(csv.headers.get('cache-control'),/no-store/);
 assert.doesNotMatch(await csv.text(),/ForeignSynthetic/);
 const observations=await f.db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const queries=[
   ['payment-page','EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT "id" FROM "Payment" WHERE "businessId"=$1 ORDER BY "createdAt" DESC,"id" DESC LIMIT 50',[f.business.id]],
   ['scoped-disputes','EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT "targetId" FROM "AuditLog" WHERE "businessId"=$1 AND "targetType"=\'PAYMENT\' AND "targetId"=$2 ORDER BY "createdAt" DESC,"id" DESC',[f.business.id,first.id]],
   ['due-sms','EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT "id" FROM "SmsNotification" WHERE "status"=\'QUEUED\' AND "nextAttemptAt"<=CURRENT_TIMESTAMP ORDER BY "nextAttemptAt" LIMIT 20',[]],
  ];
  const rows=[];
  for(const [name,sql,params] of queries){
   const result=await tx.$queryRawUnsafe(sql,...params),plan=result[0]['QUERY PLAN'][0];
   rows.push({name,planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],plan:plan.Plan});
  }
  return rows;
 });
 assert.deepEqual(await f.db.payment.findUnique({where:{id:first.id}}),beforeReport);
 console.log('S7_QUERY_OBSERVATION '+JSON.stringify({syntheticBusinessRows:1001,disputedInputs:scoped.filter(p=>p.disputedAt).length,disputeBatchQueries:queries.length,reportPairElapsedMs:elapsedMs,observations}));
 await f.db.payment.createMany({data:Array.from({length:9000},()=>({...first,id:randomUUID()}))});
 assert.equal(await f.db.payment.count({where:{businessId:f.business.id}}),10001);
 assert.equal((await f.endpoint('')).status,413);assert.equal((await f.endpoint('format=print')).status,413);
 assert.deepEqual(await f.db.payment.findUnique({where:{id:first.id}}),beforeReport);
});
