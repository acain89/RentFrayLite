import {existsSync} from "node:fs";
import {assertUnchangedAchCore,assertAdditivePushSchema} from "./helpers/ach-cleanup-boundary.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { authHarness, postgres } from './helpers/auth-harness.mjs';
import { managementBillingHarness } from './helpers/management-billing-harness.mjs';
import { SetupStep } from '@prisma/client';

const pure=managementBillingHarness();
pure.mocks['@prisma/client']={...pure.mocks['@prisma/client'],SetupStep};
const progress=pure.load('lib/setupProgress.ts');
const routes={VERIFY_EMAIL:'/setup/recurring/tiers',CONFIGURE_RECURRING_TIERS:'/setup/recurring/tiers',CONFIGURE_RECURRING_CHARGES:'/setup/recurring/charges',CONFIGURE_RECURRING_BILLING:'/setup/recurring/billing',REVIEW_RECURRING:'/setup/recurring/review',CONNECT_STRIPE:'/setup/stripe',CHOOSE_ACCOUNT_CODE:'/setup/account-code',COMPLETE:'/manager/dashboard'};
for(const [setupStep,expected] of Object.entries(routes)) {
  for(const verified of [false,true])test(`${setupStep}: verified=${verified} routing preserves saved verification facts`,()=>{
    const business=Object.freeze({setupStep,setupCompletedAt:null,emailVerifiedAt:verified?new Date('2026-01-01'):null});
    const before=structuredClone(business);assert.equal(progress.getSetupRoute(business),expected);assert.deepEqual(business,before);
  });
  test(`${setupStep}: saved completion still takes precedence`,()=>{
    assert.equal(progress.getSetupRoute({setupStep,setupCompletedAt:new Date(),emailVerifiedAt:null}),'/manager/dashboard');
  });
}
test('legacy resume details describe the existing tiers step without claiming verification',()=>{
  assert.deepEqual(structuredClone(progress.getSetupResumeDetails({setupStep:'VERIFY_EMAIL',setupCompletedAt:null})),{stepNumber:2,totalSteps:7,title:'Rent Tiers',route:'/setup/recurring/tiers'});
  assert.equal(progress.getHighestSetupStage('VERIFY_EMAIL'),2);
});

