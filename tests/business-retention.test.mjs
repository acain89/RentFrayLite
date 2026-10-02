import assert from 'node:assert/strict';
import test from 'node:test';
import {harness,postgres} from './helpers/checkout-harness.mjs';

async function admin(h) {
 const a=await h.db.adminAccess.create({data:{codeHash:'isolated-b6-admin-hash',isActive:true}});
 await h.load('lib/session.ts').createAdminSession(a.id,a.codeHash);
 return a;
}
const remove=h=>h.load('app/api/admin/businesses/[businessId]/route.ts').DELETE(new Request('https://example.test/api',{method:'DELETE'}),{params:Promise.resolve({businessId:h.business.id})});
const lookup=h=>h.db.business.findUnique({where:{id:h.business.id}});
const snapshot=async h=>({payments:await h.payments(),checkouts:await h.db.checkoutSession.findMany({where:{businessId:h.business.id}}),receipts:await h.db.smsReceipt.findMany({where:{paymentId:{in:(await h.payments()).map(p=>p.id)}}}),audits:await h.db.auditLog.findMany({where:{businessId:h.business.id}})});
const createSnapshot=h=>h.load('app/api/public/checkout/session/route.ts').POST(new Request('https://example.test/api',{method:'POST',body:JSON.stringify({accountCode:h.business.accountCode,planId:h.business.recurringPlans[0].id,unitNumber:'NEW',firstName:'Test',lastName:'Payer',phone:'5555551234',paymentMethod:'ACH'})}));

