import assert from 'node:assert/strict';
import test from 'node:test';
import { authHarness } from './helpers/auth-harness.mjs';
import { harness } from './helpers/checkout-harness.mjs';
import twilio from 'twilio';

const browserRoutes = [
  ['app/api/auth/login/route.ts','POST','public'], ['app/api/auth/logout/route.ts','POST','empty'],
  ['app/api/setup/route.ts','POST','public'], ['app/api/public/checkout/session/route.ts','POST','public'],
  ['app/api/public/checkout/start/route.ts','POST','public'],
  ['app/api/setup/account-code/route.ts','POST','manager'],
  ...['tiers','billing','charges'].map(n=>[`app/api/setup/recurring/${n}/route.ts`,'PUT','manager']),
  ...['tiers','billing','charges'].map(n=>[`app/api/setup/recurring/${n}/route.ts`,'PATCH','manager']),
  ['app/api/setup/recurring/review/route.ts','POST','empty'], ['app/api/stripe/connect/route.ts','POST','empty'],
  ['app/api/manager/security/route.ts','PATCH','manager'], ['app/api/manager/sms/route.ts','POST','manager'],
  ['app/api/admin/businesses/[businessId]/credentials/route.ts','PATCH','admin'],
  ['app/api/admin/businesses/[businessId]/route.ts','DELETE','admin-empty'],
  ['app/api/auth/forgot-password/route.ts','POST','public'], ['app/api/auth/reset-password/route.ts','POST','public'],
];
const request = (method, body, headers={}) => new Request('https://example.test/api', {
  method, headers: { origin:'https://example.test','content-type':'application/json',...headers },
  ...(body===undefined?{}:{body}),
});
async function fixture(kind) {
  const h=await authHarness('isolated',undefined,{'@/lib/stripe':{getStripeClient:()=>{throw Error('Unexpected provider call');}}});
  await h.issue(kind.startsWith('admin')?'ADMIN':'MANAGER'); return h;
}
const invoke = (h,path,method,req) => h.load(path)[method](req,{params:Promise.resolve({businessId:h.businesses[0].id})});
for(const [path,method,kind] of browserRoutes) {
  for(const origin of ['missing','null','https://attacker.test','http://example.test','https://example.test:444']) {
    test(`${method} ${path}: rejects ${origin} origin`,async()=>{
      const h=await fixture(kind),r=request(method,undefined);
      if(origin==='missing')r.headers.delete('origin');else r.headers.set('origin',origin);
      // Forged ordinary forwarding headers must not substitute for Origin.
      r.headers.set('host','example.test');r.headers.set('x-forwarded-host','example.test');
      assert.equal((await invoke(h,path,method,r)).status,403);
      assert.equal((await h.db.auditLog.findMany()).length,0);
    });
  }
  test(`${method} ${path}: cross-site marker cannot contradict accepted origin`,async()=>{
    const h=await fixture(kind);assert.equal((await invoke(h,path,method,request(method,undefined,{'sec-fetch-site':'cross-site'}))).status,403);
  });
  if(kind.includes('empty')) {
    test(`${method} ${path}: rejects body without consuming it`,async()=>{
      const h=await fixture(kind);assert.equal((await invoke(h,path,method,request(method,'{bad'))).status,400);
    });
  } else for(const body of ['{','null','[]','"text"',' '.repeat(1024*1024+1)]) {
    test(`${method} ${path}: rejects malformed/nonobject/oversize body (${body.length} bytes)`,async()=>{
      const h=await fixture(kind),response=await invoke(h,path,method,request(method,body));
      // Recovery deliberately confirms generically, even when no request is
      // processed. Invalid bodies still cannot reach a budget/token/mail write.
      if(path==='app/api/auth/forgot-password/route.ts')assert.equal(response.status,200);
      else assert.ok(response.status>=400&&response.status<500);
      assert.equal((await h.db.auditLog.findMany()).length,0);
    });
  }
}

