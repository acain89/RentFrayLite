import assert from 'node:assert/strict';
import test from 'node:test';
import { authHarness, postgres } from './helpers/auth-harness.mjs';

const pgTest = (name, fn) => test('recurring-charge preservation: ' + name, { skip: !postgres }, fn);

// Keep the core regression in ordinary npm test as well. This models only
// persistence; authentication, route validation, save/diff, and pricing are real.
test('ordinary production-route regression: unchanged, amount and label edits preserve Jan-Feb applicability', async()=>{
  const h=await authHarness(); await h.issue();
  const plan={id:'isolated-plan',businessId:h.businesses[0].id,name:'Rent',baseAmountCents:100000,isActive:true,sortOrder:0,dueDay:1,gracePeriodDays:1,initialLateFeeCents:0,dailyLateFeeCents:0,dailyLateFeeMaxDays:0};
  let rows=[{id:'isolated-charge',recurringPlanId:plan.id,label:'Water',amountCents:1000,sharedChargeGroupId:null,effectiveBillingCycle:'2027-01',endsAfterBillingCycle:'2027-02',isActive:true,sortOrder:0}];
  h.db.recurringPlan={findMany:async()=>structuredClone([plan])};
  h.db.recurringCharge={
    findMany:async()=>structuredClone(rows),
    update:async({where,data})=>{const row=rows.find(r=>r.id===where.id);assert.ok(row);Object.assign(row,data);return structuredClone(row);},
    create:async({data})=>{const row={id:crypto.randomUUID(),effectiveBillingCycle:null,endsAfterBillingCycle:null,...data};rows.push(row);return structuredClone(row);},
    deleteMany:async({where})=>{const previous=rows.length;rows=where.id?rows.filter(row=>!where.id.in.includes(row.id)):[];return{count:previous-rows.length};},
  };
  const transaction=h.db.$transaction;
  h.db.$transaction=async(...args)=>{const before=structuredClone(rows);try{return await transaction(...args);}catch(error){rows=before;throw error;}};
  const price=()=>['2026-10','2026-12','2027-01','2027-02','2027-03'].map(cycle=>h.load('lib/checkoutPricing.ts').calculateCheckoutPricing({plan:{...plan,charges:rows},paymentMethod:'ACH',now:new Date(cycle+'-01T00:00:00Z')}).recurringChargesCents);
  assert.deepEqual(price(),[0,0,1000,1000,0]);
  for(const edit of [{},{amountCents:2500},{label:'Renamed water'}]) {
    const charge={id:rows[0].id,clientKey:'card',sharedChargeGroupId:null,label:rows[0].label,amountCents:rows[0].amountCents,applyToAllTiers:false,...edit};
    const response=await h.load('app/api/setup/recurring/charges/route.ts').PUT(h.request({tiers:[{recurringPlanId:plan.id,charges:[charge]}]}));
    assert.equal(response.status,200);assert.equal(rows[0].id,'isolated-charge');assert.deepEqual(price(),[0,0,charge.amountCents,charge.amountCents,0]);
    assert.equal(rows[0].effectiveBillingCycle,'2027-01');assert.equal(rows[0].endsAfterBillingCycle,'2027-02');
  }
});

