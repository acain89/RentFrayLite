import { historicalCheckoutSource } from './helpers/checkout-financial-source.mjs';
import { assertCheckoutStartSource } from './helpers/checkout-financial-source.mjs';
import { assertCheckoutFinancialSource } from './helpers/checkout-financial-source.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {harness} from './helpers/checkout-harness.mjs';
import {directStripeFixture,postgres} from './helpers/stripe-foundation-harness.mjs';
const load=(await harness('ACH','isolated')).load;
const service=load('lib/stripeDirectReadiness.ts'),foundation=load('lib/directPaymentFoundation.ts'),snapshots=load('lib/paymentArchitectureSnapshot.ts'),policy=load('lib/paymentArchitecturePolicy.ts');
const evaluate=async change=>{const f=directStripeFixture();change?.(f);return {...f,report:await service.readDirectChargeReadiness(f.stripe,f.input)};};
test('verified direct readiness uses connected-account child config, actual mode and controller facts',async()=>{
 const f=await evaluate();assert.equal(f.report.ready,true);assert.equal(f.report.status,'READY');
 const scoped=f.state.calls.filter(c=>['connectedBalance','configurations'].includes(c.name));assert.ok(scoped.every(c=>c.options.stripeAccount==='acct_management'));
 assert.equal(f.state.calls.find(c=>c.name==='configurationFilter').params.application,'ca_rfl');
 assert.equal(service.verifiedDirectOwnership(f.report,f.input.identity,'acct_management').configurationId,'pmc_child');
 assert.equal(policy.directPaymentCreationEnabled(),false);assert.equal(policy.selectedCheckoutChargeModel(),'LEGACY_DESTINATION');
});
const changes=[
 ['wrong platform',f=>f.state.platformId='acct_other'],['wrong platform mode',f=>f.state.mode='live'],['wrong connected mode',f=>f.state.connectedMode='live'],
 ['unknown key mode',f=>f.input.credentialMode='unknown'],['wrong account',f=>f.state.account.id='acct_other'],['missing application',f=>f.input.applicationId=''],
 ['platform configuration',f=>{f.state.configurations.data[0].application=null;f.state.configurations.data[0].parent=null;}],['wrong Connect application',f=>f.state.configurations.data[0].application='ca_other'],
 ['ambiguous default',f=>f.state.configurations.data.push({...f.state.configurations.data[0],id:'pmc_other'})],['pagination',f=>f.state.configurations.has_more=true],
 ['configuration mode mismatch',f=>f.state.configurations.data[0].livemode=true],['disabled config',f=>f.state.configurations.data[0].active=false],
 ['missing card capability',f=>delete f.state.account.capabilities.card_payments],['pending ACH',f=>f.state.account.capabilities.us_bank_account_ach_payments='pending'],
 ['missing controller',f=>delete f.state.account.controller],['legacy Express fee payer',f=>f.state.account.controller.fees.payer='application_express'],['platform processing payer',f=>f.state.account.controller.fees.payer='application'],
 ['platform loss liability',f=>f.state.account.controller.losses.payments='application'],['Express dashboard',f=>f.state.account.controller.stripe_dashboard.type='express'],
 ['missing requirements',f=>delete f.state.account.requirements],['unverified requirements',f=>f.state.account.requirements.pending_verification.push('identity')],
 ['charges disabled',f=>f.state.account.charges_enabled=false],['payouts disabled',f=>f.state.account.payouts_enabled=false],['onboarding incomplete',f=>f.state.account.details_submitted=false],
 ['card unavailable',f=>f.state.configurations.data[0].card.available=false],['ACH disabled preference',f=>f.state.configurations.data[0].us_bank_account.display_preference.value='off'],
 ['missing effective card preference',f=>delete f.state.configurations.data[0].card.display_preference],['missing ACH evidence',f=>delete f.state.configurations.data[0].us_bank_account],
 ...['platformAccount','platformBalance','connectedAccount','connectedBalance','configurations'].map(name=>['read failure '+name,f=>f.state.fail=name]),
];
for(const [name,change]of changes)test('direct readiness fails closed: '+name,async()=>{const f=await evaluate(change);assert.equal(f.report.ready,false);assert.ok(f.report.reasonCodes.length);assert.throws(()=>service.verifiedDirectOwnership(f.report,f.input.identity,f.input.connectedAccountId));});
test('simulated live evidence must all agree; test cannot authorize production',async()=>{
 const f=await evaluate(f=>{f.input.identity.mode='live';f.input.credentialMode='live';f.input.production=true;f.state.mode='live';f.state.connectedMode='live';f.state.configurations.data[0].livemode=true;});assert.equal(f.report.ready,true);
 assert.equal((await evaluate(f=>f.input.production=true)).report.ready,false);
});
test('a forged or copied ready boolean cannot authorize ownership snapshots',async()=>{const f=await evaluate();for(const report of [{...f.report},{model:'DIRECT',ready:true,status:'READY',reasonCodes:[]}])assert.throws(()=>service.verifiedDirectOwnership(report,f.input.identity,'acct_management'));});
test('ownership snapshots are immutable, identity-bound and expire',async()=>{
 const f=await evaluate(),input={identity:f.input.identity,connectedAccountId:'acct_management',checkoutAttemptId:'checkout-owned',managementOwedCents:100000,paymentMethod:'CARD'};
 const prepared=foundation.prepareDirectCheckoutOwnership(f.report,input);assert.equal(Object.isFrozen(prepared.snapshot),true);assert.equal(prepared.snapshot.stripePlatformAccountId,'acct_platform');assert.equal(prepared.snapshot.stripeMode,'test');assert.equal(prepared.snapshot.pricingVersion,'RFL_DIRECT_V1');
 assert.throws(()=>foundation.prepareDirectCheckoutOwnership(f.report,{...input,connectedAccountId:'acct_replacement'}));assert.throws(()=>foundation.prepareDirectCheckoutOwnership(f.report,{...input,identity:{...input.identity,mode:'live'}}));
 const original=Date.now;try{Date.now=()=>original()+6*60*1000;assert.throws(()=>foundation.prepareDirectCheckoutOwnership(f.report,input));}finally{Date.now=original;}
});
for(const backend of postgres?['isolated','postgres']:['isolated'])for(const method of ['ACH','CARD'])test(backend+' '+method+': dormant record preparation persists ownership/attempt snapshots without changing active destination checkout',async()=>{
 const h=await harness(method,backend),base=await h.prepare(),f=directStripeFixture();f.input.connectedAccountId=h.business.stripeConnection.stripeAccountId;f.state.account.id=f.input.connectedAccountId;
 const report=await service.readDirectChargeReadiness(f.stripe,f.input),id='future-'+randomUUID();const ready=foundation.prepareDirectCheckoutOwnership(report,{identity:f.input.identity,connectedAccountId:f.input.connectedAccountId,checkoutAttemptId:id,managementOwedCents:100000,paymentMethod:method});
 const checkout=await h.db.checkoutSession.create({data:{id,businessId:h.business.id,accountCode:h.business.accountCode,sourceType:'CUSTOM_PAYMENT',planId:null,billingCycle:null,dueDate:null,graceEndsAt:null,unitNumber:'101',firstName:'Future',lastName:'Synthetic',phone:'5555551234',paymentMethod:method,baseAmountCents:100000,recurringChargesCents:0,initialLateFeeCents:0,dailyLateFeesCents:0,subtotalCents:100000,platformFeeCents:ready.pricing.tenantProcessingFeeCents,totalCents:ready.pricing.tenantTotalCents,lineItems:[{type:'CUSTOM_PAYMENT',label:'Custom Payment',amountCents:100000},{type:'PLATFORM_FEE',label:'Future tenant processing fee',amountCents:ready.pricing.tenantProcessingFeeCents}],...ready.snapshot,status:'REVIEWED',expiresAt:new Date(Date.now()+3600000)}});
 const payment=await h.db.payment.create({data:foundation.prepareDirectPaymentRecord(checkout,report,f.input.identity)});assert.equal(snapshots.directPaymentMatchesCheckoutArchitecture(payment,checkout),true);assert.equal(snapshots.paymentMatchesCheckoutArchitecture(payment,checkout),false);
 assert.equal(payment.checkoutAttemptId,checkout.id);assert.equal(payment.stripePlatformAccountId,'acct_platform');assert.equal(payment.stripeMode,'test');const before=structuredClone(payment);
 assert.throws(()=>foundation.prepareDirectPaymentRecord({...checkout,stripePlatformAccountId:'acct_changed'},report,f.input.identity));assert.throws(()=>foundation.prepareDirectPaymentRecord({...checkout,platformFeeCents:checkout.platformFeeCents+1},report,f.input.identity));
 assert.equal((await h.start(base)).status,200);assert.equal(h.calls.creates.length,1);assert.equal(h.calls.creates[0].params.payment_intent_data.transfer_data.destination,base.stripeConnectedAccountId);assert.equal(h.calls.creates[0].options.stripeAccount,undefined);
 assert.deepEqual(await h.db.payment.findUnique({where:{id:payment.id}}),before);assert.equal((await h.db.checkoutSession.findUnique({where:{id:base.id}})).stripePlatformAccountId??null,null);
});
test('active allocation, fees and webhook routing match the approved Task 7 baseline',()=>{
 const root=path.resolve(import.meta.dirname,'..');for(const file of ['app/api/public/checkout/session/route.ts','lib/checkoutRetry.ts','lib/platformFees.ts','lib/rflDirectPricing.ts','lib/paymentArchitecturePolicy.ts','lib/stripePaymentWebhook.ts']){if(file==="app/api/public/checkout/session/route.ts"){assertCheckoutFinancialSource("825ca524c5226466e444b3d62a01607fb6b0753a");continue;}
  const current=historicalCheckoutSource(file,readFileSync(path.join(root,file),'utf8')).replaceAll('\r\n','\n');const prior=loadBaseline(file);assert.equal(current,prior,file);
 }
});
import{execFileSync}from'node:child_process';function loadBaseline(file){return execFileSync('git',['show','825ca524c5226466e444b3d62a01607fb6b0753a:'+file],{encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n');}

if(postgres)test('PostgreSQL ownership constraints reject partial identities and invalid modes without altering snapshots',async()=>{
 const h=await harness('ACH','postgres'),checkout=await h.prepare();await h.start(checkout);const reserved=await h.db.checkoutSession.findUnique({where:{id:checkout.id}}),payment=await h.db.payment.findUnique({where:{id:reserved.paymentId}});
 for(const [model,row]of [[h.db.checkoutSession,reserved],[h.db.payment,payment]]){
  for(const data of [{stripePlatformAccountId:'acct_platform'},{stripeMode:'test'},{stripePlatformAccountId:'acct_platform',stripeMode:'unknown'}])await assert.rejects(()=>model.update({where:{id:row.id},data}));
  assert.deepEqual(await model.findUnique({where:{id:row.id}}),row);
 }
});

test('checkout start ingress preserves the complete historical financial and authorization handler',()=>assertCheckoutStartSource('825ca524c5226466e444b3d62a01607fb6b0753a'));