for(const backend of [...(postgres?['postgres']:[]),'isolated']) {
 const label=`${backend} B6`;
 test(`${label}: empty business hard-deletes; prior audits survive`,async()=>{
  const h=await harness('ACH',backend);await admin(h);
  const manager=await h.db.manager.create({data:{businessId:h.business.id,email:`empty-${h.business.id}@example.test`,passwordHash:'fixture'}});
  const audit=await h.db.auditLog.create({data:{businessId:h.business.id,actorType:'ADMIN',action:'BUSINESS_CREATED',targetType:'Business',targetId:h.business.id}});
  const response=await remove(h);assert.equal(response.status,200);assert.equal((await response.json()).action,'deleted');assert.equal(await lookup(h),null);
  const retained=await h.db.auditLog.findUnique({where:{id:audit.id}});assert.ok(retained);assert.equal(retained.businessId,null);assert.equal(retained.targetId,h.business.id);
  assert.equal(await h.db.manager.findUnique({where:{id:manager.id}}),null);
  if(backend==='postgres') {
   assert.equal(await h.db.stripeConnection.findUnique({where:{businessId:h.business.id}}),null);
   assert.equal(await h.db.recurringPlan.findUnique({where:{id:h.business.recurringPlans[0].id}}),null);
  }
  assert.equal((await remove(h)).status,404);
 });
 test(`${label}: checkout-only history prevents destructive cascade`,async()=>{
  const h=await harness('ACH',backend);const c=await h.prepare();await admin(h);
  assert.equal((await (await remove(h)).json()).action,'deactivated');assert.deepEqual(await h.db.checkoutSession.findUnique({where:{id:c.id}}),c);
  assert.equal((await h.start(c)).status,409);assert.equal(h.calls.creates.length,0);
 });
 for(const status of ['CREATED','CHECKOUT_STARTED','PENDING','PAID','FAILED','EXPIRED','RETURNED','DISPUTED']) test(`${label}: ${status} preserves ownership, receipts and audits`,async()=>{
  const h=await harness('ACH',backend),attempt=await h.original(status);await admin(h);
  const manager=await h.db.manager.create({data:{businessId:h.business.id,email:`retained-${h.business.id}@example.test`,passwordHash:'fixture'}});
  const login=await h.db.session.create({data:{businessId:h.business.id,managerId:manager.id,type:'MANAGER',tokenHash:`fixture-${h.business.id}`,expiresAt:new Date(Date.now()+60000)}});
  await h.db.smsReceipt.create({data:{paymentId:attempt.payment.id,phone:'5555551234',status:'SENT',sentAt:new Date()}});
  const audit=await h.db.auditLog.create({data:{businessId:h.business.id,actorType:'SYSTEM',action:'PAYMENT_HISTORY',targetType:'Payment',targetId:attempt.payment.id,metadata:{stripeId:attempt.session.id}}});
  const before=await snapshot(h);const response=await remove(h);assert.equal(response.status,200);assert.equal((await response.json()).action,'deactivated');
  const b=await lookup(h);assert.equal(b.isActive,false);assert.equal(b.status,'DISABLED');const after=await snapshot(h);
  assert.deepEqual(after.payments,before.payments);assert.deepEqual(after.checkouts,before.checkouts);assert.deepEqual(after.receipts,before.receipts);assert.deepEqual(await h.db.auditLog.findUnique({where:{id:audit.id}}),audit);
  assert.deepEqual(await h.db.manager.findUnique({where:{id:manager.id}}),manager);
  assert.equal(await h.db.session.findUnique({where:{id:login.id}}),null);
  if(backend==='postgres') assert.equal((await h.db.stripeConnection.findUnique({where:{businessId:h.business.id}})).stripeAccountId,h.business.stripeConnection.stripeAccountId);
  assert.equal(attempt.session.status,'open');assert.equal(h.live.sessions.has(attempt.payment.stripeCheckoutSessionId),true);
  assert.equal((await h.start(attempt.checkout)).status,409);
  assert.equal((await createSnapshot(h)).status,409);assert.equal(h.calls.creates.length,1);
 });
 for(const method of ['ACH','CARD'])test(`${label}: ${method} settles through actual webhook after deactivation and sync`,async()=>{
  const h=await harness(method,backend),a=await h.original('PENDING'),intent=h.intentFor(a,'processing');await admin(h);
  assert.equal((await remove(h)).status,200);
  await h.load('lib/stripeConnection.ts').syncStripeConnection(h.business.id,h.business.stripeConnection.stripeAccountId);
  const b=await h.db.business.findUnique({where:{id:h.business.id},include:{stripeConnection:true,recurringPlans:{include:{charges:true}}}});
  assert.equal(b.isActive,false);assert.equal(b.status,'DISABLED');assert.equal((await h.load('lib/businessPaymentReadiness.ts').getBusinessPaymentReadiness(b)).ready,false);
  h.settle(a,intent);const paid=await h.webhook(a,intent);assert.equal(paid.businessId,h.business.id);assert.equal(paid.totalChargedCents,a.payment.totalChargedCents);
  assert.equal(paid.stripeCheckoutSessionId,a.session.id);assert.equal(paid.stripeChargeId,intent.latest_charge.id);
  assert.equal((await (await remove(h)).json()).action,'deactivated');assert.equal((await lookup(h)).status,'DISABLED');
 });
 for(const kind of ['none','forged','manager','inactive','revoked'])test(`${label}: ${kind} principal cannot delete another business`,async()=>{
  const h=await harness('ACH',backend);const a=await admin(h);const session=h.load('lib/session.ts');
  if(kind==='none')h.cookieJar.delete('rfl_session');
  if(kind==='forged')h.cookieJar.set('rfl_session','forged');
  if(kind==='inactive')await h.db.adminAccess.update({where:{id:a.id},data:{isActive:false}});
  if(kind==='revoked')await h.db.session.deleteMany({where:{adminAccessId:a.id}});
  if(kind==='manager') {
   const manager=await h.db.manager.create({data:{businessId:h.business.id,email:`${h.business.id}@example.test`,passwordHash:'fixture',isActive:true}});
   await session.createManagerSession({managerId:manager.id,businessId:h.business.id,passwordHash:manager.passwordHash,email:manager.email});
  }
  assert.equal((await remove(h)).status,401);assert.equal((await lookup(h)).isActive,true);
 });
 test(`${label}: duplicate requests retain the same financial ownership`,async()=>{
  const h=await harness('ACH',backend),a=await h.original('FAILED');await admin(h);const before=await snapshot(h);
  const results=await Promise.all([remove(h),remove(h)]);for(const r of results){assert.equal(r.status,200);assert.equal((await r.json()).action,'deactivated');}
  assert.deepEqual((await snapshot(h)).payments,before.payments);assert.equal((await h.db.checkoutSession.findUnique({where:{id:a.checkout.id}})).paymentId,a.payment.id);
 });
 test(`${label}: deactivation during external creation preserves durable reservation`,async()=>{
  const h=await harness('ACH',backend),c=await h.prepare();await admin(h);let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  h.live.onCreate=async()=>{enter();await gate;};const starting=h.start(c);await entered;
  const [reserved]=await h.payments();assert.equal(reserved.status,'CREATED');assert.equal(reserved.stripeCheckoutSessionId,null);
  assert.equal((await (await remove(h)).json()).action,'deactivated');assert.equal((await h.payments()).length,1);release();assert.equal((await starting).status,200);
  const [p]=await h.payments();const a={payment:p,checkout:c,session:h.live.sessions.get(p.stripeCheckoutSessionId)},intent=h.intentFor(a,'processing');h.settle(a,intent);await h.webhook(a,intent);
 });
 test(`${label}: webhook racing deactivation still reconciles`,async()=>{
  const h=await harness('ACH',backend),a=await h.original('PENDING'),intent=h.intentFor(a,'processing');await admin(h);h.settle(a,intent);
  if(backend==='isolated') {
   const [response]=await Promise.all([remove(h),h.webhook(a,intent)]);
   assert.equal(response.status,200);assert.equal((await lookup(h)).status,'DISABLED');return;
  }
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);h.live.onIntentRead=async()=>{enter();await gate;};
  const settling=h.webhook(a,intent);await entered;assert.equal((await remove(h)).status,200);release();await settling;assert.equal((await lookup(h)).status,'DISABLED');
 });
}

