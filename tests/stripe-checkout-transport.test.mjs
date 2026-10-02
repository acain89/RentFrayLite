import assert from 'node:assert/strict';
import test from 'node:test';
import { harness, postgres } from './helpers/checkout-harness.mjs';
import { authHarness } from './helpers/auth-harness.mjs';
import { renderToStaticMarkup } from 'react-dom/server';

const sum=items=>items.reduce((total,item)=>total+item.quantity*item.price_data.unit_amount,0);
async function managerFor(h) {
  const auth=await authHarness('postgres',h.db), manager=await h.db.manager.create({data:{businessId:h.business.id,email:crypto.randomUUID()+'@example.test',passwordHash:auth.managers[0].passwordHash}});
  await auth.session.createManagerSession({managerId:manager.id,businessId:manager.businessId,email:manager.email,passwordHash:manager.passwordHash});
  return body=>auth.load('app/api/setup/recurring/charges/route.ts').PUT(auth.request(body));
}
async function refresh(h) {
  h.business.recurringPlans=await h.db.recurringPlan.findMany({where:{businessId:h.business.id,isActive:true},include:{charges:true},orderBy:{sortOrder:'asc'}});
}
async function configure(h,count,shared=false) {
  const save=await managerFor(h);
  if(shared) await h.db.recurringPlan.create({data:{businessId:h.business.id,name:'Other tier',baseAmountCents:200000,dueDay:1,gracePeriodDays:1,sortOrder:1}});
  await refresh(h);
  const response=await save({tiers:h.business.recurringPlans.map((plan,tier)=>({recurringPlanId:plan.id,charges:Array.from({length:count},(_,n)=>({id:null,clientKey:`new-${tier}-${n}`,sharedChargeGroupId:null,label:`Charge ${tier}/${n}`,amountCents:1,applyToAllTiers:shared}))}))});
  assert.equal(response.status,200,await response.clone().text());await refresh(h);return save;
}
for(const method of ['ACH','CARD']) for(const shared of [false,true]) test(`${method} PostgreSQL production save/pricing/start: ${shared?'two 250-charge shared tiers':'99-charge audit'}`,{skip:!postgres},async()=>{
  const h=await harness(method,'postgres'); await configure(h,shared?250:99,shared);
  const expected=shared?500:99,checkout=await h.prepare();
  assert.equal(checkout.baseAmountCents,100000);assert.equal(checkout.subtotalCents,100000+expected);
  assert.equal(checkout.lineItems.filter(item=>item.type==='RECURRING_CHARGE').length,expected);
  assert.equal(h.load('lib/paymentReadiness.ts').getConfigurationReasons(h.business).length,0);
  const response=await h.start(checkout);assert.equal(response.status,200);
  const params=h.calls.creates[0].params,[payment]=await h.payments();
  console.log(JSON.stringify({method,shared,internal:checkout.lineItems.length,transport:params.line_items.length,total:checkout.totalCents,fee:checkout.platformFeeCents,business:checkout.subtotalCents}));
  assert.equal(sum(params.line_items),checkout.totalCents);assert.equal(payment.totalChargedCents,checkout.totalCents);assert.equal(params.payment_intent_data.application_fee_amount,checkout.platformFeeCents);
  assert.equal(checkout.totalCents-checkout.platformFeeCents,payment.businessProceedsCents);assert.deepEqual(payment.lineItemsSnapshot,checkout.lineItems);
  assert.ok(params.line_items.length<=100,'production checkout must not send unsupported row count');
});