test('shared JSON reader rejects interrupted, inconsistent, unsupported and stalled streams',async t=>{
  const h=await fixture('manager'),{publicJson}=h.load('lib/publicJson.ts');
  await assert.rejects(()=>publicJson(request('POST','{}',{'content-type':'text/plain'}),4096),e=>e.status===415);
  await assert.rejects(()=>publicJson(request('POST','{}',{'content-length':'1'}),4096),e=>e.status===400);
  const broken=new ReadableStream({start(c){c.error(Error('interrupted'));}});
  await assert.rejects(()=>publicJson(new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json'},body:broken,duplex:'half'}),4096),e=>e.status===400);
  t.mock.timers.enable({apis:['setTimeout']});
  let cancelled=false;
  const stalled=new ReadableStream({cancel(){cancelled=true;}});
  const pending=publicJson(new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json'},body:stalled,duplex:'half'}),4096);
  const rejected=assert.rejects(()=>pending,e=>e.status===400);t.mock.timers.tick(10000);await rejected;assert.equal(cancelled,true);
});

test('bounded credential/configuration readers preserve valid JSON and reject excess',async()=>{
  const h=await fixture('manager'),{credentialJson}=h.load('lib/credentialRequest.ts'),{readConfigurationJson}=h.load('lib/recurringConfiguration.ts');
  assert.deepEqual(await credentialJson(request('POST','{"ok":true}')),{ok:true});
  assert.deepEqual(await readConfigurationJson(request('PUT','{"tiers":[]}')),{tiers:[]});
  await assert.rejects(()=>credentialJson(request('POST',JSON.stringify({x:'x'.repeat(4096)}))));
  await assert.rejects(()=>readConfigurationJson(request('PUT',JSON.stringify({x:'x'.repeat(1024*1024)}))),e=>e.status===413);
});

test('same-origin logout works and does not require a JSON body',async()=>{
  const h=await fixture('manager');assert.equal((await h.load('app/api/auth/logout/route.ts').POST(request('POST'))).status,200);assert.equal(await h.session.getCurrentSession(),null);
});
test('same-origin checkout quotes and first reservations retain ownership/idempotency',async()=>{
  const h=await harness('ACH','isolated'),q=await h.prepare();assert.equal((await h.start(q)).status,200);assert.equal((await h.start(q)).status,200);assert.equal(h.calls.creates.length,1);
});
test('scheduler uses bearer authentication, not browser Origin',async()=>{
  let calls=0;const h=await authHarness('isolated',undefined,{'@/lib/smsReceipts':{processQueuedSmsReceipts:async()=>{calls++;return[];}}},{NODE_ENV:'production',CRON_SECRET:'offline-job-fixture'});
  h.db.smsNotification={groupBy:async()=>[],aggregate:async()=>({_count:{_all:0},_min:{createdAt:null}})};
  const route=h.load('app/api/internal/sms/process/route.ts');
  assert.equal((await route.POST(new Request('https://example.test/api',{method:'POST'}))).status,401);
  assert.equal((await route.POST(new Request('https://example.test/api',{method:'POST',headers:{authorization:'Bearer offline-job-fixture'}}))).status,200);assert.equal(calls,1);
});
test('public session GET still uses session authorization without Origin',async()=>{
  const h=await fixture('manager');assert.equal((await h.load('app/api/auth/session/route.ts').GET()).status,200);
});
test('public property and metadata rendering remain available without Origin',async()=>{
  const h=await harness('ACH','isolated');
  h.mocks['./RecurringCheckoutClient']={__esModule:true,default:()=>null};
  const page=await h.load('app/[accountCode]/page.tsx').default({params:Promise.resolve({accountCode:h.business.accountCode})});
  assert.ok(page);
  assert.ok(h.load('app/(marketing)/sitemap.ts').default().every(row=>row.url.startsWith('https://rentfraylite.com')));
  assert.equal(h.load('app/robots.ts').default().sitemap,'https://rentfraylite.com/sitemap.xml');
  assert.equal(h.calls.creates.length,0);
});
test('hosted Stripe refresh GET retains session authorization without Origin',async()=>{
  const links=[];
  const h=await authHarness('isolated',undefined,{'@/lib/stripe':{getStripeClient:()=>({accountLinks:{create:async args=>{links.push(args);return{url:'https://connect.stripe.com/offline-fixture'};}}})}});
  await h.issue();await h.db.stripeConnection.create({data:{businessId:h.businesses[0].id,stripeAccountId:'acct_offline_fixture'}});
  const response=await h.load('app/api/stripe/onboard/route.ts').GET(new Request('https://example.test/api/stripe/onboard'));
  assert.equal(response.status,307);assert.equal(links.length,1);assert.equal(links[0].refresh_url,'https://example.test/api/stripe/onboard');
});
test('Twilio forms retain signatures without Origin and reject stalled bodies',async t=>{
  const h=await authHarness('isolated',undefined,{twilio:{__esModule:true,default:twilio}});
  const {verifiedTwilioForm}=h.load('lib/smsDelivery.ts');
  const env={NEXT_PUBLIC_BASE_URL:'https://example.test',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:'offline-form-fixture',TWILIO_PHONE_NUMBER:'+13125550100'};
  const path='/api/twilio/inbound',url=env.NEXT_PUBLIC_BASE_URL+path,params={AccountSid:env.TWILIO_ACCOUNT_SID,Body:'HELP'};
  const signature=twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN,url,params);
  const headers={'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature};
  const valid=await verifiedTwilioForm(new Request(url,{method:'POST',headers,body:new URLSearchParams(params)}),path,env);
  assert.equal(valid.params.Body,'HELP');
  await assert.rejects(()=>verifiedTwilioForm(new Request(url,{method:'POST',headers:{...headers,'x-twilio-signature':'invalid'},body:new URLSearchParams(params)}),path,env));
  t.mock.timers.enable({apis:['setTimeout']});let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  const pending=verifiedTwilioForm(new Request(url,{method:'POST',headers,body,duplex:'half'}),path,env);
  const rejected=assert.rejects(()=>pending,/INVALID_CALLBACK/);t.mock.timers.tick(10000);await rejected;assert.equal(cancelled,true);
});
