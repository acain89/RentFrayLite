import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { format } from 'node:util';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { harness } from './helpers/checkout-harness.mjs';
import { authHarness } from './helpers/auth-harness.mjs';

const privateValues=['PASSWORD_FIXTURE_PRIVATE','sk_test_private_fixture','cookie_private_fixture',
  'Payer Private Fixture','+13125550123','cs_test_private_fixture','evt_private_fixture'];
const unsafe = extra => Object.assign(new Error(privateValues.join(' / ')), {
  request:{headers:{authorization:privateValues[1],cookie:privateValues[2]},body:{name:privateValues[3],phone:privateValues[4]}},
  raw:{message:privateValues[0]},...extra,
});
const noPrivate = value => {const text=JSON.stringify(value);for(const p of privateValues)assert.ok(!text.includes(p),p);};
for(const [fields,category] of [
  [{type:'StripeInvalidRequestError'},'StripeInvalidRequestError'],[{code:21610},'TWILIO_OPTED_OUT'],
  [{code:20429},'TWILIO_RATE_LIMITED'],[{code:'P1001'},'PRISMA_P1001'],[{code:'P2002'},'PRISMA_P2002'],
  [{code:'ETIMEDOUT'},'NETWORK_TIMEOUT'],[{code:privateValues[0],type:privateValues[1]},'UNEXPECTED_ERROR'],
  [{classification:'SMS_OUTBOX_PERSISTENCE_FAILED'},'SMS_OUTBOX_PERSISTENCE_FAILED'],
])test(`allowlisted diagnostic ${category} never serializes raw error or reference`,async()=>{
  const h=await harness('ACH','isolated'),logger=h.load('lib/operationalLogging.ts');
  logger.logOperationalError('stripe_processing_failed',unsafe(fields),privateValues[6]);
  noPrivate(h.calls.errors);const entry=h.calls.errors.at(-1)[1];assert.equal(entry.category,category);
  assert.equal(entry.correlation,createHash('sha256').update(privateValues[6]).digest('hex'));
});
test('unknown operations and throwing error getters fail safely without payload serialization',async()=>{
  const h=await harness('ACH','isolated'),{operationalDiagnostic}=h.load('lib/operationalLogging.ts');
  const e=new Proxy({}, {get(){throw unsafe({});}});
  const value=operationalDiagnostic(privateValues[0],e,{cookie:privateValues[2]});
  assert.equal(value.operation,'unknown_operation');assert.equal(value.category,'UNEXPECTED_ERROR');assert.equal(value.correlation,undefined);noPrivate(value);
});
test('Prisma automatic error events are sanitized, not written to stdout raw',async()=>{
  const h=await harness('ACH','isolated');let options,handler;
  class Client{constructor(value){options=value;}$on(event,fn){assert.equal(event,'error');handler=fn;}}
  const compiledModule={exports:{}};
  const source=ts.transpileModule(readFileSync('lib/prisma.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:compiledModule,exports:compiledModule.exports,process:{env:{NODE_ENV:'production'}},require:name=>name==='@prisma/client'?{PrismaClient:Client}:h.load('lib/operationalLogging.ts')});
  assert.deepEqual(JSON.parse(JSON.stringify(options)),{log:[{emit:'event',level:'error'}]});
  handler({message:privateValues.join(' '),target:'query',timestamp:new Date()});noPrivate(h.calls.errors);
  assert.equal(h.calls.errors.at(-1)[1].category,'DATABASE_ERROR');
});
test('Twilio client explicitly prevents ambient debug request/response logging',async()=>{
  const h=await harness('ACH','isolated');let options;
  h.mocks.twilio={__esModule:true,default:(_sid,_token,opts)=>{options=opts;return{messages:{create:async()=>({sid:'SM'+'1'.repeat(32)})}};}};
  h.load('lib/smsDelivery.ts').twilioSmsProvider({NEXT_PUBLIC_BASE_URL:'https://example.test',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:privateValues[0],TWILIO_PHONE_NUMBER:'+13125550100'});
  assert.equal(options.logLevel,'error');assert.equal(options.autoRetry,false);assert.equal(options.timeout,8000);noPrivate(h.calls.errors);
});
test('checkout provider failure response and logs are private without altering reservation state',async()=>{
  const h=await harness('ACH','isolated'),q=await h.prepare();
  h.stripe.checkout.sessions.create=async()=>{throw unsafe({type:'StripeAPIError'});};
  const response=await h.start(q);assert.equal(response.status,500);noPrivate(await response.json());noPrivate(h.calls.errors);
  const [p]=await h.payments();assert.equal(p.status,'FAILED');assert.equal(p.totalChargedCents,q.totalCents);
  assert.equal(h.calls.errors.at(-1)[1].category,'StripeAPIError');
});
test('database reservation failures do not expose query arguments to checkout callers/logs',async()=>{
  const h=await harness('ACH','isolated'),q=await h.prepare();
  h.live.onBeforeReserve=()=>{throw unsafe({code:'P1001'});};
  const response=await h.start(q);assert.equal(response.status,500);noPrivate(await response.json());noPrivate(h.calls.errors);
  assert.equal((await h.payments()).length,0);assert.equal(h.calls.errors.at(-1)[1].category,'PRISMA_P1001');
});
test('unknown quote-validation failures return a generic response without internal text',async()=>{
  const h=await harness('ACH','isolated'),q=await h.prepare(),source=h.load('lib/customPayment.ts');
  h.mocks['@/lib/customPayment']={...source,assertCheckoutSource:()=>{throw unsafe({});}};
  const response=await h.start(q);assert.equal(response.status,409);noPrivate(await response.json());noPrivate(h.calls.errors);
  assert.equal((await h.payments()).length,0);
});
for(const signatureFailure of [true,false])test(`webhook ${signatureFailure?'signature':'processing'} failure retains safe classification and retry status`,async()=>{
  const h=await harness('ACH','isolated');
  h.mocks['@/lib/stripe']={getStripeClient:()=>({webhooks:{constructEvent:()=>{if(signatureFailure)throw unsafe({type:'StripeSignatureVerificationError'});return{id:privateValues[6]};}}})};
  h.mocks['@/lib/stripePaymentWebhook']={processStripePaymentEvent:async()=>{throw unsafe({classification:'UNKNOWN_PAYMENT_OWNERSHIP'});}};
  const r=await h.load('app/api/stripe/webhook/route.ts').POST(new Request('https://example.test/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':'fixture'},body:'{}'}));
  assert.equal(r.status,signatureFailure?400:500);noPrivate(await r.json());noPrivate(h.calls.errors);
  const logged=h.calls.errors.at(-1)[1];assert.equal(logged.operation,signatureFailure?'stripe_signature_failed':'stripe_processing_failed');
  // The route intentionally collapses all failed signature-secret candidates
  // into its own generic verification error; retain that safe classification.
  assert.equal(logged.category,signatureFailure?'VERIFICATION_FAILED':'UNKNOWN_PAYMENT_OWNERSHIP');
});
for(const route of ['status','inbound'])test(`Twilio ${route} failures return retryable responses without provider detail`,async()=>{
  const h=await harness('ACH','isolated');h.mocks['@/lib/smsDelivery']={SmsCallbackInvalid:class extends Error{},applySmsStatus:async()=>{throw unsafe({code:20429});},applySmsOptOut:async()=>{throw unsafe({code:20429});}};
  const r=await h.load(`app/api/twilio/${route}/route.ts`).POST(new Request('https://example.test/api',{method:'POST'}));
  assert.equal(r.status,503);assert.equal(await r.text(),'');noPrivate(h.calls.errors);
});
test('authentication failures never echo credentials or internal database errors',async()=>{
  const h=await authHarness('isolated',undefined,{'@/lib/auth':{authenticateManager:async()=>{throw unsafe({code:'P1001'});}}});
  const response=await h.load('app/api/auth/login/route.ts').POST(new Request('https://example.test/api/auth/login',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify({type:'MANAGER',email:'fixture@example.test',password:privateValues[0]})}));
  assert.equal(response.status,401);noPrivate(await response.json());
});
test('sensitive pages and APIs receive private cache and restrictive referrer rules',async()=>{
  const h=await harness('ACH','isolated'),compiledModule={exports:{}};
  const source=ts.transpileModule(readFileSync('next.config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{module:compiledModule,exports:compiledModule.exports,require:()=>h.load('lib/publicMetadata.ts')});
  const rules=await compiledModule.exports.default.headers();
  for(const path of ['/:accountCode/review','/payment/:path*','/api/:path*','/manager/:path*','/admin/:path*','/setup/:path*','/login/:path*']){
    const rule=rules.find(r=>r.source===path);assert.ok(rule,path);
    assert.equal(rule.headers.find(x=>x.key==='Referrer-Policy').value,'no-referrer');
    assert.match(rule.headers.find(x=>x.key==='Cache-Control').value,/private, no-store/);
  }
  assert.ok(!rules.some(r=>r.source==='/'&&r.headers.some(h=>h.key==='Cache-Control')));
  assert.match(readFileSync('app/payment/success/page.tsx','utf8'),/referrer: "no-referrer"/);
});


for (const boundary of ['quote read', 'expiry write']) test(`review ${boundary} replaces raw storage error before real Next error logging`, async () => {
  const h=await harness('ACH','isolated'),q=await h.prepare();
  const failure=unsafe({code:'P1001'});
  if(boundary==='quote read')h.db.checkoutSession.findUnique=async()=>{throw failure;};
  else {
    await h.db.checkoutSession.update({where:{id:q.id},data:{status:'CREATED',expiresAt:new Date(0)}});
    h.db.checkoutSession.updateMany=async()=>{throw failure;};
  }
  let renderedError;
  try {await h.load('app/[accountCode]/review/page.tsx').default({params:Promise.resolve({accountCode:q.accountCode}),searchParams:Promise.resolve({session:q.id})});}
  catch(error){renderedError=error;}
  assert.ok(renderedError);assert.equal(renderedError.message,'Payment review unavailable. Please try again.');
  assert.notEqual(renderedError,failure);assert.equal(renderedError.cause,undefined);
  noPrivate(h.calls.errors);noPrivate({message:renderedError.message,stack:renderedError.stack});
  assert.deepEqual(h.calls.errors.at(-1)[1],{operation:'checkout_review_failed',category:'PRISMA_P1001',correlation:createHash('sha256').update(q.id).digest('hex')});
  // Exercise installed Next's real RSC error handler and server logger. Storage
  // and page loading are mocked; this is not a packaged HTTP/deployment test.
  const require=createRequire(import.meta.url),captured=[],original=console.error;
  try {
    console.error=(...args)=>captured.push(format(...args));
    const {createReactServerErrorHandler}=require('next/dist/server/app-render/create-error-handler.js');
    const log=require('next/dist/build/output/log.js');
    const handler=createReactServerErrorHandler(false,false,new Map(),error=>log.error(error));
    assert.ok(handler(renderedError));
  } finally {console.error=original;}
  assert.ok(captured.length);noPrivate(captured);assert.match(captured.join('\n'),/Payment review unavailable/);
  assert.equal((await h.payments()).length,0);assert.equal(h.calls.creates.length,0);
});