const backends=[...(postgres?['postgres']:[]),'isolated'];
async function populate(h,backend,count,changes={}) {
  const plan=h.business.recurringPlans[0]; Object.assign(plan,changes);
  if(backend==='postgres') {
    if(Object.keys(changes).length) await h.db.recurringPlan.update({where:{id:plan.id},data:changes});
    for(let offset=0;offset<count;offset+=1000) await h.db.recurringCharge.createMany({data:Array.from({length:Math.min(1000,count-offset)},(_,n)=>({recurringPlanId:plan.id,label:`Recurring ${offset+n}`,amountCents:1}))});
    await refresh(h);
  } else plan.charges=Array.from({length:count},(_,n)=>({id:`charge-${n}`,label:`Recurring ${n}`,amountCents:1,isActive:true,effectiveBillingCycle:null,endsAfterBillingCycle:null}));
}
async function atDate(h,checkout,now) {
  const price=h.load('lib/checkoutPricing.ts').calculateCheckoutPricing({plan:h.business.recurringPlans[0],paymentMethod:checkout.paymentMethod,now:new Date(now)});
  const data=Object.fromEntries(['billingCycle','dueDate','graceEndsAt','baseAmountCents','recurringChargesCents','initialLateFeeCents','dailyLateFeesCents','subtotalCents','platformFeeCents','lineItems'].map(key=>[key,price[key]]));
  return h.db.checkoutSession.update({where:{id:checkout.id},data:{...data,totalCents:price.totalChargedCents}});
}
async function assertReconciled(h,checkout,rows) {
  assert.equal((await h.start(checkout)).status,200); const params=h.calls.creates[0].params,[payment]=await h.payments();
  assert.equal(params.line_items.length,rows); assert.equal(sum(params.line_items),checkout.totalCents);
  assert.equal(payment.totalChargedCents,checkout.totalCents);assert.equal(payment.platformFeeCents,checkout.platformFeeCents);
  assert.equal(params.payment_intent_data.application_fee_amount,checkout.platformFeeCents);
  assert.equal(params.payment_intent_data.transfer_data.destination,h.business.stripeConnection.stripeAccountId);
  assert.equal(sum(params.line_items)-params.payment_intent_data.application_fee_amount,payment.businessProceedsCents);
  assert.equal(payment.businessProceedsCents,checkout.subtotalCents);assert.deepEqual(payment.lineItemsSnapshot,checkout.lineItems);
  const fee=checkout.lineItems.find(item=>item.type==='PLATFORM_FEE'); assert.equal(params.line_items.filter(item=>item.price_data.product_data.name===fee.label).length,1);
  return {params,payment};
}
for(const backend of backends) for(const method of ['ACH','CARD']) {
  for(const count of [0,98,99,62500]) test(`${backend} ${method}: ${count} recurring rows preserve snapshots and fit transport`,async()=>{
    const h=await harness(method,backend);await populate(h,backend,count);const checkout=await h.prepare();
    const before=structuredClone(checkout.lineItems);const {params,payment}=await assertReconciled(h,checkout,count<=98?count+2:3);
    assert.equal(checkout.subtotalCents,100000+count);assert.equal(checkout.lineItems.length,count+2);assert.deepEqual(checkout.lineItems,before);
    assert.deepEqual((await h.db.checkoutSession.findUnique({where:{id:checkout.id}})).lineItems,before);
    if(!count) {assert.equal(payment.platformFeeCents,method==='ACH'?995:4900);assert.equal(payment.totalChargedCents,method==='ACH'?100995:104900);}
    else if(count>98) assert.equal(params.line_items.find(item=>item.price_data.product_data.name.startsWith('Recurring charges')).price_data.unit_amount,count);
  });
  for(const mode of ['none','initial','daily','both']) test(`${backend} ${method}: late-fee composition ${mode} stays within capacity`,async()=>{
    const h=await harness(method,backend);await populate(h,backend,99,{initialLateFeeCents:mode==='initial'||mode==='both'?1000:0,dailyLateFeeCents:mode==='daily'||mode==='both'?100:0,dailyLateFeeMaxDays:mode==='daily'||mode==='both'?365:0});
    const date=mode==='none'?'2027-01-01':mode==='initial'?'2027-01-02':'2027-01-31';
    const checkout=await atDate(h,await h.prepare(),date); const initial=mode==='initial'||mode==='both',daily=mode==='daily'||mode==='both';
    assert.equal(checkout.initialLateFeeCents,initial?1000:0);assert.equal(checkout.dailyLateFeesCents,daily?2900:0);
    await assertReconciled(h,checkout,3+Number(initial)+Number(daily));
  });
  test(`${backend} ${method}: unsupported 101 nonconsolidatable rows rejected before reservation/Stripe`,async()=>{
    const h=await harness(method,backend),original=await h.prepare();
    const items=[original.lineItems[0],...Array.from({length:99},(_,n)=>({type:'UNKNOWN_FUTURE_COMPONENT',label:`Unknown ${n}`,amountCents:1})),original.lineItems.at(-1)];
    const checkout=await h.db.checkoutSession.update({where:{id:original.id},data:{lineItems:items,subtotalCents:100099,totalCents:original.totalCents+99}});
    const before=await h.db.checkoutSession.findUnique({where:{id:checkout.id}});
    assert.equal((await h.start(checkout)).status,500);assert.equal(h.calls.creates.length,0);assert.equal((await h.payments()).length,0);
    assert.deepEqual(await h.db.checkoutSession.findUnique({where:{id:checkout.id}}),before);
    assert.ok(h.calls.errors.some(args=>String(args[0]).includes('transport exceeds')));
  });
  test(`${backend} ${method}: corrupted total fails closed even with consolidation`,async()=>{
    const h=await harness(method,backend);await populate(h,backend,99);const checkout=await h.prepare();
    await h.db.checkoutSession.update({where:{id:checkout.id},data:{totalCents:checkout.totalCents+1}});
    assert.equal((await h.start(checkout)).status,500);assert.equal(h.calls.creates.length,0);assert.equal((await h.payments()).length,0);
  });
  test(`${backend} ${method}: manager edits/failure/resume retain original compact request and full snapshot`,async()=>{
    const h=await harness(method,backend);await populate(h,backend,99); const checkout=await h.prepare();const {params,payment}=await assertReconciled(h,checkout,3);
    const a={checkout,payment,session:h.live.sessions.get(payment.stripeCheckoutSessionId)},intent=h.intentFor(a);
    await h.webhook(a,intent,'payment_intent.payment_failed','FAILED'); const stored=await h.db.payment.findUnique({where:{id:payment.id}}),local=await h.db.checkoutSession.findUnique({where:{id:checkout.id}});
    if(backend==='postgres') {const save=await managerFor(h);const plan=h.business.recurringPlans[0],charge=plan.charges[0];assert.equal((await save({tiers:[{recurringPlanId:plan.id,charges:[{id:charge.id,clientKey:'retained',sharedChargeGroupId:null,label:charge.label,amountCents:2500,applyToAllTiers:false}]}]})).status,200);await refresh(h);}
    else h.business.recurringPlans[0].charges=[];
    assert.equal((await h.start(checkout)).status,200);assert.equal(h.calls.creates.length,1);assert.deepEqual(h.calls.creates[0].params,params);
    assert.deepEqual(await h.db.payment.findUnique({where:{id:payment.id}}),stored);assert.deepEqual(await h.db.checkoutSession.findUnique({where:{id:checkout.id}}),local);
    h.settle(a,intent);await h.webhook(a,intent); const paid=await h.db.payment.findUnique({where:{id:payment.id}});
    assert.deepEqual(paid.lineItemsSnapshot,checkout.lineItems);assert.equal((await h.db.smsReceipt.findUnique({where:{paymentId:payment.id}})).status,'QUEUED');
    if(backend==='postgres') {
      const result=await h.load('lib/paymentResult.ts').getPaymentResult(h.business.accountCode,a.session.id);assert.deepEqual(result.payment.lineItemsSnapshot,checkout.lineItems);
      const html=renderToStaticMarkup(await h.load('app/payment/success/page.tsx').default({searchParams:Promise.resolve({accountCode:h.business.accountCode,session_id:a.session.id})}));
      for(const item of checkout.lineItems.filter(item=>item.type==='RECURRING_CHARGE')) assert.ok(html.includes(item.label));
      assert.ok(html.includes('Payment successful'));assert.ok(!html.includes('Recurring charges (99 items)'));
    }
  });
}
