import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import {harness} from './helpers/checkout-harness.mjs';

const require=createRequire(import.meta.url);
const render={RFL_LOOKUP_IP_SOURCE:'render',RENDER:'true',RENDER_SERVICE_TYPE:'web'};
const secret='synthetic-signing-key-at-least-thirty-two-bytes';
function load(file,env={},mocks={}){
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const result={exports:{}};
 vm.runInThisContext('(function(require,module,exports,process){'+code+'\n})')(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name.startsWith('@/'))throw new Error('Unexpected service import: '+name);
  return require(name);
 },result,result.exports,{env});return result.exports;
}
const adapter=env=>load('lib/verifiedLookupIp.ts',env).verifiedLookupIp;
function request(headers={},path='/api/setup/account-code/availability?code=AB-1234',method='GET'){
 const r=new Request('https://example.test'+path,{method,headers});r.nextUrl=new URL(r.url);return r;
}
function signed(time=Date.now(),path='/api/setup/account-code/availability?code=AB-1234',method='GET'){
 const ip='192.0.2.8',stamp=String(time),signature=createHmac('sha256',secret).update(['rfl-lookup-ip-v1',stamp,method,new URL('https://example.test'+path).pathname,ip].join('\n')).digest('hex');
 return request({'x-rfl-client-ip':ip,'x-rfl-client-time':stamp,'x-rfl-client-signature':signature},path,method);
}
const ip=adapter(render);
for(const [raw,expected] of [
 ['192.0.2.8','192.0.2.8'],['2001:0db8:0000:0000:0000:0000:0000:0001','2001:db8::1'],
 ['2001:DB8::1','2001:db8::1'],['::ffff:192.0.2.8','192.0.2.8'],['::ffff:c000:208','192.0.2.8'],
])test('Render canonicalizes '+raw,()=>assert.equal(ip(request({'cf-connecting-ip':raw})),expected));
for(const raw of [null,'','unknown','192.0.2.8, 198.51.100.1','192.0.2.8:443','[2001:db8::1]','[2001:db8::1]:443','fe80::1%eth0','192.1','1234','192.0.2.999','192.0.2.8 198.51.100.1'])test('Render rejects invalid identity '+JSON.stringify(raw),()=>assert.equal(ip(request(raw===null?{}:{'cf-connecting-ip':raw})),null));
test('duplicate CF headers combine into an invalid list',()=>{const r=request();r.headers.append('cf-connecting-ip','192.0.2.8');r.headers.append('cf-connecting-ip','198.51.100.1');assert.equal(ip(r),null);});
for(const [name,env] of Object.entries({missingRender:{RFL_LOOKUP_IP_SOURCE:'render',RENDER_SERVICE_TYPE:'web'},wrongRender:{...render,RENDER:'false'},nonexactRender:{...render,RENDER:'TRUE'},missingType:{RFL_LOOKUP_IP_SOURCE:'render',RENDER:'true'},privateService:{...render,RENDER_SERVICE_TYPE:'pserv'},worker:{...render,RENDER_SERVICE_TYPE:'worker'},outsideRender:{RFL_LOOKUP_IP_SOURCE:'render'}}))test('Render rejects deployment context '+name,()=>assert.equal(adapter(env)(request({'cf-connecting-ip':'192.0.2.8'})),null));
for(const source of ['', 'Render','auto','forwarded','render,signed',' render'])test('unknown adapter '+JSON.stringify(source)+' fails closed',()=>{
 const r=signed();r.headers.set('cf-connecting-ip','192.0.2.8');assert.equal(adapter({...render,RFL_LOOKUP_IP_SOURCE:source,RFL_LOOKUP_PROXY_SECRET:secret})(r),null);
});
test('Render identity ignores every unrelated claimed identity',()=>{
 const r=signed();for(const name of ['x-forwarded-for','x-real-ip','true-client-ip','forwarded','x-rfl-client-ip','host','x-forwarded-host','x-forwarded-proto'])r.headers.set(name,'198.51.100.99');
 r.headers.set('cf-connecting-ip','192.0.2.8');assert.equal(ip(r),'192.0.2.8');
});
test('Render does not fall back to a valid HMAC when CF identity is missing or invalid',()=>{
 const r=signed();const check=adapter({...render,RFL_LOOKUP_PROXY_SECRET:secret});assert.equal(check(r),null);r.headers.set('cf-connecting-ip','bad');assert.equal(check(r),null);
});
test('forwarding headers and request environment claims cannot supply Render identity',()=>{
 const r=request({'x-forwarded-for':'192.0.2.8','x-real-ip':'192.0.2.8','true-client-ip':'192.0.2.8','forwarded':'for=192.0.2.8','RENDER':'true','RENDER_SERVICE_TYPE':'web','RFL_LOOKUP_IP_SOURCE':'render','host':'rentfraylite.onrender.com'});
 assert.equal(ip(r),null);r.headers.set('cf-connecting-ip','192.0.2.8');assert.equal(adapter({})(r),null);
});
test('unset mode retains signed behavior even when Render environment markers exist',()=>{
 const check=adapter({RENDER:'true',RENDER_SERVICE_TYPE:'web',RFL_LOOKUP_PROXY_SECRET:secret});assert.equal(check(signed()),'192.0.2.8');assert.equal(check(request({'cf-connecting-ip':'192.0.2.8'})),null);
});
test('explicit signed mode preserves HMAC and never trusts CF as a fallback',()=>{
 const check=adapter({...render,RFL_LOOKUP_IP_SOURCE:'signed',RFL_LOOKUP_PROXY_SECRET:secret});const r=signed();r.headers.set('cf-connecting-ip','198.51.100.1');assert.equal(check(r),'192.0.2.8');r.headers.set('x-rfl-client-signature','0'.repeat(64));assert.equal(check(r),null);
});
for(const delta of [-30001,30001])test('signed freshness preserved '+delta,()=>{const now=Date.now();assert.equal(adapter({RFL_LOOKUP_PROXY_SECRET:secret})(signed(now+delta),now),null);});
for(const delta of [-30000,30000])test('signed freshness boundary accepted '+delta,()=>{const now=Date.now();assert.equal(adapter({RFL_LOOKUP_PROXY_SECRET:secret})(signed(now+delta),now),'192.0.2.8');});

