import assert from 'node:assert/strict';
import test from 'node:test';
import { harness, postgres } from './helpers/checkout-harness.mjs';
for (const backend of [...(postgres ? ['postgres'] : []), 'isolated']) for (const method of ['ACH','CARD']) {
 const label=`${backend} ${method} B3`;
 const getCheckout=(h,a)=>h.db.checkoutSession.findUnique({where:{id:a.checkout.id}});
 test(`${label}: cancel URL returns to production review and resumes identical immutable attempt`,async()=>{
  const h=await harness(method,backend); const a=await h.original('CHECKOUT_STARTED');
  const before={payment:await h.db.payment.findUnique({where:{id:a.payment.id}}),checkout:await getCheckout(h,a)};
  const url=new URL(h.calls.creates[0].params.cancel_url);
  assert.equal(url.pathname,`/${h.business.accountCode}/review`);assert.equal(url.searchParams.get('session'),a.checkout.id);
  await h.load('app/[accountCode]/review/page.tsx').default({params:Promise.resolve({accountCode:h.business.accountCode}),searchParams:Promise.resolve({session:a.checkout.id})});
  const response=await h.start(a.checkout); assert.equal(response.status,200); const body=await response.json();
  assert.equal(body.checkoutUrl,a.session.url);assert.equal(body.paymentId,a.payment.id);
  assert.deepEqual(await h.db.payment.findUnique({where:{id:a.payment.id}}),before.payment);assert.deepEqual(await getCheckout(h,a),before.checkout);
  assert.equal((await h.payments()).length,1);assert.equal((await h.db.checkoutSession.findMany({where:{businessId:h.business.id}})).length,1);
  assert.equal(h.calls.creates.length,1); assert.equal(h.live.sessions.size,1);
  assert.deepEqual(h.calls.access.at(-1),[a.session.id,a.checkout.id]);
  const params=h.calls.creates[0].params;assert.equal(params.line_items.reduce((s,i)=>s+i.quantity*i.price_data.unit_amount,0),before.checkout.totalCents);
  assert.equal(params.payment_intent_data.application_fee_amount,method==='ACH'?995:4900);
  assert.equal(before.checkout.totalCents,method==='ACH'?100995:104900);
  assert.equal(before.checkout.lineItems.filter(i=>i.type==='PLATFORM_FEE').length,1);
 });
 test(`${label}: changed live tier price cannot reprice the resumed snapshot`,async()=>{
  const h=await harness(method,backend);const a=await h.original('CHECKOUT_STARTED');const before=await getCheckout(h,a);
  h.business.recurringPlans[0].baseAmountCents=250000;
  if(backend==='postgres')await h.db.recurringPlan.update({where:{id:h.business.recurringPlans[0].id},data:{baseAmountCents:250000}});
  assert.equal((await h.start(a.checkout)).status,200);assert.deepEqual(await getCheckout(h,a),before);assert.equal(h.calls.creates.length,1);
 });
 for (const status of ['CREATED','CHECKOUT_STARTED','FAILED','EXPIRED']) test(`${label}: ${status} stays under B1 collectible authority`,async()=>{
  const h=await harness(method,backend);const a=await (status==='FAILED'?h.failedAttempt():h.original(status));assert.equal((await h.start(a.checkout)).status,200);assert.equal(h.calls.creates.length,1);assert.equal((await h.payments()).length,1);
 });
 for (const status of ['PAID','PENDING','RETURNED','DISPUTED']) test(`${label}: ${status} cannot reopen`,async()=>{
  const h=await harness(method,backend);const a=await h.original(status);assert.equal((await h.start(a.checkout)).status,409);assert.equal(h.calls.creates.length,1);assert.equal((await h.payments()).length,1);
 });
 for (const mutate of ['missing cookie','tampered cookie','different checkout cookie','missing payment','wrong payment','wrong business','wrong plan','wrong method','wrong payer','wrong snapshot','wrong stripe id','wrong intent','wrong Stripe method','unsafe URL','no URL','lookup failure','expired','closed canceled','readiness loss']) test(`${label}: rejects ${mutate} without sibling or snapshot writes`,async()=>{
  const h=await harness(method,backend);const a=await h.original('CHECKOUT_STARTED');let data={};
  if(mutate==='missing cookie')h.cookieJar.clear();
  if(mutate==='tampered cookie')for(const k of h.cookieJar.keys())h.cookieJar.set(k,'f'.repeat(64));
  if(mutate==='different checkout cookie'){h.cookieJar.clear();await h.load('lib/paymentResultAccess.ts').grantPaymentResultAccess(a.session.id,'another-customer');}
  if(mutate==='missing payment')data.paymentId=null;
  if(mutate==='wrong payment')data.paymentId='another-payment';
  if(mutate==='wrong business')await h.db.payment.update({where:{id:a.payment.id},data:{businessId:backend==='postgres'?(await harness(method,backend)).business.id:'another-business'}});
  if(mutate==='wrong plan')await h.db.payment.update({where:{id:a.payment.id},data:{sourceId:backend==='postgres'?(await harness(method,backend)).business.recurringPlans[0].id:'another-plan'}});
  if(mutate==='wrong method')data.paymentMethod=method==='ACH'?'CARD':'ACH';
  if(mutate==='wrong payer')data.firstName='Another';
  if(mutate==='wrong snapshot')data.lineItems=a.checkout.lineItems.map(i=>({...i,label:i.label+' tampered'}));
  if(mutate==='wrong stripe id')data.stripeCheckoutSessionId='cs_forged_'+a.checkout.id;
  if(mutate==='wrong intent'){const i=h.intentFor(a);await h.db.payment.update({where:{id:a.payment.id},data:{stripePaymentIntentId:i.id+'forged'}});}
  if(mutate==='wrong Stripe method')a.session.payment_method_types=[method==='ACH'?'card':'us_bank_account'];
  if(mutate==='unsafe URL')a.session.url='https://checkout.stripe.com.evil.test/pay';
  if(mutate==='no URL')a.session.url=null;
  if(mutate==='lookup failure')h.live.fail='session';
  if(mutate==='expired'){a.session.status='expired';a.session.url=null;}
  if(mutate==='closed canceled'){a.session.status='complete';h.intentFor(a,'canceled');a.session.url=null;}
  if(mutate==='readiness loss'){h.stripe.accounts.retrieve=async()=>{throw Error('Not ready');};}
  if(Object.keys(data).length)await h.db.checkoutSession.update({where:{id:a.checkout.id},data});
  const before=await h.db.payment.findUnique({where:{id:a.payment.id}});const checkout=await getCheckout(h,a);
  const response=await h.start(a.checkout);assert.ok([409,500].includes(response.status));assert.equal(h.calls.creates.length,1);assert.equal(h.live.sessions.size,1);
  assert.deepEqual(await h.db.payment.findUnique({where:{id:a.payment.id}}),before);assert.deepEqual(await getCheckout(h,a),checkout);
 });
 for (const status of ['processing','succeeded','requires_capture']) test(`${label}: open Checkout cannot resume ${status} intent`,async()=>{
  const h=await harness(method,backend);const a=await h.original('CHECKOUT_STARTED');const i=h.intentFor(a,status);
  if(status==='succeeded')i.amount_received=a.payment.totalChargedCents;
  assert.equal((await h.start(a.checkout)).status,409);assert.equal(h.calls.creates.length,1);assert.equal((await h.payments()).length,1);
 });
 test(`${label}: fresh reviewed identifier cannot bypass original browser binding`,async()=>{
  const h=await harness(method,backend);await h.original('CHECKOUT_STARTED');const other=await h.prepare();h.cookieJar.clear();
  assert.equal((await h.start(other)).status,409);assert.equal(h.calls.creates.length,1);assert.equal((await h.payments()).length,1);
 });
 test(`${label}: forged account code and unknown identifier rejected`,async()=>{
  const h=await harness(method,backend);const a=await h.original('CHECKOUT_STARTED');
  await assert.rejects(()=>h.load('app/[accountCode]/review/page.tsx').default({params:Promise.resolve({accountCode:'ZZ-0000'}),searchParams:Promise.resolve({session:a.checkout.id})}),/NOT_FOUND/);
  assert.equal((await h.start({id:'forged-checkout'})).status,404);assert.equal(h.calls.creates.length,1);
 });
 test(`${label}: concurrent resume clicks reuse one Stripe session`,async()=>{
  const h=await harness(method,backend);const a=await h.original('CHECKOUT_STARTED');
  const responses=await Promise.all(Array.from({length:8},()=>h.start(a.checkout)));for(const r of responses){assert.equal(r.status,200);assert.equal((await r.json()).paymentId,a.payment.id);}
  assert.equal(h.calls.creates.length,1);assert.equal((await h.payments()).length,1);
 });
 test(`${label}: settlement during resume preserves PAID and blocks subsequent resume`,async()=>{
  const h=await harness(method,backend);const a=await h.original('CHECKOUT_STARTED');const i=h.intentFor(a);
  let entered,release;const reading=new Promise(r=>entered=r);const barrier=new Promise(r=>release=r);let used=false;
  h.live.onRead=async()=>{if(!used){used=true;entered();await barrier;}};
  const resume=h.start(a.checkout);await reading;h.settle(a,i);const paid=h.webhook(a,i);release();
  await resume;await paid;assert.equal((await h.db.payment.findUnique({where:{id:a.payment.id}})).status,'PAID');
  assert.equal((await getCheckout(h,a)).status,'PAID');assert.equal((await h.start(a.checkout)).status,409);assert.equal(h.calls.creates.length,1);
 });
}
