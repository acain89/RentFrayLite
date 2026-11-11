import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { tierFixture, postgres } from './helpers/tier-configuration-harness.mjs';

const backends=postgres?['isolated','postgres']:['isolated'];
const rule=(overrides={})=>({dueDay:1,gracePeriodDays:3,initialLateFeeCents:100,dailyLateFeeCents:20,dailyLateFeeMaxDays:3,...overrides});
async function ok(response){assert.equal(response.status,200,await response.clone().text());return response.json();}

for(const backend of backends){
 test(`${backend}: create 1000 tiers incrementally from an empty property with safe retries`,async()=>{
  const f=await tierFixture(backend,0),ids=new Set();
  for(let n=1;n<=1000;n++){
    const input={operation:'tier',requestId:randomUUID(),name:'Increment '+n,amountCents:10000+n};
    const saved=await ok(await f.send('tiers',input));assert.ok(!ids.has(saved.id));ids.add(saved.id);
    if([1,250,251,500,1000].includes(n)){assert.equal((await f.page()).total,n);assert.equal((await ok(await f.send('tiers',input))).id,saved.id);assert.equal((await f.page()).total,n);}
  }
  assert.equal(ids.size,1000);
 });
 for(const count of [1,250,251,500,1000])test(`${backend}: ${count} tiers paginate, create incrementally, edit and remove without a total cap`,async()=>{
  const f=await tierFixture(backend,count),ids=new Set();let cursor=null,pages=0;
  do{const page=await f.page(cursor);assert.equal(page.total,count);assert.ok(page.tiers.length<=50);for(const tier of page.tiers){assert.ok(!ids.has(tier.id));ids.add(tier.id);assert.equal(tier.baseAmountCents,10000+tier.sortOrder);}cursor=page.nextCursor;pages++;}while(cursor);
  assert.equal(ids.size,count);assert.equal(pages,Math.ceil(count/50));
  const request={operation:'tier',requestId:randomUUID(),name:'Incremental tier',amountCents:12345};
  const responses=await Promise.all([f.send('tiers',request),f.send('tiers',request)]);const saved=await ok(responses[0]),replayed=await ok(responses[1]);assert.equal(saved.id,replayed.id);assert.ok(saved.replayed===true||replayed.replayed===true);
  assert.equal(await f.db.recurringPlan.count({where:{businessId:f.businessId,isActive:true}}),count+1);
  const created=await f.row(saved.id);assert.equal(created.baseAmountCents,12345);assert.equal(created.dueDay,1);assert.equal(created.gracePeriodDays,5);
  await ok(await f.send('tiers',{operation:'tier',id:saved.id,version:await f.version(saved.id),name:'Edited tier',amountCents:12567}));
  assert.equal((await f.row(saved.id)).baseAmountCents,12567);assert.equal((await f.row(f.first.id)).baseAmountCents,10000);
  await ok(await f.send('tiers',{operation:'removeTier',id:saved.id,version:await f.version(saved.id)}));
  assert.equal((await f.row(saved.id)).isActive,false);assert.equal(await f.db.recurringPlan.count({where:{businessId:f.businessId,isActive:true}}),count);
 });
 test(`${backend}: 1000-tier shared charges, shared billing, inheritance and individual rules preserve identities`,async()=>{
  const f=await tierFixture(backend,1000);let page=await f.page();
  await ok(await f.send('billing',{operation:'billing',id:f.first.id,version:page.version,shared:true,rule:rule()}));
  assert.equal(await f.db.recurringPlan.count({where:{businessId:f.businessId,isActive:true,gracePeriodDays:3}}),1000);
  page=await f.page();const change={operation:'charge',requestId:randomUUID(),id:f.first.id,version:page.version,shared:true,charge:{label:'Mandatory water',amountCents:200,effectiveBillingCycle:'2027-01',endsAfterBillingCycle:'2027-02'}};
  await ok(await f.send('charges',change));await ok(await f.send('charges',change));
  const before=await f.row(f.first.id),source=before.charges[0];assert.equal(await f.db.recurringCharge.count({where:{sharedChargeGroupId:source.sharedChargeGroupId}}),1000);
  const created=await ok(await f.send('tiers',{operation:'tier',name:'Inherited tier',amountCents:15000}));
  const inherited=await f.row(created.id);assert.equal(inherited.gracePeriodDays,3);assert.equal(inherited.initialLateFeeCents,100);assert.equal(inherited.charges.length,1);assert.equal(inherited.charges[0].sharedChargeGroupId,source.sharedChargeGroupId);assert.equal(inherited.charges[0].effectiveBillingCycle,'2027-01');
  await ok(await f.send('billing',{operation:'billing',id:f.first.id,version:await f.version(f.first.id),shared:false,rule:rule({gracePeriodDays:4,initialLateFeeCents:150})}));
  assert.equal((await f.row(created.id)).gracePeriodDays,3);assert.equal((await f.row(f.first.id)).gracePeriodDays,4);
  page=await f.page();await ok(await f.send('charges',{operation:'charge',id:f.first.id,version:page.version,shared:true,charge:{id:source.id,label:'Renamed water',amountCents:225}}));
  const after=await f.row(f.first.id);assert.equal(after.charges[0].id,source.id);assert.equal(after.charges[0].effectiveBillingCycle,'2027-01');assert.equal(after.charges[0].endsAfterBillingCycle,'2027-02');
  assert.equal((await f.row(created.id)).charges[0].amountCents,225);
  await ok(await f.send('charges',{operation:'charge',id:f.first.id,version:await f.version(f.first.id),shared:false,charge:{id:source.id,label:'Individual water',amountCents:250}}));
  assert.equal((await f.row(f.first.id)).charges[0].sharedChargeGroupId,null);assert.equal((await f.row(created.id)).charges[0].amountCents,225);
  const shared=(await f.row(created.id)).charges[0];page=await f.page();
  const removal={operation:'charge',requestId:randomUUID(),id:created.id,version:page.version,shared:true,remove:true,charge:{id:shared.id,label:shared.label,amountCents:shared.amountCents}};
  await ok(await f.send('charges',removal));await ok(await f.send('charges',removal));
  assert.equal(await f.db.recurringCharge.count({where:{sharedChargeGroupId:shared.sharedChargeGroupId,isActive:true}}),0);assert.equal((await f.row(f.first.id)).charges[0].isActive,true);
 });
 test(`${backend}: conflicting shared applicability is never fabricated for a new or edited tier`,async()=>{
  const f=await tierFixture(backend,2);let page=await f.page();
  await ok(await f.send('charges',{operation:'charge',id:f.first.id,version:page.version,shared:true,charge:{label:'Ranged',amountCents:100,effectiveBillingCycle:'2027-01',endsAfterBillingCycle:'2027-02'}}));
  const other=await f.db.recurringPlan.findFirst({where:{businessId:f.businessId,id:{not:f.first.id}},include:{charges:true}});
  await f.db.recurringCharge.update({where:{id:other.charges[0].id},data:{effectiveBillingCycle:null}});
  const original=await f.row(f.first.id);page=await f.page();
  assert.equal((await f.send('tiers',{operation:'tier',name:'Unsafe inheritance',amountCents:10000})).status,409);
  assert.equal((await f.send('charges',{operation:'charge',id:f.first.id,version:page.version,shared:true,charge:{id:original.charges[0].id,label:'Changed',amountCents:200}})).status,409);
  assert.deepEqual(await f.row(f.first.id),original);assert.equal(await f.db.recurringPlan.count({where:{businessId:f.businessId}}),2);
 });
 test(`${backend}: a subset charge group is not mistaken for all-tier applicability`,async()=>{
  const f=await tierFixture(backend,3),plans=await f.db.recurringPlan.findMany({where:{businessId:f.businessId},orderBy:{sortOrder:'asc'}});
  for(const plan of plans.slice(0,2))await f.db.recurringCharge.create({data:{recurringPlanId:plan.id,sharedChargeGroupId:'subset-group',label:'Subset charge',amountCents:100}});
  let page=await f.page();assert.equal(page.tiers[0].charges[0].applyToAllTiers,false);assert.equal(page.tiers[1].charges[0].applyToAllTiers,false);
  await ok(await f.send('charges',{operation:'charge',id:plans[0].id,version:page.tiers[0].version,shared:false,charge:{id:page.tiers[0].charges[0].id,label:'Individual charge',amountCents:150}}));
  assert.equal((await f.row(plans[1].id)).charges[0].amountCents,100);assert.equal((await f.row(plans[2].id)).charges.length,0);
  page=await f.page();await ok(await f.send('charges',{operation:'charge',id:plans[1].id,version:page.version,shared:true,charge:{id:page.tiers[1].charges[0].id,label:'Explicit all-tier charge',amountCents:100}}));
  page=await f.page();assert.ok(page.tiers.every(t=>t.charges.some(c=>c.sharedChargeGroupId==='subset-group'&&c.applyToAllTiers)));
 });
 test(`${backend}: concurrent unrelated edits commit; competing edits reject stale revisions`,async()=>{
  const f=await tierFixture(backend,2),page=await f.page(),[a,b]=page.tiers;
  const results=await Promise.all([f.send('tiers',{operation:'tier',id:a.id,version:a.version,name:'A edited',amountCents:12000}),f.send('tiers',{operation:'tier',id:b.id,version:b.version,name:'B edited',amountCents:13000})]);for(const r of results)await ok(r);
  const version=await f.version(a.id),competing=await Promise.all([f.send('tiers',{operation:'tier',id:a.id,version,name:'A first',amountCents:14000}),f.send('tiers',{operation:'tier',id:a.id,version,name:'A second',amountCents:15000})]);
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);assert.equal((await f.row(b.id)).baseAmountCents,13000);
  assert.equal((await f.send('billing',{operation:'billing',shared:true,version:page.version,rule:rule()})).status,409);
 });
 test(`${backend}: request-ID reuse cannot create duplicates or silently change the requested operation`,async()=>{
  const f=await tierFixture(backend),request={operation:'tier',requestId:randomUUID(),name:'Durable retry',amountCents:12345};
  const saved=await ok(await f.send('tiers',request));const count=await f.db.recurringPlan.count({where:{businessId:f.businessId}});
  assert.equal((await f.send('tiers',{...request,amountCents:22222})).status,409);assert.equal(await f.db.recurringPlan.count({where:{businessId:f.businessId}}),count);assert.equal((await f.row(saved.id)).baseAmountCents,12345);
 });
 test(`${backend}: small-property autosave crosses into pagination without losing shared configuration`,async()=>{
  const f=await tierFixture(backend,50);let page=await f.page();
  await ok(await f.send('billing',{operation:'billing',shared:true,version:page.version,rule:rule()}));page=await f.page();
  await ok(await f.send('charges',{operation:'charge',id:f.first.id,version:page.version,shared:true,charge:{label:'Shared before pagination',amountCents:100}}));page=await f.page();
  const input={expectedVersion:page.legacyVersion,tiers:[...page.tiers.map(t=>({id:t.id,clientKey:t.id,name:t.name,amountCents:t.baseAmountCents})),{id:null,clientKey:'boundary-new',name:'Tier 0051',amountCents:12345}]};
  const api=f.load('app/api/setup/recurring/tiers/route.ts'),saved=await ok(await api.PUT(f.request(input))),added=saved.tiers.find(t=>t.clientKey==='boundary-new');
  assert.equal((await f.row(added.id)).gracePeriodDays,3);assert.equal((await f.row(added.id)).charges.length,1);
  page=await f.page();assert.equal(page.total,51);assert.ok(page.nextCursor);assert.equal(page.legacyVersion,undefined);
  assert.equal((await api.PUT(f.request(input))).status,409);await ok(await f.send('tiers',{operation:'tier',name:'Tier 0052',amountCents:10000}));assert.equal((await f.page()).total,52);
 });
 test(`${backend}: existing per-tier charge limit remains independent of unlimited tier count`,async()=>{
  const f=await tierFixture(backend,251);await f.db.recurringCharge.createMany({data:Array.from({length:250},(_,i)=>({recurringPlanId:f.first.id,label:'Charge '+i,amountCents:1}))});
  const page=await f.page();
  assert.equal((await f.send('charges',{operation:'charge',id:f.first.id,version:await f.version(f.first.id),shared:false,charge:{label:'Excess',amountCents:1}})).status,400);
  assert.equal((await f.send('charges',{operation:'charge',id:f.first.id,version:page.version,shared:true,charge:{label:'Excess everywhere',amountCents:1}})).status,400);
  assert.equal(await f.db.recurringCharge.count({where:{recurringPlan:{businessId:f.businessId}}}),250);assert.equal((await f.page()).total,251);
 });
 test(`${backend}: shared financial ceiling failure rolls back every replica and audit record`,async()=>{
  const f=await tierFixture(backend,251);await f.db.recurringPlan.update({where:{id:f.first.id},data:{baseAmountCents:499900}});
  const page=await f.page(),before=await f.row(f.first.id),audits=await f.db.auditLog.count({where:{businessId:f.businessId}});
  const response=await f.send('charges',{operation:'charge',id:f.first.id,version:page.version,shared:true,charge:{label:'Too much',amountCents:200}});
  assert.equal(response.status,400);assert.equal(await f.db.recurringCharge.count({where:{recurringPlan:{businessId:f.businessId}}}),0);assert.deepEqual(await f.row(f.first.id),before);assert.equal(await f.db.auditLog.count({where:{businessId:f.businessId}}),audits);
 });
 test(`${backend}: mandatory charges and late fees constrain an individual tier-price edit`,async()=>{
  const f=await tierFixture(backend),page=await f.page();await ok(await f.send('charges',{operation:'charge',id:f.first.id,version:page.tiers[0].version,shared:false,charge:{label:'Required',amountCents:1000}}));
  await ok(await f.send('billing',{operation:'billing',id:f.first.id,version:await f.version(f.first.id),shared:false,rule:rule({initialLateFeeCents:1000,dailyLateFeeCents:100,dailyLateFeeMaxDays:3})}));
  const before=await f.row(f.first.id);assert.equal((await f.send('tiers',{operation:'tier',id:f.first.id,version:await f.version(f.first.id),name:before.name,amountCents:499000})).status,400);assert.deepEqual(await f.row(f.first.id),before);
 });
 test(`${backend}: legacy calendar conversion requires confirmation and keeps due day fixed`,async()=>{
  const f=await tierFixture(backend);await f.db.recurringPlan.update({where:{id:f.first.id},data:{dueDay:15,gracePeriodDays:1}});
  const input={operation:'billing',id:f.first.id,version:await f.version(f.first.id),shared:false,rule:rule()};assert.equal((await f.send('billing',input)).status,409);
  await ok(await f.send('billing',{...input,confirmCalendarChange:true}));assert.equal((await f.row(f.first.id)).dueDay,1);
  for(const gracePeriodDays of [1,2,6])assert.equal((await f.send('billing',{...input,rule:rule({gracePeriodDays})})).status,400);
 });
 test(`${backend}: tenant payment and checkout snapshots survive tier editing and removal`,async()=>{
  const f=await tierFixture(backend,2),plan=f.first;
  const payment=await f.db.payment.create({data:{businessId:f.businessId,sourceType:'RECURRING_PLAN',sourceId:plan.id,status:'PAID',paymentMethod:'ACH',payerFirstName:'Historical',payerLastName:'Fixture',payerPhone:'3125550100',itemDescription:'Original rent',lineItemsSnapshot:[{type:'BASE_AMOUNT',label:'Original rent',amountCents:10000}],subtotalCents:10000,platformFeeCents:395,totalChargedCents:10395,businessProceedsCents:10000,paidAt:new Date('2026-01-01T00:00:00Z')}});
  const checkout=await f.db.checkoutSession.create({data:{businessId:f.businessId,accountCode:'AA-1111',sourceType:'RECURRING_PLAN',planId:plan.id,billingCycle:'2026-01',unitNumber:'101',firstName:'Historical',lastName:'Fixture',phone:'3125550100',paymentMethod:'ACH',baseAmountCents:10000,recurringChargesCents:0,initialLateFeeCents:0,dailyLateFeesCents:0,subtotalCents:10000,platformFeeCents:395,totalCents:10395,lineItems:[{type:'BASE_AMOUNT',label:'Original rent',amountCents:10000}],dueDate:new Date('2026-01-01'),graceEndsAt:new Date('2026-01-06'),expiresAt:new Date('2026-01-01')}});
  await ok(await f.send('tiers',{operation:'tier',id:plan.id,version:await f.version(plan.id),name:'Current rent',amountCents:15000}));await ok(await f.send('tiers',{operation:'removeTier',id:plan.id,version:await f.version(plan.id)}));
  assert.deepEqual(await f.db.payment.findUnique({where:{id:payment.id}}),payment);assert.deepEqual(await f.db.checkoutSession.findUnique({where:{id:checkout.id}}),checkout);
 });
 test(`${backend}: cross-property identifiers, cursors and origins fail closed`,async()=>{
  const f=await tierFixture(backend),foreign=await f.db.recurringPlan.create({data:{businessId:f.businesses[1].id,name:'Foreign',baseAmountCents:10000,dueDay:1,gracePeriodDays:5}}),version=await f.version(foreign.id);
  for(const [section,body]of [['tiers',{operation:'tier',id:foreign.id,version,name:'Stolen',amountCents:1}],['tiers',{operation:'removeTier',id:foreign.id,version}],['billing',{operation:'billing',id:foreign.id,version,shared:false,rule:rule()}],['charges',{operation:'charge',id:foreign.id,version:(await f.page()).version,shared:true,charge:{label:'Foreign',amountCents:100}}]])assert.equal((await f.send(section,body)).status,404);
  const response=await f.load('app/api/setup/recurring/tiers/route.ts').GET(new Request('https://example.test/api?cursor='+foreign.id));assert.equal(response.status,400);
  assert.equal((await f.send('tiers',{operation:'tier',name:'Origin',amountCents:100},{origin:'https://attacker.test','x-forwarded-host':'example.test'})).status,403);
  assert.equal((await f.row(foreign.id)).name,'Foreign');
 });
 test(`${backend}: expired management session cannot edit tier configuration`,async()=>{
  const f=await tierFixture(backend);await f.db.session.updateMany({where:{businessId:f.businessId},data:{expiresAt:new Date(0)}});
  assert.equal((await f.send('tiers',{operation:'tier',name:'Unauthorized',amountCents:100})).status,401);assert.equal(await f.db.recurringPlan.count({where:{businessId:f.businessId}}),1);
 });
 test(`${backend}: request-size limits cover declared and chunked payloads`,async()=>{
  const f=await tierFixture(backend),api=f.load('app/api/setup/recurring/tiers/route.ts');
  assert.equal((await f.send('tiers',{operation:'tier',name:'Large',amountCents:100},{'content-length':String(2*1024*1024)})).status,413);
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024+1));controller.close();}});
  assert.equal((await api.PATCH(new Request('https://example.test/api',{method:'PATCH',headers:{origin:'https://example.test','content-type':'application/json'},body:stream,duplex:'half'}))).status,413);
 });
 test(`${backend}: small-property bulk setup preserves behavior and rejects missing/stale revisions`,async()=>{
  const f=await tierFixture(backend,0),api=f.load('app/api/setup/recurring/tiers/route.ts'),input={tiers:[{id:null,clientKey:'small',name:'Small property',amountCents:12345}]};
  assert.equal((await api.PUT(f.request(input))).status,428);
  const expectedVersion=f.load('lib/recurringConfiguration.ts').configurationFingerprint([]),r=await api.PUT(f.request({...input,expectedVersion}));await ok(r);
  assert.equal((await api.PUT(f.request({...input,expectedVersion}))).status,409);const rows=await f.db.recurringPlan.findMany({where:{businessId:f.businessId}});assert.equal(rows.length,1);assert.equal(rows[0].dueDay,1);assert.equal(rows[0].gracePeriodDays,5);
 });
}