function proxy(db,guard){return load('proxy.ts',{}, {'next/server':{NextResponse:{next:()=>new Response(null,{status:200}),json:Response.json}},'@/lib/prisma':{prisma:db},'@/lib/publicRequestBudget':{publicRequestGuard:guard},'@/lib/verifiedLookupIp':{verifiedLookupIp:ip}}).proxy;}
const protectedRequests=[['/AB-1234','GET'],['/AB1234','HEAD'],['/%2541%25421234','GET'],['/api/setup/account-code/availability?code=AB-1234','GET'],['/api/setup/account-code/availability?code=AB-1234','HEAD'],['/API/SETUP/ACCOUNT-CODE/AVAILABILITY','GET'],['/api/public/checkout/session','POST']];
for(const [path,method]of protectedRequests)test('Render protects '+method+' '+path+' before lookup',async()=>{
 let budgetCalls=0;const run=proxy({},async(_db,kind,identity)=>{budgetCalls++;assert.equal(kind,'LOOKUP');assert.equal(identity,'192.0.2.8');return null;});
 const denied=await run(request({'x-forwarded-for':'192.0.2.8'},path,method));assert.equal(denied.status,503);assert.equal(budgetCalls,0);assert.equal(denied.headers.get('retry-after'),'5');assert.equal(denied.headers.get('cache-control'),'no-store');
 assert.equal((await run(request({'cf-connecting-ip':'::ffff:192.0.2.8'},path,method))).status,200);assert.equal(budgetCalls,1);
});
test('unrelated routes do not acquire the new ingress gate',async()=>{
 const run=proxy({},async()=>{assert.fail('Unexpected request budget access');});
 for(const [path,method]of [['/login/manager','GET'],['/api/auth/login','POST'],['/api/admin/businesses/synthetic','DELETE'],['/api/setup','POST'],['/api/setup/account-code','POST'],['/setup/account-code','GET'],['/api/stripe/connect','POST'],['/api/stripe/webhook','POST'],['/api/public/checkout/start','POST'],['/AB-1234/review','GET']])assert.equal((await run(request({},path,method))).status,200);
});
test('canonical Render identities share the original durable per-IP budget across routes and spoofed forwarding values',async()=>{
 const h=await harness('ACH','isolated');const budget=h.load('lib/publicRequestBudget.ts');assert.deepEqual(JSON.parse(JSON.stringify(budget.PUBLIC_REQUEST_LIMITS.LOOKUP)),{limit:120,windowMs:600000,globalLimit:3000});
 const before=await h.payments(),run=proxy(h.db,budget.publicRequestGuard);
 const results=await Promise.all(Array.from({length:121},(_,i)=>{const [path,method]=protectedRequests[i%protectedRequests.length];return run(request({'cf-connecting-ip':i%2?'192.0.2.8':'::ffff:c000:208','x-forwarded-for':'198.51.100.'+(i%250+1)},path,method));}));
 assert.equal(results.filter(r=>r.status===200).length,120);assert.equal(results.filter(r=>r.status===429).length,1);
 const denied=await run(request({'cf-connecting-ip':'192.0.2.8','x-forwarded-for':'203.0.113.99'}));assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0);
 assert.equal((await run(request({'cf-connecting-ip':'192.0.2.9'}))).status,200);assert.deepEqual(await h.payments(),before);assert.equal(h.calls.creates.length,0);
 const rows=await h.db.publicRequestBudget.findMany({where:{key:{startsWith:'LOOKUP:'},expiresAt:{lte:new Date(8640000000000000)}},take:100});assert.ok(rows.every(row=>!row.key.includes('192.0.2.')));
});
test('original global budget still rejects a new Render IP',async()=>{
 const h=await harness('ACH','isolated'),budget=h.load('lib/publicRequestBudget.ts'),run=proxy(h.db,budget.publicRequestGuard);assert.equal((await run(request({'cf-connecting-ip':'192.0.2.8'}))).status,200);
 await h.db.publicRequestBudget.upsert({where:{key:'LOOKUP:global'},create:{},update:{count:3000}});assert.equal((await run(request({'cf-connecting-ip':'198.51.100.9'}))).status,429);
});
for(const kind of ['missing budget key','database transaction failure'])test(kind+' still fails closed after valid Render ingress',async()=>{
 const budget=load('lib/publicRequestBudget.ts',kind==='missing budget key'?{}:{STRIPE_SECRET_KEY:'sk_test_no_network'});
 let transactions=0;const db={$transaction:async()=>{transactions++;throw new Error('Private database detail must not escape');}};
 const response=await proxy(db,budget.publicRequestGuard)(request({'cf-connecting-ip':'192.0.2.8'}));assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'5');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{error:'Temporarily unavailable. Please try again later.'});assert.equal(transactions,kind==='missing budget key'?0:1);
});
test('schema, every migration, limiter, proxy and payment/account-code endpoints are unchanged',()=>{
 const paths=['prisma/schema.prisma','lib/publicRequestBudget.ts','proxy.ts','app/api/setup/account-code/route.ts','app/api/setup/account-code/availability/route.ts','app/api/public/checkout/session/route.ts','app/api/public/checkout/start/route.ts','app/api/stripe/connect/route.ts'];
 paths.push(...execFileSync('git',['ls-files','prisma/migrations'],{encoding:'utf8'}).trim().split('\n'));
 for(const path of paths)assert.equal(readFileSync(path,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'}).replaceAll('\r\n','\n'),path);
});