if(postgres) {
 test('postgres B6: empty deletion wins against stale checkout authorization',async()=>{
  const h=await harness('ACH','postgres');await admin(h);let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);
  // Hold the real Business row while removing it. Snapshot route sees the old
  // authorization fixture, then must wait and recheck the deleted row.
  const deletion=h.db.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT "id" FROM "Business" WHERE "id"=$1 FOR UPDATE',h.business.id);enter();await gate;await tx.business.delete({where:{id:h.business.id}});});
  await entered;const creating=h.prepare();release();await deletion;await assert.rejects(()=>creating);
  assert.equal(await lookup(h),null);assert.equal((await h.db.checkoutSession.findMany({where:{businessId:h.business.id}})).length,0);assert.equal(h.calls.creates.length,0);
 });
 test('postgres B6: actual administrator route serializes with snapshot ownership',async()=>{
  const h=await harness('ACH','postgres');await admin(h);let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);
  const held=h.db.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT "id" FROM "Business" WHERE "id"=$1 FOR UPDATE',h.business.id);enter();await gate;});
  await entered;const creating=h.prepare();const deleting=remove(h);release();await held;
  const results=await Promise.allSettled([creating,deleting]);assert.equal(results[1].status,'fulfilled');const response=results[1].value;assert.equal(response.status,200);const action=(await response.json()).action;
  if(action==='deleted'){assert.equal(results[0].status,'rejected');assert.equal(await lookup(h),null);}else{assert.equal(action,'deactivated');assert.equal(results[0].status,'fulfilled');assert.ok(await h.db.checkoutSession.findUnique({where:{id:results[0].value.id}}));}
  assert.equal((await h.payments()).length,0);
 });
}

