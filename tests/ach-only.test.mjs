import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, postgres } from './helpers/checkout-harness.mjs';
import { customFixture } from './helpers/custom-payment-harness.mjs';
const backends=postgres?['isolated','postgres']:['isolated'];
for(const backend of backends){
 test(backend+': fresh standard and Custom card quotes are rejected server-side',async()=>{
  const h=await harness('ACH',backend),post=h.load('app/api/public/checkout/session/route.ts').POST;
  const data={accountCode:h.business.accountCode,planId:h.business.recurringPlans[0].id,unitNumber:'101',firstName:'Synthetic',lastName:'Payer',phone:'5555551234',paymentMethod:'CARD'};
  const response=await post(new Request('https://example.test/api',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify(data)}));assert.equal(response.status,400);assert.equal(h.calls.creates.length,0);assert.equal((await h.payments()).length,0);
  const custom=await customFixture('ACH',backend);assert.equal((await custom.create('123.45',{paymentMethod:'CARD'})).status,400);assert.equal(custom.calls.creates.length,0);
 });
 test(backend+': existing card quotes cannot create or resume Checkout Sessions',async()=>{
  const h=await harness('ACH',backend),q=await h.prepare();await h.db.checkoutSession.update({where:{id:q.id},data:{paymentMethod:'CARD'}});assert.equal((await h.start(q)).status,400);assert.equal(h.calls.creates.length,0);assert.equal((await h.payments()).length,0);
 });
 test(backend+': standard ACH retains destination charge, processing and success transitions',async()=>{
  const h=await harness('ACH',backend),attempt=await h.original('CHECKOUT_STARTED');const params=h.calls.creates[0].params;assert.deepEqual(params.payment_method_types,['us_bank_account']);assert.equal(params.payment_intent_data.transfer_data.destination,h.business.stripeConnection.stripeAccountId);
  const intent=h.intentFor(attempt,'processing');await h.webhook(attempt,intent,'payment_intent.processing','PENDING');h.settle(attempt,intent);const eventId='evt_ach_push_'+attempt.payment.id;await h.webhook(attempt,intent,'payment_intent.succeeded','PAID',200,eventId);await h.webhook(attempt,intent,'payment_intent.succeeded','PAID',200,eventId);assert.equal((await h.db.payment.findUnique({where:{id:attempt.payment.id}})).status,'PAID');assert.equal((await h.db.pushEvent.findMany({where:{paymentId:attempt.payment.id}})).length,2);
 });
 test(backend+': Custom ACH remains available immediately and keeps limits and fees',async()=>{
  const h=await customFixture('ACH',backend),{checkout}=await h.prepareCustom('5000.00');assert.equal(checkout.subtotalCents,500000);assert.equal(checkout.platformFeeCents,995);assert.equal((await h.start(checkout)).status,200);assert.deepEqual(h.calls.creates[0].params.payment_method_types,['us_bank_account']);assert.equal((await h.create('5000.01')).status,400);
 });
}
test('every valid ACH cent preserves the deployed fee schedule and limit',async()=>{
 const h=await harness('ACH','isolated'),fees=h.load('lib/platformFees.ts');const boundaries=[[10000,295],[20000,395],[30000,495],[40000,595],[50000,695],[60000,795],[70000,845],[80000,895],[500001,995]];
 for(let n=0;n<=500000;n++)assert.equal(fees.getAchPlatformFeeCents(n),n===0?0:boundaries.find(([max])=>n<max)[1]);assert.throws(()=>fees.getAchPlatformFeeCents(500001));assert.throws(()=>h.load('lib/checkoutPricing.ts').getPlatformFeeCents('CARD',10000));
});
