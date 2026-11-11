import assert from 'node:assert/strict';
import test from 'node:test';
import { customFixture, customBrowserMutationRequest } from './helpers/custom-payment-harness.mjs';
import { postgres } from './helpers/checkout-harness.mjs';

const browserRequest=(url,body,headers)=>({url:()=>url,method:()=> 'POST',allHeaders:async()=>headers,postDataBuffer:()=>Buffer.from(JSON.stringify(body))});
const quotes=h=>h.db.checkoutSession.findMany({where:{businessId:h.business.id},orderBy:{id:'asc'}});
const snapshot=async h=>({quotes:await quotes(h),payments:await h.payments(),creates:h.calls.creates.length,reads:h.calls.reads.length});

test('browser adapter preserves URL, method, body bytes and all headers without manufacturing Origin',async()=>{
  const body=Buffer.from('{"name":"Synthetic é"}'),headers={'content-type':'application/json',cookie:'synthetic=owned','x-synthetic':'retained'};
  const request=await customBrowserMutationRequest({url:()=> 'https://example.test/api/public/checkout/session',method:()=> 'POST',allHeaders:async()=>headers,postDataBuffer:()=>body});
  assert.equal(request.url,'https://example.test/api/public/checkout/session');assert.equal(request.method,'POST');
  assert.deepEqual(Buffer.from(await request.arrayBuffer()),body);
  for(const [name,value] of Object.entries(headers))assert.equal(request.headers.get(name),value);
  assert.equal(request.headers.get('origin'),null);
});

for(const backend of postgres?['isolated','postgres']:['isolated']){
  for(const endpoint of ['session','start'])for(const kind of ['missing','cross-origin','malformed'])test(`${backend}: ${endpoint} rejects ${kind} Origin without checkout or financial writes`,async()=>{
    const h=await customFixture('ACH',backend),origin=h.load('lib/credentialRequest.ts').configuredCredentialOrigin();
    const {checkout}=await h.prepareCustom();
    const body=endpoint==='start'?{checkoutSessionId:checkout.id}:{sourceType:'CUSTOM_PAYMENT',accountCode:h.business.accountCode,amount:'123.45',firstName:'Custom',lastName:'Payer',unitNumber:'101',phone:'5555551234',paymentMethod:'ACH'};
    const headers={'content-type':'application/json'};
    if(kind!=='missing')headers.origin=kind==='cross-origin'?'https://foreign.example.test':'not an origin';
    const before=await snapshot(h),request=await customBrowserMutationRequest(browserRequest(origin+'/api/public/checkout/'+endpoint,body,headers));
    assert.equal(request.headers.get('origin'),headers.origin??null);
    const response=await h.load('app/api/public/checkout/'+endpoint+'/route.ts').POST(request);
    assert.equal(response.status,403);assert.match(await response.text(),/Invalid request origin/);
    assert.deepEqual(await snapshot(h),before);
  });

  test(`${backend}: forwarded same-origin custom quote and reservation retain approved amounts`,async()=>{
    const h=await customFixture('ACH',backend),origin=h.load('lib/credentialRequest.ts').configuredCredentialOrigin();
    const body={sourceType:'CUSTOM_PAYMENT',accountCode:h.business.accountCode,amount:'123.45',firstName:'Custom',lastName:'Payer',unitNumber:'101',phone:'5555551234',paymentMethod:'ACH'};
    const request=await customBrowserMutationRequest(browserRequest(origin+'/api/public/checkout/session',body,{'content-type':'application/json',origin}));
    const response=await h.load('app/api/public/checkout/session/route.ts').POST(request);assert.equal(response.status,201);
    const {checkoutSession}=await response.json(),q=await h.db.checkoutSession.findUnique({where:{id:checkoutSession.id}});
    await h.review(q);assert.equal(q.subtotalCents,12345);assert.equal(q.platformFeeCents,395);assert.equal(q.totalCents,12740);
    const start=await customBrowserMutationRequest(browserRequest(origin+'/api/public/checkout/start',{checkoutSessionId:q.id},{'content-type':'application/json',origin}));
    assert.equal((await h.load('app/api/public/checkout/start/route.ts').POST(start)).status,200);
    const [p]=await h.payments();assert.equal(p.subtotalCents,12345);assert.equal(p.platformFeeCents,395);assert.equal(p.totalChargedCents,12740);assert.equal(h.calls.creates.length,1);
    assert.equal(h.live.sessions.size,1);assert.equal(h.live.keys.size,1);
  });

  for(const kind of ['missing','tampered','another quote'])test(`${backend}: ${kind} quote binding cannot reserve or transfer custom identity`,async()=>{
    const h=await customFixture('ACH',backend),{checkout:q}=await h.prepareCustom();
    const key=[...h.cookieJar.keys()].find(k=>k.startsWith('rfl_checkout_'));
    if(kind==='missing')h.cookieJar.delete(key);
    if(kind==='tampered')h.cookieJar.set(key,'9999999999999.'+'0'.repeat(64));
    if(kind==='another quote'){
      await h.load('lib/checkoutConsent.ts').grantCheckoutConsentAccess('another-synthetic-quote');
      h.cookieJar.set(key,[...h.cookieJar.entries()].find(([k])=>k!==key)[1]);
    }
    const before=await snapshot(h);
    await assert.rejects(()=>h.review(q),/NOT_FOUND/);
    assert.equal((await h.start(q)).status,403);
    assert.equal((await h.create('123.45',{paymentMethod:'CARD',previousCheckoutSessionId:q.id})).status,403);
    assert.deepEqual(await snapshot(h),before);
  });

  for(const kind of ['missing','tampered','another session'])test(`${backend}: ${kind} result binding cannot disclose or resume reserved custom payment`,async()=>{
    const h=await customFixture('ACH',backend),{checkout:q}=await h.prepareCustom();assert.equal((await h.start(q)).status,200);
    const a=await h.current(q),access=h.load('lib/paymentResultAccess.ts'),result=h.load('lib/paymentResult.ts');
    assert.ok(await result.getPaymentResult(h.business.accountCode,a.session.id));
    const key=[...h.cookieJar.keys()].find(k=>k.startsWith('rfl_result_'));
    if(kind==='missing')h.cookieJar.delete(key);
    if(kind==='tampered')h.cookieJar.set(key,'0'.repeat(64));
    if(kind==='another session'){
      await access.grantPaymentResultAccess('cs_another_synthetic',q.id);
      h.cookieJar.set(key,[...h.cookieJar.entries()].find(([k])=>k.startsWith('rfl_result_')&&k!==key)[1]);
    }
    const before=await snapshot(h);
    assert.equal(await result.getPaymentResult(h.business.accountCode,a.session.id),null);
    await assert.rejects(()=>h.review(q),/NOT_FOUND/);assert.equal((await h.start(q)).status,409);
    assert.deepEqual(await snapshot(h),before);assert.equal(h.calls.creates.length,1);
  });
}