if(postgres) {
 for(const winner of ['checkout','administrator'])test(`postgres B6: ${winner} wins a deterministic actual-route ownership race`,async()=>{
  const h=await harness('ACH','postgres');await admin(h);
  const original=postgres.$transaction.bind(postgres);let release,enter,intercepted=false;
  const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);
  // Keep real Prisma execution and locks; pause only after the first production
  // route actually acquires its Business lock. The competing route uses another
  // real transaction/connection and must wait for that ownership decision.
  postgres.$transaction=(callback,options)=>original(async tx=>callback(new Proxy(tx,{get(target,key){
   if(key==='$queryRaw')return async query=>{const rows=await target.$queryRaw(query);if(!intercepted && /FROM "Business"/.test(query.sql)){intercepted=true;enter();await gate;}return rows;};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }})),options);
  try {
   const first=winner==='checkout'?h.prepare():remove(h);await entered;
   const second=winner==='checkout'?remove(h):h.prepare();const waiting=Promise.allSettled([first,second]);
   release();const results=await waiting;
   if(winner==='checkout'){
    assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled');assert.equal((await results[1].value.json()).action,'deactivated');
    assert.ok(await h.db.checkoutSession.findUnique({where:{id:results[0].value.id}}));assert.equal((await lookup(h)).status,'DISABLED');
   }else{
    assert.equal(results[0].status,'fulfilled');assert.equal((await results[0].value.json()).action,'deleted');assert.equal(results[1].status,'rejected');assert.equal(await lookup(h),null);
   }
   assert.equal(h.calls.creates.length,0);
  }finally{release();postgres.$transaction=original;}
 });
 test('postgres B6: webhook foreign-key audit insert does not deadlock waiting checkout',async()=>{
  const h=await harness('ACH','postgres'),a=await h.original('FAILED'),c=await h.prepare();await admin(h);
  // Simulate the webhook's Payment row lock before checkout takes Business then
  // Payment. Its audit FK write must remain possible while checkout waits.
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  const webhook=h.db.$transaction(async tx=>{
   await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id"=$1 FOR UPDATE',a.payment.id);enter();await gate;
   await tx.auditLog.create({data:{businessId:h.business.id,actorType:'STRIPE_WEBHOOK',action:'B6_LOCK_ORDER',targetType:'PAYMENT',targetId:a.payment.id}});
  },{timeout:10000});
  await entered;let lockEntered;const locked=new Promise(r=>lockEntered=r);const original=postgres.$transaction.bind(postgres);let seen=false;
  postgres.$transaction=(callback,options)=>original(async tx=>callback(new Proxy(tx,{get(target,key){
   if(key==='$queryRaw')return async query=>{const rows=await target.$queryRaw(query);if(!seen && /FROM "Business"/.test(query.sql)){seen=true;lockEntered();}return rows;};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }})),options);
  try{
   const starting=h.start(c);await locked;release();await webhook;assert.equal((await starting).status,200);
   assert.equal((await h.payments()).length,1);assert.equal((await lookup(h)).isActive,true);
  }finally{release();postgres.$transaction=original;}
 });
}

if(postgres)test('postgres B6: revocation while deletion waits cannot authorize the action',async()=>{
 const h=await harness('ACH','postgres'),a=await admin(h);let enter,release,seen=false;
 const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r),original=postgres.$transaction.bind(postgres);
 postgres.$transaction=(callback,options)=>original(async tx=>callback(new Proxy(tx,{get(target,key){
  if(key==='$queryRaw')return async query=>{const rows=await target.$queryRaw(query);if(!seen && /FROM "AdminAccess"/.test(query.sql)){seen=true;enter();await gate;}return rows;};
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }})),options);
 try{
  const removing=remove(h);await entered;await h.db.session.deleteMany({where:{adminAccessId:a.id}});release();assert.equal((await removing).status,401);assert.equal((await lookup(h)).isActive,true);
 }finally{release();postgres.$transaction=original;}
});