const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
for(const backend of ['isolated',...(postgres?['postgres']:[])]) {
  async function fixture(emailVerifiedAt=null){
    const h=await authHarness(backend,undefined,{'@/lib/businessPaymentReadiness':{loadBusinessPaymentReadiness:async()=>null}});
    const business=await h.db.business.update({where:{id:h.businesses[0].id},data:{setupStep:'VERIFY_EMAIL',setupCompletedAt:null,status:'SETUP',emailVerifiedAt}});
    return {...h,business};
  }
  for(const verified of [false,true])test(`${backend}: authenticated legacy resume and saved URL do not rewrite verification or setup state (${verified})`,async()=>{
    const h=await fixture(verified?new Date('2026-01-01'):null);await h.issue();h.readonly(true);
    const tree=await h.load('app/setup/continue/page.tsx').default();assert.ok(walk(tree).some(node=>node.props?.href==='/setup/recurring/tiers'));
    await assert.rejects(()=>h.load('app/setup/verify-email/page.tsx').default(),/REDIRECT \/setup\/recurring\/tiers$/);
    assert.deepEqual(await h.db.business.findUnique({where:{id:h.business.id}}),h.business);
  });
  test(`${backend}: existing manager login resumes legacy setup through the authenticated continuation page`,async()=>{
    const h=await fixture(),manager=h.managers[0];
    const response=await h.load('app/api/auth/login/route.ts').POST(new Request('https://example.test/api/auth/login',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify({type:'MANAGER',email:manager.email,password:'old-password'})}));
    assert.equal(response.status,200);assert.equal((await response.json()).redirectTo,'/setup/continue');assert.ok(h.token());
    const saved=await h.db.business.findUnique({where:{id:h.business.id}});assert.equal(saved.emailVerifiedAt,null);assert.equal(saved.setupStep,'VERIFY_EMAIL');assert.equal(saved.setupCompletedAt,null);
  });
  for(const state of ['anonymous','expired','forged','inactive','admin'])test(`${backend}: legacy URL retains authentication protection for ${state}`,async()=>{
    const h=await fixture();
    if(state==='admin')await h.issue('ADMIN');
    else if(state!=='anonymous'){
      await h.issue();
      if(state==='expired')await h.db.session.updateMany({where:{tokenHash:h.session.hashSessionToken(h.token())},data:{expiresAt:new Date(0)}});
      if(state==='forged')h.use(randomUUID());
      if(state==='inactive')await h.db.manager.update({where:{id:h.managers[0].id},data:{isActive:false}});
    }
    await assert.rejects(()=>h.load('app/setup/verify-email/page.tsx').default(),/REDIRECT \/login\/manager$/);
    assert.deepEqual(await h.db.business.findUnique({where:{id:h.business.id}}),h.business);
  });
  test(`${backend}: saved legacy URL uses only the authenticated manager's business`,async()=>{
    const h=await fixture();await h.issue('MANAGER',1);
    await assert.rejects(()=>h.load('app/setup/verify-email/page.tsx').default(),/REDIRECT \/manager\/dashboard$/);
    assert.deepEqual(await h.db.business.findUnique({where:{id:h.business.id}}),h.business);
  });
  test(`${backend}: legacy resumption neither consumes nor fabricates email-verification evidence`,async()=>{
    const h=await fixture();
    await h.db.verificationToken.create({data:{businessId:h.business.id,type:'EMAIL_VERIFICATION',tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60_000)}});
    const before=await h.db.verificationToken.findMany({where:{businessId:h.business.id}});
    await h.issue();await h.load('app/setup/continue/page.tsx').default();
    await assert.rejects(()=>h.load('app/setup/verify-email/page.tsx').default(),/REDIRECT \/setup\/recurring\/tiers$/);
    assert.deepEqual(await h.db.verificationToken.findMany({where:{businessId:h.business.id}}),before);
    assert.deepEqual(await h.db.business.findUnique({where:{id:h.business.id}}),h.business);
  });
}

test('footer renders the intended copyright as valid UTF-8',()=>{
  const h=managementBillingHarness();h.mocks.react=React;const Footer=h.load('components/SiteFooter.tsx').default;
  const html=renderToStaticMarkup(React.createElement(Footer));assert.ok(html.includes('©'));assert.ok(html.includes('RentFrayLite'));assert.doesNotMatch(html,/[\u00c2\u00c3\ufffd]/);
});
test('small-property tiers render the intended middle dot without changing amounts',()=>{
  const h=managementBillingHarness();h.mocks.react=React;const Client=h.load('app/setup/recurring/tiers/RecurringTiersClient.tsx').default;
  const html=renderToStaticMarkup(React.createElement(Client,{initialTiers:[{id:'tier',name:'Rent',amount:'1000.00'}],highestReachedStep:2}));
  assert.ok(html.includes('Recurring setup · Step 1 of 4'));assert.doesNotMatch(html,/[\u00c2\u00c3\ufffd]/);assert.ok(html.includes('1000.00'));
});
test("ACH cleanup preservation: assertUnchangedAchCore (encoding edits change exactly the two )",assertUnchangedAchCore);
test("ACH cleanup preservation: assertAdditivePushSchema (schema defaults, verification persiste)",assertAdditivePushSchema);
test('clean production release excludes legacy SQLite and APK artifacts',()=>{
  const files=['prisma/dev.db','public/app-release-signed.apk'];
  for(const file of files)assert.equal(existsSync(file),false,file);
});

const configPath=process.argv.find(arg=>arg.startsWith('--rfl-test-db-config='))?.slice('--rfl-test-db-config='.length);
if(configPath)test('disposable verification preserves every excluded artifact and both tracked historical artifacts',()=>{
  const config=JSON.parse(readFileSync(configPath,'utf8'));assert.equal(config.isolationVerified,true);
  const manifest=JSON.parse(readFileSync(config.root+'/preserved-hashes.json','utf8'));assert.equal(Object.keys(manifest).length,14);
  for(const [file,hash]of Object.entries(manifest))assert.equal(createHash('sha256').update(readFileSync(config.original+'/'+file)).digest('hex'),hash,file);
});