async function fixture() {
  const failures = new Set();
  const db = new Proxy(postgres, { get(target, key) {
    if (key === '$transaction') return (fn, options) => target.$transaction(typeof fn === 'function' ? tx => fn(new Proxy(tx, { get(t, k) {
      const model = t[k];
      if (!model || typeof model !== 'object') return typeof model === 'function' ? model.bind(t) : model;
      return new Proxy(model, { get(m, method) { return (...args) => {
        if (failures.has(`${String(k)}.${String(method)}`)) throw Error('Injected persistence failure');
        return m[method](...args);
      }; } });
    } })) : fn, options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const h = await authHarness('postgres', db); await h.issue();
  const businessId = h.businesses[0].id;
  const plans = await Promise.all(['A', 'B', 'C'].map(name => postgres.recurringPlan.create({ data: { businessId, name, baseAmountCents: 100000, dueDay: 1, gracePeriodDays: 1 } })));
  const create = (index = 0, data = {}) => postgres.recurringCharge.create({ data: { recurringPlanId: plans[index].id, label: 'Water', amountCents: 1000, effectiveBillingCycle: '2027-01', endsAfterBillingCycle: '2027-02', ...data } });
  const item = (charge, data = {}) => ({ id: charge.id, clientKey: charge.id, sharedChargeGroupId: charge.sharedChargeGroupId, label: charge.label, amountCents: charge.amountCents, applyToAllTiers: false, ...data });
  const payload = (rows, advance = false) => ({ tiers: plans.map((p, index) => ({ recurringPlanId: p.id, charges: rows[index] ?? [] })), advance });
  const save = body => h.load('app/api/setup/recurring/charges/route.ts').PUT(h.request(body));
  const snapshot = () => postgres.recurringCharge.findMany({ where: { recurringPlan: { businessId } }, orderBy: { id: 'asc' } });
  const pricing = async index => {
    const plan = await postgres.recurringPlan.findUnique({ where: { id: plans[index].id }, include: { charges: true } });
    return ['2026-10','2026-12','2027-01','2027-02','2027-03'].map(cycle => h.load('lib/checkoutPricing.ts').calculateCheckoutPricing({ plan, paymentMethod: 'ACH', now: new Date(cycle + '-01T00:00:00Z') }).recurringChargesCents);
  };
  return { h, businessId, plans, create, item, payload, save, snapshot, pricing, failures };
}

pgTest('audit Jan-Feb range survives unchanged production-route save', async () => {
  const f = await fixture(), charge = await f.create();
  const before = await f.pricing(0); assert.deepEqual(before, [0,0,1000,1000,0]);
  assert.equal((await f.save(f.payload([[f.item(charge)]]))).status, 200);
  assert.deepEqual(await f.pricing(0), before);
  const [after] = await f.snapshot(); assert.equal(after.id, charge.id);
  assert.equal(after.effectiveBillingCycle, '2027-01'); assert.equal(after.endsAfterBillingCycle, '2027-02');
});

for (const edit of [{ amountCents: 2500 }, { label: 'Renamed water' }]) pgTest('amount/label-only edit retains identity and range: ' + JSON.stringify(edit), async () => {
  const f = await fixture(), c = await f.create();
  assert.equal((await f.save(f.payload([[f.item(c, edit)]]))).status, 200);
  assert.deepEqual(await f.pricing(0), [0,0,edit.amountCents ?? 1000,edit.amountCents ?? 1000,0]);
  const [saved] = await f.snapshot(); assert.equal(saved.id, c.id); assert.equal(saved.createdAt.getTime(), c.createdAt.getTime());
});
for (const [start,end,expected] of [[null,null,[1000,1000,1000,1000,1000]],['2027-01',null,[0,0,1000,1000,1000]],[null,'2027-02',[1000,1000,1000,1000,0]]]) pgTest('preserves unrestricted/one-sided range ' + JSON.stringify([start,end]), async () => {
  const f = await fixture(), c = await f.create(0, { effectiveBillingCycle: start, endsAfterBillingCycle: end });
  assert.deepEqual(await f.pricing(0), expected);
  assert.equal((await f.save(f.payload([[f.item(c)]]))).status, 200); assert.deepEqual(await f.pricing(0), expected);
});
pgTest('new default/explicit applicability, retained edit and removal form one diff', async () => {
  const f = await fixture(), c = await f.create(), removed = await f.create(1);
  const fresh = f.item(c, { id: null, clientKey: 'new', label: 'New charge' });
  assert.equal((await f.save(f.payload([[f.item(c),fresh],[{...fresh,clientKey:'limited',effectiveBillingCycle:'2027-01',endsAfterBillingCycle:'2027-02'}]]))).status, 200);
  assert.equal(await postgres.recurringCharge.findUnique({ where: { id: removed.id } }), null);
  const rows = await f.snapshot(); assert.equal(rows.length, 3);
  const unrestricted = rows.find(row => row.recurringPlanId === f.plans[0].id && row.id !== c.id);
  assert.equal(unrestricted.effectiveBillingCycle, null); assert.equal(unrestricted.endsAfterBillingCycle, null);
  assert.deepEqual(await f.pricing(1), [0,0,1000,1000,0]);
});
pgTest('explicit supported boundary edits validate and affect only future pricing', async () => {
  const f = await fixture(), c = await f.create();
  assert.equal((await f.save(f.payload([[f.item(c,{effectiveBillingCycle:null,endsAfterBillingCycle:'2027-01'})]]))).status, 200);
  assert.deepEqual(await f.pricing(0), [1000,1000,1000,0,0]);
});
pgTest('same labels/amounts across and within tiers never exchange applicability', async () => {
  const f = await fixture(), a = await f.create(), b = await f.create(0, { effectiveBillingCycle:'2026-10',endsAfterBillingCycle:'2026-12' }), c = await f.create(1, { effectiveBillingCycle:null,endsAfterBillingCycle:null });
  assert.equal((await f.save(f.payload([[f.item(b,{label:'Changed'}),f.item(a)],[f.item(c)]]))).status, 200);
  const rows = new Map((await f.snapshot()).map(row=>[row.id,row]));
  for(const original of [a,b,c]) { assert.equal(rows.get(original.id).effectiveBillingCycle, original.effectiveBillingCycle); assert.equal(rows.get(original.id).endsAfterBillingCycle,original.endsAfterBillingCycle); }
});
pgTest('shared all-tier unchanged save preserves each record and range', async () => {
  const f = await fixture(), group = crypto.randomUUID(), rows = await Promise.all([0,1,2].map(index=>f.create(index,{sharedChargeGroupId:group})));
  assert.equal((await f.save(f.payload(rows.map(c=>[f.item(c,{applyToAllTiers:true})])))).status, 200);
  for(let n=0;n<3;n++) assert.deepEqual(await f.pricing(n),[0,0,1000,1000,0]);
  assert.deepEqual((await f.snapshot()).map(c=>c.id).sort(),rows.map(c=>c.id).sort());
});
pgTest('single to shared to selected tiers preserves source applicability and owned replicas', async () => {
  const f = await fixture(), c = await f.create();
  assert.equal((await f.save(f.payload([[f.item(c,{sourceChargeId:c.id,applyToAllTiers:true})]]))).status, 200);
  let rows = await f.snapshot(); assert.equal(rows.length,3); assert.ok(rows.some(r=>r.id===c.id));
  for(const row of rows) assert.equal(row.effectiveBillingCycle,'2027-01');
  const selected = [0,2].map(i=>rows.find(r=>r.recurringPlanId===f.plans[i].id));
  assert.equal((await f.save(f.payload([[f.item(selected[0],{sourceChargeId:c.id})],[],[f.item(selected[1],{sourceChargeId:c.id})]]))).status,200);
  rows=await f.snapshot(); assert.equal(rows.length,2); assert.ok(rows.every(r=>r.sharedChargeGroupId)); assert.deepEqual(await f.pricing(1),[0,0,0,0,0]);
});
pgTest('moving a charge uses explicit owned source ID, not label, and retains identity', async () => {
  const f = await fixture(), c = await f.create();
  assert.equal((await f.save(f.payload([[],[f.item(c,{id:null,sourceChargeId:c.id})]]))).status,200);
  const [row] = await f.snapshot(); assert.equal(row.id,c.id); assert.equal(row.recurringPlanId,f.plans[1].id); assert.deepEqual(await f.pricing(1),[0,0,1000,1000,0]);
});
pgTest('new selected multi-tier logical charge stays one shared identity on subsequent expansion', async () => {
  const f=await fixture(), fresh={id:null,clientKey:'draft:A',logicalChargeKey:'draft',sharedChargeGroupId:null,label:'Water',amountCents:1000,applyToAllTiers:false,effectiveBillingCycle:'2027-01',endsAfterBillingCycle:'2027-02'};
  assert.equal((await f.save(f.payload([[fresh],[{...fresh,clientKey:'draft:B'}]]))).status,200);
  const rows=await f.snapshot(); assert.equal(rows.length,2); assert.equal(rows[0].sharedChargeGroupId,rows[1].sharedChargeGroupId); assert.ok(rows[0].sharedChargeGroupId);
  const source=rows[0]; assert.equal((await f.save(f.payload(rows.map(row=>[f.item(row,{sourceChargeId:source.id,applyToAllTiers:true})])))).status,200);
  assert.deepEqual(await f.pricing(2),[0,0,1000,1000,0]);
});
pgTest('divergent historical shared ranges remain per-tier; ambiguous new replica rejected', async()=>{
  const f=await fixture(), group=crypto.randomUUID(), a=await f.create(0,{sharedChargeGroupId:group}), b=await f.create(1,{sharedChargeGroupId:group,effectiveBillingCycle:'2026-10'});
  assert.equal((await f.save(f.payload([[f.item(a)],[f.item(b)]]))).status,200);
  const before=await f.snapshot(); assert.equal((await f.save(f.payload([[f.item(a,{applyToAllTiers:true})],[f.item(b,{applyToAllTiers:true})]]))).status,400); assert.deepEqual(await f.snapshot(),before);
});
pgTest('inactive charge is neither reactivated nor deleted by an ordinary save', async()=>{
  const f=await fixture(), c=await f.create(0,{isActive:false});
  assert.equal((await f.save(f.payload([]))).status,200); assert.deepEqual(await postgres.recurringCharge.findUnique({where:{id:c.id}}),c);
  assert.equal((await f.save(f.payload([[f.item(c)]]))).status,200); assert.equal((await f.snapshot())[0].isActive,false);
});
for(const attack of ['bad month','empty cycle','reversed range','bad stored cycle','unknown ID','missing ID','duplicate ID','wrong tier','foreign ID','foreign source','forged group','different logical sources','duplicate tiers','invalid amount','inconsistent shared edit','expanded pricing overflow']) pgTest('atomic rejection: '+attack,async()=>{
  const f=await fixture(), c=await f.create(), old=await f.create(1), item=f.item(c,{label:'Edit must roll back'}); let body=f.payload([[item],[f.item(old)]]);
  if(attack==='bad month') item.effectiveBillingCycle='2027-13';
  if(attack==='empty cycle') item.endsAfterBillingCycle='';
  if(attack==='reversed range') item.effectiveBillingCycle='2027-03';
  if(attack==='bad stored cycle') await postgres.recurringCharge.update({where:{id:c.id},data:{effectiveBillingCycle:'bad'}});
  if(attack==='unknown ID') item.id='forged';
  if(attack==='missing ID') delete item.id;
  if(attack==='duplicate ID') body.tiers[0].charges.push({...item,clientKey:'duplicate'});
  if(attack==='wrong tier') {body.tiers[0].charges=[]; body.tiers[2].charges=[item];}
  if(attack==='foreign ID'||attack==='foreign source') {const p=await postgres.recurringPlan.create({data:{businessId:f.h.businesses[1].id,name:'Foreign',baseAmountCents:100000,dueDay:1}}), foreign=await postgres.recurringCharge.create({data:{recurringPlanId:p.id,label:'Foreign',amountCents:100}}); item[attack==='foreign ID'?'id':'sourceChargeId']=foreign.id;}
  if(attack==='forged group') item.sharedChargeGroupId='forged';
  if(attack==='different logical sources') {item.logicalChargeKey='same';body.tiers[1].charges[0].logicalChargeKey='same';}
  if(attack==='duplicate tiers') body.tiers[1].recurringPlanId=body.tiers[0].recurringPlanId;
  if(attack==='invalid amount') body.tiers[1].charges[0].amountCents=-1;
  if(attack==='inconsistent shared edit') {item.applyToAllTiers=true; body.tiers[1].charges=[{...item,id:null,sourceChargeId:c.id,label:'Conflicting'}];}
  if(attack==='expanded pricing overflow') {await postgres.recurringPlan.update({where:{id:f.plans[2].id},data:{baseAmountCents:499500}});item.applyToAllTiers=true;}
  const before=await f.snapshot(); assert.equal((await f.save(body)).status,400); assert.deepEqual(await f.snapshot(),before);
});
for(const failure of ['recurringCharge.update','recurringCharge.create','recurringCharge.deleteMany','auditLog.create']) pgTest('database/audit failure rolls back full diff: '+failure,async()=>{
  const f=await fixture(), c=await f.create(); await f.create(1); await postgres.business.update({where:{id:f.businessId},data:{setupCompletedAt:null}});
  const before=await f.snapshot(), business=await postgres.business.findUnique({where:{id:f.businessId}}), audit=await postgres.auditLog.count({where:{businessId:f.businessId}});
  f.failures.add(failure); assert.equal((await f.save(f.payload([[f.item(c,{amountCents:2000}),f.item(c,{id:null,clientKey:'new'})]],true))).status,500);
  assert.deepEqual(await f.snapshot(),before); assert.deepEqual(await postgres.business.findUnique({where:{id:f.businessId}}),business); assert.equal(await postgres.auditLog.count({where:{businessId:f.businessId}}),audit);
});
for(const change of ['reset','disable']) pgTest('authority changed before delayed retained-charge save: '+change,async()=>{
  const f=await fixture(), c=await f.create(); let entered,release; const ready=new Promise(r=>entered=r), wait=new Promise(r=>release=r);
  const pending=f.h.load('app/api/setup/recurring/charges/route.ts').PUT({json:async()=>{entered();await wait;return f.payload([[f.item(c,{amountCents:2500})]]);}}); await ready;
  if(change==='reset') {await f.h.issue('ADMIN'); assert.equal((await f.h.reset()).status,200);} else await postgres.business.update({where:{id:f.businessId},data:{status:'DISABLED'}});
  const before=await f.snapshot(); release(); assert.equal((await pending).status,401); assert.deepEqual(await f.snapshot(),before);
});
pgTest('configuration save never changes existing checkout/payment/receipt snapshots or platform fees',async()=>{
  const f=await fixture(), c=await f.create();
  const pricing=f.h.load('lib/checkoutPricing.ts').calculateCheckoutPricing({plan:{...f.plans[0],charges:[c]},paymentMethod:'ACH',now:new Date('2027-01-01T00:00:00Z')});
  const checkout=await postgres.checkoutSession.create({data:{businessId:f.businessId,accountCode:'AA-1111',planId:f.plans[0].id,unitNumber:'101',firstName:'Test',lastName:'Payer',phone:'5555551234',paymentMethod:'ACH',billingCycle:pricing.billingCycle,baseAmountCents:pricing.baseAmountCents,recurringChargesCents:pricing.recurringChargesCents,initialLateFeeCents:pricing.initialLateFeeCents,dailyLateFeesCents:pricing.dailyLateFeesCents,subtotalCents:pricing.subtotalCents,platformFeeCents:pricing.platformFeeCents,totalCents:pricing.totalChargedCents,dueDate:pricing.dueDate,graceEndsAt:pricing.graceEndsAt,lineItems:pricing.lineItems,expiresAt:new Date(Date.now()+60000)}});
  const payment=await postgres.payment.create({data:{businessId:f.businessId,sourceType:'RECURRING_PLAN',sourceId:f.plans[0].id,status:'PAID',paidAt:new Date(),paymentMethod:'ACH',payerFirstName:'Test',payerLastName:'Payer',payerPhone:'5555551234',referenceLabel:'101',itemDescription:'Rent',billingCycle:pricing.billingCycle,subtotalCents:pricing.subtotalCents,platformFeeCents:pricing.platformFeeCents,totalChargedCents:pricing.totalChargedCents,businessProceedsCents:pricing.subtotalCents,lineItemsSnapshot:pricing.lineItems,stripeCheckoutSessionId:'cs_snapshot_'+checkout.id}});
  const linkedCheckout=await postgres.checkoutSession.update({where:{id:checkout.id},data:{status:'PAID',paymentId:payment.id,stripeCheckoutSessionId:payment.stripeCheckoutSessionId}});
  const receipt=await postgres.smsReceipt.create({data:{paymentId:payment.id,phone:payment.payerPhone,status:'QUEUED'}});
  assert.equal((await f.save(f.payload([[f.item(c,{amountCents:2500})]]))).status,200);
  assert.deepEqual(await postgres.checkoutSession.findUnique({where:{id:checkout.id}}),linkedCheckout); assert.deepEqual(await postgres.payment.findUnique({where:{id:payment.id}}),payment); assert.deepEqual(await postgres.smsReceipt.findUnique({where:{id:receipt.id}}),receipt);
  const business=await postgres.business.findUnique({where:{id:f.businessId},include:{recurringPlans:{include:{charges:true}}}});
  business.accountCode='AA-1111'; assert.deepEqual(f.h.load('lib/paymentReadiness.ts').getConfigurationReasons(business),[]);
});

pgTest('real manager client amount edit and tier move send stable source identity to production route', async()=>{
  const { build } = await import('esbuild'), { chromium } = await import('@playwright/test');
  const f=await fixture(), c=await f.create(), requests=[];
  const initialTiers=f.plans.map(plan=>({recurringPlanId:plan.id,name:plan.name,baseAmount:'1000.00',charges:plan.id===c.recurringPlanId?[{id:c.id,sharedChargeGroupId:null,label:c.label,amount:'10.00',applyToAllTiers:false}]:[]}));
  const bundle=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Client from './app/setup/recurring/charges/RecurringChargesClient.tsx'; createRoot(document.getElementById('root')).render(React.createElement(Client,window.props));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'isolated-navigation',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children);}`:`export const useRouter=()=>({push(){}});export const useSearchParams=()=>new URLSearchParams('mode=settings');`,loader:'js',resolveDir:process.cwd()}));}}]});
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.route('https://example.test/**',async route=>{
      if(route.request().method()==='PUT') {
        const body=route.request().postDataJSON(); requests.push(body); const response=await f.save(body);
        await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
      } else await route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
    });
    await page.goto('https://example.test/setup/recurring/charges'); await page.evaluate(props=>{window.props=props;},{initialTiers,highestReachedStep:7}); await page.addScriptTag({content:bundle.outputFiles[0].text});
    let saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.status()===200);
    await page.locator('input[id^="charge-amount-"]').fill('25.00'); await saved;
    assert.equal(requests[0].tiers[0].charges[0].sourceChargeId,c.id); assert.equal(requests[0].tiers[0].charges[0].id,c.id); assert.deepEqual(await f.pricing(0),[0,0,2500,2500,0]);
    await page.getByRole('checkbox').nth(0).uncheck();
    saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.status()===200);
    await page.getByRole('checkbox').nth(1).check(); await saved;
    const last=requests.at(-1).tiers[1].charges[0]; assert.equal(last.id,null); assert.equal(last.sourceChargeId,c.id);
    const [row]=await f.snapshot(); assert.equal(row.id,c.id); assert.equal(row.recurringPlanId,f.plans[1].id); assert.deepEqual(await f.pricing(1),[0,0,2500,2500,0]);
  } finally {await browser.close();}
});
