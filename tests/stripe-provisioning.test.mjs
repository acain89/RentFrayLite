import assert from 'node:assert/strict';import test from 'node:test';
import{provisioningFixture,postgres}from'./helpers/stripe-foundation-harness.mjs';
for(const [label,headers] of [
 ['missing',{}],
 ['forged forwarded headers',{'x-forwarded-host':'example.test','x-forwarded-proto':'https'}],
 ['cross-origin',{origin:'https://attacker.test'}],
 ['null',{origin:'null'}],
 ['wrong scheme',{origin:'http://example.test'}],
 ['wrong port',{origin:'https://example.test:444'}],
 ['cross-site',{origin:'https://example.test','sec-fetch-site':'cross-site'}],
])test(`Connect ${label} origin rejects before authentication, storage or provider work`,async()=>{
 const f=await provisioningFixture('isolated');let authReads=0,providerAccess=0;
 f.mocks['@/lib/session']={...f.session,getCurrentSession:async()=>{authReads++;throw Error('Unexpected authentication read');}};
 f.mocks['@/lib/stripe']={getStripeClient:()=>{providerAccess++;throw Error('Unexpected provider access');}};
 const audits=await f.db.auditLog.findMany({where:{businessId:f.identity.businessId}});
 const response=await f.connect(headers);
 assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Invalid request origin.'});
 assert.equal(authReads,0);assert.equal(providerAccess,0);assert.equal(f.state.reads,0);
 assert.equal(f.state.createCalls.length,0);assert.equal(f.state.links,0);assert.equal(f.state.accounts.size,0);
 assert.equal(await f.journal(),null);assert.equal(await f.db.stripeConnection.count({where:{businessId:f.identity.businessId}}),0);
 assert.deepEqual(await f.db.auditLog.findMany({where:{businessId:f.identity.businessId}}),audits);
});
for(const backend of postgres?['isolated','postgres']:['isolated']){
 const label=backend+' provisioning';
 test(label+': concurrent onboarding creates one durable journal, one account and one creation audit',async()=>{
  const f=await provisioningFixture(backend),responses=await Promise.all(Array.from({length:6},()=>f.connect()));assert.ok(responses.every(r=>r.status===200));
  assert.equal(f.state.accounts.size,1);assert.equal(f.state.createCalls.length,1);const journal=await f.journal();assert.equal(journal.stripeMode,'test');assert.equal(journal.stripePlatformAccountId,'acct_platform');assert.equal(journal.stripeAccountId,f.state.accountId);assert.equal(journal.chargeModel,'LEGACY_DESTINATION');
  const call=f.state.createCalls[0];assert.equal(call.options.idempotencyKey,'rfl-connect-v1-'+journal.id);assert.equal(call.params.type,'express');assert.deepEqual(call.params.capabilities,{transfers:{requested:true}});
  assert.equal(await f.db.auditLog.count({where:{businessId:f.identity.businessId,action:'STRIPE_ACCOUNT_CREATED'}}),1);
 });
 for(const fault of ['stripeConnection.create','stripeAccountProvisioning.update','auditLog.create'])test(label+': Stripe create followed by '+fault+' failure recovers with same frozen request/key',async()=>{
  const f=await provisioningFixture(backend),create=f.stripe.accounts.create;f.stripe.accounts.create=async(...args)=>{const account=await create(...args);f.fail(fault);return account;};assert.equal((await f.connect()).status,500);assert.equal(f.state.accounts.size,1);assert.equal(await f.db.stripeConnection.count({where:{businessId:f.identity.businessId}}),0);
  const before=await f.journal();assert.ok(before);f.stripe.accounts.create=create;f.fail(fault,false);await f.db.business.update({where:{id:f.identity.businessId},data:{name:'Changed after timeout',contactEmail:'changed@example.test'}});
  assert.equal((await f.connect()).status,200);assert.equal(f.state.accounts.size,1);assert.equal(f.state.createCalls.length,2);
  assert.deepEqual(f.state.createCalls[0],f.state.createCalls[1]);assert.equal((await f.journal()).id,before.id);assert.equal(await f.db.auditLog.count({where:{businessId:f.identity.businessId,action:'STRIPE_ACCOUNT_CREATED'}}),1);
 });
 test(label+': lost provider response recovers idempotently within the safe window',async()=>{
  const f=await provisioningFixture(backend);f.state.failCreate=true;assert.equal((await f.connect()).status,500);const journal=await f.journal();assert.ok(journal);assert.equal(f.state.accounts.size,1);
  f.state.failCreate=false;assert.equal((await f.connect()).status,200);assert.equal(f.state.accounts.size,1);assert.equal((await f.journal()).id,journal.id);
 });
 test(label+': aged ambiguous creation never repeats Stripe create and explicit verified recovery is idempotent',async()=>{
  const f=await provisioningFixture(backend);f.state.failCreate=true;await f.connect();const journal=await f.journal();await f.db.stripeAccountProvisioning.update({where:{id:journal.id},data:{createdAt:new Date(Date.now()-24*3600000)}});f.state.failCreate=false;
  const response=await f.connect();assert.equal(response.status,409);assert.equal((await response.json()).code,'STRIPE_PROVISIONING_UNVERIFIED');assert.equal(f.state.createCalls.length,1);
  const service=f.load('lib/stripeAccountProvisioning.ts'),platform={platformAccountId:'acct_platform',mode:'test'};
  const first=await service.recoverStripeProvisionedAccount(f.identity,f.stripe,f.state.accountId,platform),second=await service.recoverStripeProvisionedAccount(f.identity,f.stripe,f.state.accountId,platform);assert.equal(first.id,second.id);assert.equal(f.state.createCalls.length,1);
  assert.equal(await f.db.auditLog.count({where:{businessId:f.identity.businessId,action:'STRIPE_ACCOUNT_RECOVERED'}}),1);
 });
 for(const change of ['platform','mode','metadata','profile'])test(label+': '+change+' change cannot authorize replacement or recovery',async()=>{
  const f=await provisioningFixture(backend);f.state.failCreate=true;await f.connect();f.state.failCreate=false;const journal=await f.journal();
  if(change==='platform')f.state.platformId='acct_other';if(change==='mode')f.state.mode='live';if(change==='metadata')f.state.accounts.get(f.state.accountId).metadata.rflBusinessId='another-business';if(change==='profile')await f.db.stripeAccountProvisioning.update({where:{id:journal.id},data:{chargeModel:'DIRECT'}});
  const response=await f.connect();assert.ok([409,500].includes(response.status));assert.equal(f.state.accounts.size,1);assert.equal(await f.db.stripeConnection.count({where:{businessId:f.identity.businessId}}),0);
  if(change==='platform'||change==='mode'||change==='profile')assert.equal(f.state.createCalls.length,1);
 });
 test(label+': onboarding-link failure preserves committed ownership and retry reuses it',async()=>{
  const f=await provisioningFixture(backend);f.state.failLink=true;assert.equal((await f.connect()).status,500);const before=await f.db.stripeConnection.findUnique({where:{businessId:f.identity.businessId}});assert.ok(before);
  f.state.failLink=false;assert.equal((await f.connect()).status,200);assert.equal(f.state.createCalls.length,1);assert.deepEqual(await f.db.stripeConnection.findUnique({where:{businessId:f.identity.businessId}}),before);
 });
 test(label+': historical connection is reused without journal backfill or account replacement',async()=>{
  const f=await provisioningFixture(backend);await f.db.stripeConnection.create({data:{businessId:f.identity.businessId,stripeAccountId:'acct_historical'+f.identity.businessId.replaceAll(/[^A-Za-z0-9]/g,'')}});assert.equal((await f.connect()).status,200);assert.equal(f.state.createCalls.length,0);assert.equal(await f.journal(),null);
 });
 test(label+': revoked authorization prevents provisioning and provider calls',async()=>{
  const f=await provisioningFixture(backend);await f.db.session.deleteMany({where:{id:f.identity.id}});assert.equal((await f.connect()).status,401);assert.equal(await f.journal(),null);assert.equal(f.state.createCalls.length,0);assert.equal(f.state.links,0);
 });
 test(label+': explicit dormant DIRECT provisioning recovers the same account after persistence failure',async()=>{
  const f=await provisioningFixture(backend),service=f.load('lib/stripeAccountProvisioning.ts'),platform={platformAccountId:'acct_platform',mode:'test'};
  f.fail('stripeConnection.create');await assert.rejects(()=>service.provisionStripeConnectedAccount(f.identity,f.stripe,'DIRECT',platform));assert.equal(f.state.accounts.size,1);
  f.fail('stripeConnection.create',false);const connection=await service.provisionStripeConnectedAccount(f.identity,f.stripe,'DIRECT',platform);assert.equal(connection.stripeAccountId,f.state.accountId);assert.equal((await f.journal()).chargeModel,'DIRECT');assert.deepEqual(f.state.createCalls[0],f.state.createCalls[1]);assert.equal(f.state.createCalls[0].params.type,undefined);assert.equal(f.state.createCalls[0].params.controller.fees.payer,'account');assert.equal(f.state.accounts.size,1);
 });
 test(label+': prepared DIRECT profile requests Stripe-controlled policy but existing Express is never replaced',async()=>{
  const f=await provisioningFixture(backend),service=f.load('lib/stripeAccountProvisioning.ts');
  const params=service.accountProvisioningParameters('DIRECT',{businessId:f.identity.businessId,provisioningId:'future-operation',email:'synthetic@example.test',name:'Future property'});assert.equal(params.type,undefined);assert.deepEqual(params.controller,{fees:{payer:'account'},losses:{payments:'stripe'},requirement_collection:'stripe',stripe_dashboard:{type:'full'}});assert.deepEqual(params.capabilities,{card_payments:{requested:true},us_bank_account_ach_payments:{requested:true}});
  assert.equal((await f.connect()).status,200);const before=await f.db.stripeConnection.findUnique({where:{businessId:f.identity.businessId}});
  const existing=await service.provisionStripeConnectedAccount(f.identity,f.stripe,'DIRECT',{platformAccountId:'acct_platform',mode:'test'});assert.equal(existing.id,before.id);assert.equal(f.state.accounts.size,1);assert.equal(f.state.createCalls.length,1);
 });
}
