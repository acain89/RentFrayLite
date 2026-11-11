import { historicalCheckoutSource } from './helpers/checkout-financial-source.mjs';
import { assertCheckoutStartSource } from './helpers/checkout-financial-source.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { harness, postgres } from './helpers/checkout-harness.mjs';
import { directStripeFixture } from './helpers/stripe-foundation-harness.mjs';
const load=(await harness('ACH','isolated')).load;
const direct=load('lib/directPaymentFoundation.ts'),readiness=load('lib/stripeDirectReadiness.ts'),fees=load('lib/rflDirectPricing.ts');
const property={id:'property',accountCode:'RF-1234',createdAt:new Date('2026-10-15T12:00Z'),propertyTimeZone:'America/Chicago',firstStandardBillingDate:new Date('2026-11-01')};
const plan={id:'tier',businessId:'property',isActive:true,name:'Standard',baseAmountCents:100000,dueDay:1,gracePeriodDays:5,initialLateFeeCents:1000,dailyLateFeeCents:100,dailyLateFeeMaxDays:10,charges:[{id:'mandatory',label:'Mandatory charge',amountCents:5000,effectiveBillingCycle:null,endsAfterBillingCycle:null}]};
async function context(change){const f=directStripeFixture();change?.(f);const report=await readiness.readDirectChargeReadiness(f.stripe,f.input);return {...f,report};}
const quoteInput=(f,method='CARD',source={sourceType:'RECURRING_PLAN',plan})=>({property,source,paymentMethod:method,now:new Date('2026-11-08T18:00Z'),identity:f.input.identity,connectedAccountId:f.input.connectedAccountId,checkoutAttemptId:'attempt'});
async function reserved(backend='isolated',method='CARD',type='CUSTOM_PAYMENT',now=new Date('2026-11-08T18:00Z')){
 const h=await harness(method,backend),f=await context(f=>{f.input.connectedAccountId=h.business.stripeConnection.stripeAccountId;f.state.account.id=f.input.connectedAccountId;});
 const input={...quoteInput(f,method,type==='CUSTOM_PAYMENT'?{sourceType:type,amount:'123.45'}:{sourceType:type,plan:{...plan,id:h.business.recurringPlans[0].id,businessId:h.business.id}}),now,property:{...property,id:h.business.id,accountCode:h.business.accountCode},checkoutAttemptId:'direct-'+randomUUID()};
 const quote=direct.prepareDirectCheckoutQuote(f.report,input);
 const checkout=await h.db.checkoutSession.create({data:{...quote,lineItems:[...quote.lineItems],firstName:'Synthetic',lastName:'Payer',unitNumber:'101',phone:'5555551234',status:'REVIEWED',createdAt:input.now,expiresAt:new Date(input.now.getTime()+3600000)}});
 direct.assertCurrentDirectCheckoutQuote(checkout,f.report,input);
 const payment=await h.db.payment.create({data:{...direct.prepareDirectPaymentRecord(checkout,f.report,input.identity),createdAt:input.now}});
 const linked=await h.db.checkoutSession.update({where:{id:checkout.id},data:{paymentId:payment.id}});
 return {h,f,input,quote,checkout:linked,payment,request:()=>direct.prepareDirectCheckoutRequest(linked,payment,f.report,input.identity,'https://example.test',input.now)};
}
for(const method of ['ACH','CARD'])for(const amount of [100,2499,2500,2501,4999,5000,5001,44999,45000,45001,499999,500000])test(method+' dormant Custom exact boundary '+amount,async()=>{
 const f=await context(),input=quoteInput(f,method,{sourceType:'CUSTOM_PAYMENT',amount:(amount/100).toFixed(2)}),q=direct.prepareDirectCheckoutQuote(f.report,input),expected=fees.priceRflDirectV1({managementOwedCents:amount,paymentMethod:method});
 assert.equal(q.subtotalCents,amount);assert.equal(q.platformFeeCents,expected.tenantProcessingFeeCents);assert.equal(q.totalCents,expected.tenantTotalCents);assert.equal(q.rflApplicationFeeCents,expected.rflApplicationFeeCents);assert.equal(q.totalCents-q.expectedStripeProcessingFeeCents-q.rflApplicationFeeCents,amount);
 assert.equal(Object.isFrozen(q),true);assert.equal(Object.isFrozen(q.lineItems[0]),true);assert.throws(()=>q.lineItems[0].amountCents++);
});
for(const amount of ['0','0.99','5000.01','-1','1.001','1e2','NaN',1,null])test('dormant Custom rejects '+String(amount),async()=>{const f=await context();assert.throws(()=>direct.prepareDirectCheckoutQuote(f.report,quoteInput(f,'ACH',{sourceType:'CUSTOM_PAYMENT',amount})));});
for(const method of ['ACH','CARD'])test(method+' standard obligation reuses calendar and mandatory charges before direct pricing',async()=>{
 const f=await context(),q=direct.prepareDirectCheckoutQuote(f.report,quoteInput(f,method));assert.equal(q.baseAmountCents,100000);assert.equal(q.recurringChargesCents,5000);assert.equal(q.initialLateFeeCents,1000);assert.equal(q.dailyLateFeesCents,200);assert.equal(q.subtotalCents,106200);assert.equal(q.expectedManagementNetCents,q.subtotalCents);assert.equal(q.platformFeeCents,fees.priceRflDirectV1({managementOwedCents:106200,paymentMethod:method}).tenantProcessingFeeCents);
});
for(const method of ['ACH','CARD'])test(method+' Custom ignores incomplete/future property calendar while standard fails closed',async()=>{
 const f=await context(),input=quoteInput(f,method);input.now=new Date('2026-10-25T18:00Z');assert.throws(()=>direct.prepareDirectCheckoutQuote(f.report,input),/available/);input.source={sourceType:'CUSTOM_PAYMENT',amount:'100.00'};input.property={...property,propertyTimeZone:null};const q=direct.prepareDirectCheckoutQuote(f.report,input);for(const key of ['planId','billingCycle','dueDate','graceEndsAt'])assert.equal(q[key],null);for(const key of ['recurringChargesCents','initialLateFeeCents','dailyLateFeesCents'])assert.equal(q[key],0);
});
for(const change of ['identity','connected','readiness','express','tier'])test('dormant quote rejects '+change,async()=>{
 const f=await context(change==='express'?f=>f.state.account.controller.fees.payer='application_express':undefined),input=quoteInput(f);if(change==='identity')input.identity={...input.identity,mode:'live'};if(change==='connected')input.connectedAccountId='acct_other';if(change==='tier')input.source.plan={...plan,businessId:'other'};assert.throws(()=>direct.prepareDirectCheckoutQuote(change==='readiness'?{...f.report}:f.report,input));
});
for(const backend of postgres?['isolated','postgres']:['isolated'])for(const method of ['ACH','CARD'])for(const type of ['RECURRING_PLAN','CUSTOM_PAYMENT']){
 const label=backend+' '+method+' '+type;
 test(label+' persists immutable ownership and prepares only connected-scoped payment Checkout',async()=>{
  const r=await reserved(backend,method,type),before=structuredClone({checkout:r.checkout,payment:r.payment}),request=r.request();assert.equal(request.params.mode,'payment');assert.deepEqual(request.params.payment_method_types,[method==='ACH'?'us_bank_account':'card']);assert.equal(request.options.stripeAccount,r.payment.stripeConnectedAccountId);assert.equal(request.options.idempotencyKey,'rfl-payment-'+r.payment.id);assert.equal(request.params.payment_intent_data.transfer_data,undefined);assert.equal(request.params.payment_intent_data.on_behalf_of,undefined);assert.equal(request.params.payment_intent_data.application_fee_amount,r.payment.rflApplicationFeeCents);assert.equal(request.params.line_items.reduce((sum,i)=>sum+i.price_data.unit_amount*i.quantity,0),r.payment.totalChargedCents);assert.equal(request.params.client_reference_id,r.payment.id);assert.equal(request.params.metadata.checkoutAttemptId,r.checkout.id);assert.equal(Object.isFrozen(request.params.payment_intent_data.metadata),true);assert.equal(request.params.customer,undefined);assert.deepEqual(await r.h.db.payment.findUnique({where:{id:r.payment.id}}),before.payment);assert.deepEqual(await r.h.db.checkoutSession.findUnique({where:{id:r.checkout.id}}),before.checkout);
  let calls=0;const stripe={checkout:{sessions:{create:async()=>{calls++;throw Error('Must not execute');}}}};await assert.rejects(()=>direct.createDirectCheckoutSession(stripe,r.checkout,r.payment,r.f.report,r.input.identity,'https://example.test',r.input.now),/disabled/);assert.equal(calls,0);assert.equal(r.h.calls.creates.length,0);
 });
 test(label+' concurrent preparation/retry preserves one key; independent attempts use different keys',async()=>{
  const r=await reserved(backend,method,type),requests=await Promise.all(Array.from({length:8},async()=>r.request()));for(const request of requests)assert.deepEqual(request,requests[0]);const keys=new Map();let objects=0;const mock=async request=>{const key=request.options.stripeAccount+':'+request.options.idempotencyKey;if(!keys.has(key))keys.set(key,{id:'cs_mock_'+(++objects)});return keys.get(key);};const responses=await Promise.all(requests.map(mock));assert.equal(new Set(responses.map(r=>r.id)).size,1);const other=await reserved(backend,method,type);assert.notEqual(other.request().options.idempotencyKey,requests[0].options.idempotencyKey);assert.equal((await r.h.db.payment.findMany({where:{businessId:r.payment.businessId}})).length,1);
 });
}
for(const change of ['mode','account','attempt','business','tenant','amount','lineItems','applicationFee','method','status','providerId','age','origin'])test('reserved request rejects '+change,async()=>{
 const r=await reserved();let c=r.checkout,p=r.payment,identity=r.input.identity,origin='https://example.test',now=r.input.now;
 if(change==='mode')identity={...identity,mode:'live'};if(change==='account')p={...p,stripeConnectedAccountId:'acct_other'};if(change==='attempt')p={...p,checkoutAttemptId:'other'};if(change==='business')p={...p,businessId:'other'};if(change==='tenant')p={...p,payerFirstName:'Changed'};if(change==='amount')p={...p,totalChargedCents:p.totalChargedCents+1};if(change==='lineItems')p={...p,lineItemsSnapshot:[]};if(change==='applicationFee')p={...p,rflApplicationFeeCents:p.rflApplicationFeeCents+1};if(change==='method')p={...p,paymentMethod:'ACH'};if(change==='status')p={...p,status:'FAILED'};if(change==='providerId')p={...p,stripeCheckoutSessionId:'cs_existing'};if(change==='age')now=new Date(now.getTime()+23*3600000);if(change==='origin')origin='https://example.test/untrusted?token=private';assert.throws(()=>direct.prepareDirectCheckoutRequest(c,p,r.f.report,identity,origin,now));
});
test('stale unreserved local-midnight quote is rejected; reserved amount remains original',async()=>{
 const r=await reserved('isolated','CARD','RECURRING_PLAN',new Date('2026-11-09T05:59Z')),tomorrow={...r.input,now:new Date('2026-11-09T06:01Z')};assert.throws(()=>direct.assertCurrentDirectCheckoutQuote({...r.checkout,paymentId:null},r.f.report,tomorrow),/quote changed/);const request=direct.prepareDirectCheckoutRequest(r.checkout,r.payment,r.f.report,r.input.identity,'https://example.test',tomorrow.now);assert.equal(request.params.line_items.reduce((s,i)=>s+i.price_data.unit_amount,0),r.payment.totalChargedCents);
});
test('public checkout cannot select direct architecture and cannot start a fabricated direct quote',async()=>{
 const h=await harness('CARD','isolated'),c=await h.prepare({chargeModel:'DIRECT',pricingVersion:'RFL_DIRECT_V1',direct:true});assert.equal(c.chargeModel,'LEGACY_DESTINATION');assert.equal((await h.start(c)).status,200);assert.ok(h.calls.creates[0].params.payment_intent_data.transfer_data);assert.equal(h.calls.creates[0].options.stripeAccount,undefined);
 const r=await reserved(),response=await r.h.start(r.checkout);assert.notEqual(response.status,200);assert.equal(r.h.calls.creates.length,0);
});
test('legacy entry points and policy remain byte-identical; only the server quote adapter imports dormant preparation; no direct executor caller',()=>{
 const root=path.resolve(import.meta.dirname,'..'),normalize=s=>s.replaceAll('\r\n','\n');for(const file of ['lib/checkoutPricing.ts','lib/checkoutRetry.ts','lib/platformFees.ts','lib/rflDirectPricing.ts','lib/stripeCheckoutTransport.ts','lib/paymentArchitecturePolicy.ts'])assert.equal(normalize(historicalCheckoutSource(file,readFileSync(path.join(root,file),'utf8'))),normalize(execFileSync('git',['show','aa40e0ccb361157940d39ffc66ebfbe6e6d792f8:'+file],{encoding:'utf8',windowsHide:true})),file);
 function inspect(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())inspect(f);else if(/\.[jt]sx?$/.test(f)&&![path.join('lib','directPaymentFoundation.ts'),path.join('lib','directCheckoutLifecycle.ts'),path.join('lib','versionedCheckoutQuote.ts'),path.join('lib','checkoutDispatch.ts')].some(suffix=>f.endsWith(suffix)))assert.doesNotMatch(readFileSync(f,'utf8'),/directPaymentFoundation|directCheckoutLifecycle|createDirectCheckoutSession|startDirectCheckout/,path.relative(root,f));}}for(const dir of ['app','lib','components'])inspect(path.join(root,dir));const quoteAdapter=readFileSync(path.join(root,'lib/versionedCheckoutQuote.ts'),'utf8');assert.match(quoteAdapter,/prepareDirectCheckoutQuote/);assert.doesNotMatch(quoteAdapter,/createDirectCheckoutSession|startDirectCheckout|directCheckoutLifecycle/);const policy=load('lib/paymentArchitecturePolicy.ts');assert.equal(policy.directPaymentCreationEnabled(),false);assert.equal(policy.selectedCheckoutChargeModel(),'LEGACY_DESTINATION');
});
if(postgres)test('PostgreSQL direct attempt uniqueness rejects duplicate reservations while independent identical payments persist',async()=>{
 const r=await reserved('postgres','CARD','CUSTOM_PAYMENT'),data=direct.prepareDirectPaymentRecord({...r.checkout,paymentId:null},r.f.report,r.input.identity);
 const duplicate=await Promise.allSettled(Array.from({length:6},()=>r.h.db.payment.create({data})));assert.ok(duplicate.every(x=>x.status==='rejected'&&x.reason.code==='P2002'));
 const independent=await Promise.all(Array.from({length:6},async()=>{
  const id='direct-'+randomUUID(),checkout=await r.h.db.checkoutSession.create({data:{...r.checkout,id,paymentId:null}});
  return r.h.db.payment.create({data:direct.prepareDirectPaymentRecord(checkout,r.f.report,r.input.identity)});
 }));assert.equal(new Set(independent.map(p=>p.checkoutAttemptId)).size,6);assert.ok(independent.every(p=>p.businessId===r.payment.businessId&&p.referenceLabel===r.payment.referenceLabel&&p.totalChargedCents===r.payment.totalChargedCents));assert.equal(await r.h.db.payment.count({where:{businessId:r.payment.businessId}}),7);
});

test('checkout start ingress preserves the complete historical financial and authorization handler',()=>assertCheckoutStartSource('aa40e0ccb361157940d39ffc66ebfbe6e6d792f8'));
