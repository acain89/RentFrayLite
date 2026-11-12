import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import * as zod from 'zod';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { harness, postgres } from './helpers/checkout-harness.mjs';
import { managementBillingHarness } from './helpers/management-billing-harness.mjs';

const json = (body, headers = {}) => new Request('https://example.test/api', {method:'POST',headers:{origin:'https://example.test','content-type':'application/json',...headers},body:JSON.stringify(body)});
const paths = ['app/api/setup/route.ts','app/api/public/checkout/session/route.ts','app/api/public/checkout/start/route.ts'];
for (const backend of ['isolated', ...(postgres ? ['postgres'] : [])]) {
  for (const path of paths) {
    for (const [name, body, headers, status] of [
      ['malformed','{',{},400],['null','null',{},400],['array','[]',{},400],
      ['unsupported','{}',{'content-type':'text/plain'},415],
      ['declared oversized','{}',{'content-length':'100000'},413],
      ['underreported length',JSON.stringify({padding:'x'.repeat(5000)}),{'content-length':'2'},413],
      ['incorrect length','{}',{'content-length':'1'},400],
      ['invalid length','{}',{'content-length':'invalid'},400],
      ['stream oversized',JSON.stringify({padding:'x'.repeat(5000)}),{},413],
    ]) test(`${backend}: ${path} rejects ${name} before database/provider work`,async()=>{
      const h=await harness('ACH',backend);
      h.mocks['@/lib/password']={hashPassword:async()=>{throw Error('Unexpected password hashing');}};
      h.mocks.zod=zod;
      const response=await h.load(path).POST(new Request('https://example.test/api',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json',...headers},body}));
      assert.equal(response.status,status); assert.equal(h.calls.creates.length,0);
      assert.doesNotMatch(await response.text(),/Prisma|SyntaxError|Unexpected token|database/i);
    });
  }
  test(`${backend}: chunked body is measured, cancelled at limit, and valid chunks parse`,async()=>{
    const h=await harness('ACH',backend),{publicJson}=h.load('lib/publicJson.ts');let cancelled=false;
    const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(900));},cancel(){cancelled=true;}});
    await assert.rejects(publicJson(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'}),1024),error=>error.status===413);assert.equal(cancelled,true);
    const encoder=new TextEncoder();const good=new ReadableStream({start(c){for(const chunk of ['{"na','me":"é"','}'])c.enqueue(encoder.encode(chunk));c.close();}});
    assert.deepEqual(await publicJson(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:good,duplex:'half'}),32),{name:'é'});
  });
  for(const kind of ['SIGNUP','SESSION','START']) {
    test(`${backend}: ${kind} atomic concurrency, expiry, Retry-After, durable reload and private identities`,async()=>{
      const h=await harness('ACH',backend),identity=randomUUID();
      if(backend==='postgres')await h.db.publicRequestBudget.deleteMany({where:{}});
      const {reservePublicRequest,publicRequestGuard,PUBLIC_REQUEST_LIMITS}=h.load('lib/publicRequestBudget.ts'),limit=PUBLIC_REQUEST_LIMITS[kind].limit;
      const result=await Promise.all(Array.from({length:limit+6},()=>reservePublicRequest(h.db,kind,identity)));
      assert.equal(result.filter(r=>r.allowed).length,limit);
      const response=await publicRequestGuard(h.db,kind,identity);assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);assert.ok(Number(response.headers.get('retry-after'))<=PUBLIC_REQUEST_LIMITS[kind].windowMs/1000);
      // A fresh module loader and a distinct Prisma client represent restart and
      // another application instance; neither may reset persisted budgets.
      const other=await harness('ACH',backend);
      let independent=h.db;
      if(backend==='postgres'){
        const config=JSON.parse(readFileSync(process.argv.find(arg=>arg.startsWith('--rfl-test-db-config=')).split('=').slice(1).join('='),'utf8'));
        assert.equal(config.isolationVerified,true);assert.equal(config.host,'127.0.0.1');
        independent=new postgres.constructor({datasources:{db:{url:`postgresql://${config.role}:${config.password}@127.0.0.1:${config.port}/${config.database}`}}});
      }
      try { assert.equal((await other.load('lib/publicRequestBudget.ts').reservePublicRequest(independent,kind,identity)).allowed,false); }
      finally { if(independent!==h.db)await independent.$disconnect(); }
      const rows=await h.db.publicRequestBudget.findMany({where:{key:{startsWith:kind+':'},expiresAt:{lte:new Date(Date.now()+86400000)}},take:100});
      assert.ok(rows.length>=2);for(const row of rows)assert.ok(!row.key.includes(identity));
      if(backend==='postgres')await h.db.publicRequestBudget.updateMany({where:{key:{startsWith:kind+':'}},data:{expiresAt:new Date(Date.now()-1)}});
      else for(const row of rows)await h.db.publicRequestBudget.upsert({where:{key:row.key},create:{},update:{expiresAt:new Date(Date.now()-1)}});
      assert.equal((await reservePublicRequest(h.db,kind,identity)).allowed,true);
    });
  }
  test(`${backend}: shared IP and spoofed forwarding headers do not establish quote identity`,async()=>{
    const h=await harness('ACH',backend);if(backend==='postgres')await h.db.publicRequestBudget.deleteMany({where:{}});
    const route=h.load(paths[1]),plan=h.business.recurringPlans[0];
    const body={accountCode:h.business.accountCode,planId:plan.id,unitNumber:'1',firstName:'Public',lastName:'Test',phone:'5555551234',paymentMethod:'ACH'};
    for(let i=0;i<30;i++)assert.equal((await route.POST(json(body,{'x-forwarded-for':`192.0.2.${i}`}))).status,201);
    assert.equal((await route.POST(json({...body,phone:'(555) 555-1234'},{'x-forwarded-for':'203.0.113.9','x-real-ip':'203.0.113.10'}))).status,429);
    assert.equal((await route.POST(json({...body,phone:'5555551235'},{'x-forwarded-for':'192.0.2.1'}))).status,201);
    assert.equal((await h.payments()).length,0);
  });
  test(`${backend}: same-attempt normal start retries retain one payment and Stripe idempotency`,async()=>{
    const h=await harness('ACH',backend);if(backend==='postgres')await h.db.publicRequestBudget.deleteMany({where:{}});
    const checkout=await h.prepare();const first=await h.start(checkout);assert.equal(first.status,200);
    const expected=await first.json();
    for(let i=0;i<5;i++){const response=await h.start(checkout);assert.equal(response.status,200);assert.equal((await response.json()).paymentId,expected.paymentId);}
    assert.equal((await h.payments()).length,1);assert.equal(h.calls.creates.length,1);
  });
  test(`${backend}: start throttles nonexistent attempts identically and rejects malformed identifiers`,async()=>{
    const h=await harness('ACH',backend);if(backend==='postgres')await h.db.publicRequestBudget.deleteMany({where:{}});
    const route=h.load(paths[2]),id='missing-'+randomUUID();
    for(let i=0;i<30;i++)assert.equal((await route.POST(json({checkoutSessionId:id},{'x-forwarded-for':`192.0.2.${i}`}))).status,404);
    const denied=await route.POST(json({checkoutSessionId:id}));assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0);
    for(const bad of ['x'.repeat(129),'../../other','id\0suffix',{},null])assert.equal((await route.POST(json({checkoutSessionId:bad}))).status,400);
    assert.equal((await h.payments()).length,0);assert.equal(h.calls.creates.length,0);
  });
  test(`${backend}: global budget bounds identifier rotation and denial cannot grow storage`,async()=>{
    const h=await harness('ACH',backend);if(backend==='postgres')await h.db.publicRequestBudget.deleteMany({where:{}});
    const {reservePublicRequest}=h.load('lib/publicRequestBudget.ts');
    for(let i=0;i<100;i++)assert.equal((await reservePublicRequest(h.db,'SIGNUP',randomUUID())).allowed,true);
    for(let i=0;i<10;i++)assert.equal((await reservePublicRequest(h.db,'SIGNUP',randomUUID())).allowed,false);
    const rows=await h.db.publicRequestBudget.findMany({where:{key:{startsWith:'SIGNUP:'},expiresAt:{lte:new Date(Date.now()+86400000)}},take:1000});
    assert.equal(rows.length,101);assert.equal((await h.payments()).length,0);
  });
  test(`${backend}: budget database failure fails closed with safe retry response`,async()=>{
    const h=await harness('ACH',backend),{publicRequestGuard}=h.load('lib/publicRequestBudget.ts');
    const response=await publicRequestGuard({$transaction:async()=>{throw Error('private connection details');}},'SIGNUP','test@example.test');
    assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'5');assert.doesNotMatch(await response.text(),/private|connection|Prisma/);
  });
}
test('signup permits valid customers and throttles normalized email before password hashing or account writes',async()=>{
  const h=managementBillingHarness(),route=h.load(paths[0]);
  const body={businessName:'Test Property',ownerName:'Test Manager',contactEmail:'property@example.test',managerEmail:'manager@example.test',password:'Isolated-passphrase1',confirmPassword:'Isolated-passphrase1',acceptedTerms:true,propertyTimeZone:'America/Chicago'};
  for(let i=0;i<3;i++)assert.equal((await route.POST(json(body))).status,201);
  const writes=h.writes.length;const response=await route.POST(json({...body,managerEmail:' MANAGER@EXAMPLE.TEST '}));assert.equal(response.status,429);assert.equal(h.writes.length,writes);
  assert.equal((await route.POST(json({...body,managerEmail:'other@example.test'}))).status,201);
});
if(postgres)test('postgres: real signup and durable normalized-email throttling',async()=>{
  const h=await harness('ACH','postgres');await h.db.publicRequestBudget.deleteMany({where:{}});
  h.mocks.zod=zod;h.mocks.bcryptjs={default:bcrypt,...bcrypt};
  const route=h.load(paths[0]),email=randomUUID()+'@example.test';
  const body={businessName:'Disposable signup',ownerName:'Test Manager',contactEmail:email,managerEmail:email,password:'Isolated-passphrase1',confirmPassword:'Isolated-passphrase1',acceptedTerms:true,propertyTimeZone:'America/Chicago'};
  assert.equal((await route.POST(json(body))).status,201);
  const manager=await h.db.manager.findUnique({where:{email}});assert.ok(manager);
  for(let i=0;i<2;i++){const response=await route.POST(json(body));assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/already exists|registered|manager account/i);}
  const response=await route.POST(json({...body,managerEmail:email.toUpperCase()}));assert.equal(response.status,429);
  assert.equal(await h.db.manager.count({where:{email}}),1);assert.equal((await h.payments()).length,0);
});
test('body reader bounds stalled streams and rejects invalid UTF-8',async()=>{
  const h=await harness('ACH','isolated'),{publicJson}=h.load('lib/publicJson.ts');let cancelled=false;
  const stalled=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
  await assert.rejects(publicJson(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:stalled,duplex:'half'}),4096),error=>error.status===400);assert.equal(cancelled,true);
  await assert.rejects(publicJson(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:new Uint8Array([255])}),4096),error=>error.status===400);
});
test('body reader accepts the exact byte boundary and bounds empty chunks',async()=>{
  const h=await harness('ACH','isolated'),{publicJson}=h.load('lib/publicJson.ts');
  const body={padding:'x'.repeat(4096-JSON.stringify({padding:''}).length)};
  assert.equal(JSON.stringify(body).length,4096);assert.deepEqual(await publicJson(json(body),4096),body);
  await assert.rejects(publicJson(json({padding:body.padding+'x'}),4096),error=>error.status===413);
  let cancelled=false;
  const empty=new ReadableStream({pull(c){c.enqueue(new Uint8Array());},cancel(){cancelled=true;}});
  await assert.rejects(publicJson(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:empty,duplex:'half'}),32),error=>error.status===400);assert.equal(cancelled,true);
});


for(const path of paths)for(const [label,headers] of [
  ['missing',{}],['forged',{origin:'https://attacker.test'}],['null',{origin:'null'}],
  ['wrong scheme',{origin:'http://example.test'}],['cross-site',{origin:'https://example.test','sec-fetch-site':'cross-site'}],
])test(`${path}: ${label} origin remains rejected before storage/provider work`,async()=>{
  const h=await harness('ACH','isolated');let storageReads=0;
  h.mocks.zod=zod;h.mocks['@/lib/password']={hashPassword:async()=>{throw Error('Unexpected password hashing');}};
  h.mocks['@/lib/prisma']={prisma:new Proxy({}, {get(){storageReads++;throw Error('Unexpected storage access');}})};
  const response=await h.load(path).POST(new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'}));
  assert.equal(response.status,403);assert.equal(storageReads,0);assert.equal(h.calls.creates.length,0);
  assert.deepEqual(await response.json(),{error:'Invalid request origin.'});
});
