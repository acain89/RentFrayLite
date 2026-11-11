import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';
import path from 'node:path';
import os from 'node:os';
import {harness,postgres} from './helpers/checkout-harness.mjs';
const require=createRequire(import.meta.url),secret='proxy-test-secret-with-at-least-32-bytes',webhookSecret='whsec_exact_raw_test',sdk=new Stripe('sk_test_no_network');
// Same explicit disposable fields as checkout-harness; no URL/env fallback.
function lookupRestartUrl(config){
 const invalid=()=>{throw Error('LOOKUP_RESTART_CONFIG_INVALID');};
 if(!config||typeof config!=='object'||Array.isArray(config))invalid();
 if(['env','url','connectionString','DATABASE_URL','DIRECT_URL','datasources'].some(key=>Object.hasOwn(config,key)))invalid();
 if(config.isolationVerified!==true||config.host!=='127.0.0.1'||typeof config.role!=='string'||!/^rfl_s5_[a-f0-9]{12}$/.test(config.role)||config.database!==config.role)invalid();
 if(!Number.isInteger(config.port)||config.port<=1024||config.port>=65536||config.port===5432||typeof config.password!=='string'||!config.password)invalid();
 if(typeof config.data!=='string'||!path.isAbsolute(config.data)||!/^rfl-b1-pg-[a-f0-9]{32}$/.test(path.basename(config.data))||path.resolve(config.data)!==path.resolve(os.tmpdir(),path.basename(config.data)))invalid();
 return `postgresql://${encodeURIComponent(config.role)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
}
function loadLookupRestartConfig(args=process.argv,read=readFileSync){
 const file=args.find(arg=>arg.startsWith('--rfl-test-db-config='))?.slice('--rfl-test-db-config='.length);
 if(!file)throw Error('LOOKUP_RESTART_CONFIG_MISSING');
 let config;
 try{config=JSON.parse(read(file,'utf8'));}catch{throw Error('LOOKUP_RESTART_CONFIG_INVALID');}
 lookupRestartUrl(config);return config;
}
async function openLookupRestartClient(config,Client){
 const url=lookupRestartUrl(config); // Validate BEFORE constructing/connecting.
 const client=new Client({datasources:{db:{url}}});
 try{
  const [identity]=await client.$queryRawUnsafe("SELECT current_user AS username,current_database() AS database,current_setting('data_directory') AS directory,host(inet_server_addr()) AS address,inet_server_port() AS port,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,(SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user) AS createdb,(SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user) AS createrole");
  if(!identity||identity.username!==config.role||identity.database!==config.database||identity.address!==config.host||identity.port!==config.port||typeof identity.directory!=='string'||path.resolve(identity.directory)!==path.resolve(config.data)||identity.superuser!==false||identity.createdb!==false||identity.createrole!==false)throw Error('LOOKUP_RESTART_IDENTITY_MISMATCH');
  return client;
 }catch(error){await client.$disconnect();throw error;}
}
function load(file,mocks={},env={}) {
 const output=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};vm.runInThisContext('(function(require,module,exports,process){'+output+'\n})')(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts',mocks,env);
  return require(name);
 },m,m.exports,{env});return m.exports;
}
const sign=(url='https://example.test/AB1234',ip='192.0.2.1',method='GET',time=Date.now())=>{
 const timestamp=String(time),signature=createHmac('sha256',secret).update(['rfl-lookup-ip-v1',timestamp,method,new URL(url).pathname,ip].join('\n')).digest('hex');
 const r=new Request(url,{method,headers:{'x-rfl-client-ip':ip,'x-rfl-client-time':timestamp,'x-rfl-client-signature':signature}});r.nextUrl=new URL(url);return r;
};
const ipModule=load('lib/verifiedLookupIp.ts',{}, {RFL_LOOKUP_PROXY_SECRET:secret});
for(const ip of ['192.0.2.1','2001:db8::1','::ffff:192.0.2.1'])test('valid proxy assertion: '+ip,()=>assert.ok(ipModule.verifiedLookupIp(sign(undefined,ip))));
for(const [name,alter]of [
 ['forwarded only',r=>{r.headers.delete('x-rfl-client-signature');r.headers.set('x-forwarded-for','192.0.2.1');r.headers.set('x-real-ip','192.0.2.1');}],
 ['forged signature',r=>r.headers.set('x-rfl-client-signature','0'.repeat(64))],
 ['changed IP',r=>r.headers.set('x-rfl-client-ip','192.0.2.2')],
 ['malformed IP',r=>r.headers.set('x-rfl-client-ip','192.0.2.1, 192.0.2.2')],
 ['changed path',r=>Object.defineProperty(r,'url',{value:'https://example.test/CD5678'})],
 ['changed method',r=>Object.defineProperty(r,'method',{value:'HEAD'})],
 ['expired assertion',r=>r.headers.set('x-rfl-client-time',String(Date.now()-60000))],
])test('rejects '+name,()=>{const r=sign();alter(r);assert.equal(ipModule.verifiedLookupIp(r),null);});
test('missing/short proxy secret fails closed',()=>{for(const value of [undefined,'short'])assert.equal(load('lib/verifiedLookupIp.ts',{}, {RFL_LOOKUP_PROXY_SECRET:value}).verifiedLookupIp(sign()),null);});
test('equivalent IP spellings share identity and forwarded headers cannot override',()=>{
 assert.equal(ipModule.verifiedLookupIp(sign(undefined,'2001:0db8:0000::1')),ipModule.verifiedLookupIp(sign(undefined,'2001:db8::1')));
 assert.equal(ipModule.verifiedLookupIp(sign(undefined,'::ffff:192.0.2.1')),'192.0.2.1');
 const r=sign();r.headers.set('x-forwarded-for','198.51.100.1');assert.equal(ipModule.verifiedLookupIp(r),'192.0.2.1');
});
for(const backend of ['isolated',...(postgres?['postgres']:[])]) {
 test(backend+': lookup concurrency, shared IP, expiry, durable restart, privacy and no financial writes',async()=>{
  const h=await harness('ACH',backend),budget=h.load('lib/publicRequestBudget.ts'),identity=randomUUID(),limit=budget.PUBLIC_REQUEST_LIMITS.LOOKUP.limit;
  if(backend==='postgres')await h.db.publicRequestBudget.deleteMany({where:{}});
  const before=await h.payments();const results=await Promise.all(Array.from({length:limit+10},()=>budget.reservePublicRequest(h.db,'LOOKUP',identity)));
  assert.equal(results.filter(r=>r.allowed).length,limit);
  const denied=await budget.publicRequestGuard(h.db,'LOOKUP',identity);assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))<=600);assert.ok(Number(denied.headers.get('retry-after'))>0);
  const other=await harness('ACH',backend);let independent=h.db; if(backend==='postgres'){independent=await openLookupRestartClient(loadLookupRestartConfig(),postgres.constructor);}try{assert.equal((await other.load('lib/publicRequestBudget.ts').reservePublicRequest(independent,'LOOKUP',identity)).allowed,false);}finally{if(independent!==h.db)await independent.$disconnect();}
  assert.equal((await budget.reservePublicRequest(h.db,'LOOKUP',identity+'other')).allowed,true);
  const rows=await h.db.publicRequestBudget.findMany({where:{key:{startsWith:'LOOKUP:'},expiresAt:{lte:new Date(Date.now()+86400000)}},take:100});assert.ok(rows.every(r=>!r.key.includes(identity)));
  if(backend==='postgres')await h.db.publicRequestBudget.updateMany({where:{key:{startsWith:'LOOKUP:'}},data:{expiresAt:new Date(0)}});
  else for(const row of rows)await h.db.publicRequestBudget.upsert({where:{key:row.key},create:{},update:{expiresAt:new Date(0)}});
  assert.equal((await budget.reservePublicRequest(h.db,'LOOKUP',identity)).allowed,true);assert.deepEqual(await h.payments(),before);assert.equal(h.calls.creates.length,0);
  if(backend==='postgres')console.log('RFL_LOOKUP_RESTART_PROOF '+JSON.stringify({independentClient:true,identityVerified:true,durableBudgetDenied:true,expiryRecovered:true,privacyChecked:true,financialSnapshotsUnchanged:true,providerCreates:0}));
 });
 test(backend+': proxy budgets all property guesses and quote POST before resolution',async()=>{
  const h=await harness('ACH',backend);if(backend==='postgres')await h.db.publicRequestBudget.deleteMany({where:{}});
  const proxy=load('proxy.ts',{'next/server':{NextResponse:{next:()=>new Response(null,{status:200}),json:Response.json}},'@/lib/prisma':{prisma:h.db},'@/lib/publicRequestBudget':h.load('lib/publicRequestBudget.ts'),'@/lib/verifiedLookupIp':ipModule}).proxy;
  for(let i=0;i<120;i++){const r=sign('https://example.test/'+(i%2?'ZZ9999':'AB1234'));assert.equal((await proxy(r)).status,200);}
  for(const url of ['https://example.test/AB1234','https://example.test/ZZ9999','https://example.test/api/setup/account-code/availability?code=ZZ-9999','https://example.test/api/public/checkout/session']){const r=sign(url,'192.0.2.1',url.includes('/checkout/session')?'POST':'GET');assert.equal((await proxy(r)).status,429);}
  assert.equal((await proxy(sign(undefined,'192.0.2.2'))).status,200);
  const unsigned=new Request('https://example.test/AB1234',{headers:{'x-forwarded-for':'192.0.2.2'}});unsigned.nextUrl=new URL(unsigned.url);assert.equal((await proxy(unsigned)).status,503);
  for(const path of ['/login/manager','/api/auth/login','/api/stripe/webhook','/payment/success','/privacy','/AB1234/review']){const r=new Request('https://example.test'+path);r.nextUrl=new URL(r.url);assert.equal((await proxy(r)).status,200);}
 });
}
function webhook(){let verified=0,processed=0;const route=load('app/api/stripe/webhook/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/stripe':{getStripeClient:()=>({webhooks:{constructEvent:(...args)=>{verified++;return sdk.webhooks.constructEvent(...args);}}})},'@/lib/stripePaymentWebhook':{processStripePaymentEvent:async()=>{processed++;}}},{STRIPE_WEBHOOK_SECRET:webhookSecret});return {...route,counts:()=>({verified,processed})};}
const request=(bytes,signature,headers={})=>new Request('https://example.test/api/stripe/webhook',{method:'POST',body:bytes,headers:{'stripe-signature':signature??'invalid',...headers}});
for(const [name,headers]of [['no length',{}],['underreported',{'content-length':'1'}],['declared',{'content-length':String(1024*1024+1)}]])test('oversize webhook '+name+' rejected before signature/provider work',async()=>{const h=webhook();assert.equal((await h.POST(request('x'.repeat(1024*1024+1),undefined,headers))).status,413);assert.deepEqual(h.counts(),{verified:0,processed:0});});
test('chunked oversize cancels stream',async()=>{let cancelled=false;const h=webhook(),stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(65536));},cancel(){cancelled=true;}});const r=new Request('https://example.test/api/stripe/webhook',{method:'POST',body:stream,duplex:'half',headers:{'stripe-signature':'invalid'}});assert.equal((await h.POST(r)).status,413);assert.equal(cancelled,true);assert.deepEqual(h.counts(),{verified:0,processed:0});});
for(const padding of [0,1024*1024-170])test('signed exact UTF8 bytes and retry, padding '+padding,async()=>{const h=webhook();const raw=Buffer.from(' {"id":"evt_raw", "object":"event", "type":"test.event", "data":{"object":{"text":"café ☃","padding":"'+'x'.repeat(padding)+'"}}}\n');assert.ok(raw.length<=1024*1024);const sig=sdk.webhooks.generateTestHeaderString({payload:raw.toString('utf8'),secret:webhookSecret});for(let i=0;i<2;i++)assert.equal((await h.POST(request(raw,sig))).status,200);assert.deepEqual(h.counts(),{verified:2,processed:2});assert.equal((await h.POST(request(Buffer.concat([raw,Buffer.from(' ')]),sig))).status,400);assert.equal(h.counts().processed,2);});
for(const [name,headers]of [['bad length',{'content-length':'invalid'}],['truncated',{'content-length':'5'}]])test('webhook '+name+' safe error',async()=>{const h=webhook();assert.equal((await h.POST(request('{}',undefined,headers))).status,400);assert.equal(h.counts().processed,0);});
test('genuinely signed expired/future assertions and scoped IPv6 are rejected',()=>{
 for(const delta of [-60000,60000])assert.equal(ipModule.verifiedLookupIp(sign(undefined,undefined,undefined,Date.now()+delta)),null);
 assert.equal(ipModule.verifiedLookupIp(sign(undefined,'fe80::1%eth0')),null);
});
test('proxy intercepts encoded code variants',async()=>{
 const calls=[];const proxy=load('proxy.ts',{'next/server':{NextResponse:{next:()=>new Response(null,{status:200}),json:Response.json}},'@/lib/prisma':{prisma:{}},'@/lib/publicRequestBudget':{publicRequestGuard:async(...args)=>{calls.push(args);return new Response(null,{status:429});}},'@/lib/verifiedLookupIp':ipModule}).proxy;
 for(const path of ['/AB1234','/ab-1234','/%41%421234','/%2541%25421234','/%20AB1234%20','/AB1234%20/','/API/SETUP/ACCOUNT-CODE/AVAILABILITY'])assert.equal((await proxy(sign('https://example.test'+path))).status,429);
 assert.equal(calls.length,7);
});
test('exact 1 MiB signed webhook accepted without byte transformation',async()=>{
 const h=webhook(),prefix='{"id":"evt_limit","object":"event","type":"test.event","data":{"object":{"padding":"',suffix='"}}}';const raw=prefix+'x'.repeat(1024*1024-Buffer.byteLength(prefix+suffix))+suffix;assert.equal(Buffer.byteLength(raw),1024*1024);const sig=sdk.webhooks.generateTestHeaderString({payload:raw,secret:webhookSecret});assert.equal((await h.POST(request(raw,sig))).status,200);assert.equal(h.counts().processed,1);
});

const syntheticRestartConfig=()=>({isolationVerified:true,host:'127.0.0.1',port:15433,role:'rfl_s5_0123456789ab',database:'rfl_s5_0123456789ab',password:'synthetic:password/@?',data:path.join(os.tmpdir(),'rfl-b1-pg-'+'a'.repeat(32))});
function restartClientSpy(config,patch={}){
 const calls={construct:0,queries:0,mutations:0,disconnect:0,urls:[]};
 class Client{
  constructor(options){calls.construct++;calls.urls.push(options.datasources.db.url);}
  async $queryRawUnsafe(sql){calls.queries++;assert.match(sql,/^SELECT current_user/);return [{username:config.role,database:config.database,address:config.host,port:config.port,directory:config.data,superuser:false,createdb:false,createrole:false,...patch}];}
  async $executeRawUnsafe(){calls.mutations++;throw Error('Mutation forbidden in identity verification');}
  async $disconnect(){calls.disconnect++;}
 }
 return {Client,calls};
}
test('lookup restart accepts the explicit verified contract and verifies identity read-only',async()=>{
 const config=syntheticRestartConfig(),spy=restartClientSpy(config);
 const client=await openLookupRestartClient(config,spy.Client);
 assert.equal(spy.calls.construct,1);assert.equal(spy.calls.queries,1);assert.equal(spy.calls.mutations,0);
 const url=new URL(spy.calls.urls[0]);assert.equal(url.hostname,config.host);assert.equal(url.port,String(config.port));assert.equal(url.pathname,'/'+config.database);assert.equal(decodeURIComponent(url.password),config.password);
 await client.$disconnect();assert.equal(spy.calls.disconnect,1);
});
test('lookup restart loader reads only its explicit disposable config file',()=>{
 const config=syntheticRestartConfig(),reads=[];
 const actual=loadLookupRestartConfig(['node','--rfl-test-db-config=synthetic-config.json'],(file,encoding)=>{reads.push([file,encoding]);return JSON.stringify(config);});
 assert.deepEqual(actual,config);assert.deepEqual(reads,[['synthetic-config.json','utf8']]);
});
for(const [name,mutate]of [
 ['absent',()=>undefined],['null',()=>null],['array',()=>[]],['raw production URL',()=> 'postgresql://synthetic@production.invalid/shared'],['empty object',()=>({})],
 ['unverified',c=>({...c,isolationVerified:false})],['string verification flag',c=>({...c,isolationVerified:'true'})],
 ['non-loopback target',c=>({...c,host:'production.invalid'})],['wildcard target',c=>({...c,host:'0.0.0.0'})],['localhost alias',c=>({...c,host:'localhost'})],
 ['shared default port',c=>({...c,port:5432})],['invalid port',c=>({...c,port:65536})],['string port',c=>({...c,port:'15433'})],
 ['unrestricted role',c=>({...c,role:'postgres',database:'postgres'})],['wrong database identity',c=>({...c,database:'shared'})],
 ['missing credentials',c=>({...c,password:undefined})],['malformed credentials',c=>({...c,password:{}})],['missing directory',c=>({...c,data:undefined})],
 ['non-disposable directory',c=>({...c,data:path.join(os.tmpdir(),'shared-data')})],['wrong directory identity',c=>({...c,data:path.join(path.parse(os.tmpdir()).root,'shared','rfl-b1-pg-'+'a'.repeat(32))})],
 ['production URL override',c=>({...c,url:'postgresql://synthetic@production.invalid/shared'})],
 ['shared connection-string override',c=>({...c,connectionString:'postgresql://synthetic@127.0.0.1:5432/shared'})],
 ['DATABASE_URL override',c=>({...c,DATABASE_URL:'postgresql://synthetic@production.invalid/shared'})],
 ['DIRECT_URL override',c=>({...c,DIRECT_URL:'postgresql://synthetic@production.invalid/shared'})],
 ['obsolete env object',c=>({...c,env:{DATABASE_URL:'postgresql://synthetic@production.invalid/shared'}})],
 ['datasource override',c=>({...c,datasources:{db:{url:'postgresql://synthetic@production.invalid/shared'}}})],
])test('lookup restart rejects '+name+' before client construction or mutation',async()=>{
 const config=syntheticRestartConfig(),spy=restartClientSpy(config);
 await assert.rejects(()=>openLookupRestartClient(mutate(config),spy.Client),/LOOKUP_RESTART_CONFIG_INVALID/);
 assert.equal(spy.calls.construct,0);assert.equal(spy.calls.queries,0);assert.equal(spy.calls.mutations,0);
});
for(const [name,patch]of [
 ['role',{username:'postgres'}],['database',{database:'shared'}],['address',{address:'192.0.2.1'}],['port',{port:5432}],['directory',{directory:os.tmpdir()}],
 ['superuser',{superuser:true}],['createdb',{createdb:true}],['createrole',{createrole:true}],
])test('lookup restart rejects live '+name+' mismatch before business operations',async()=>{
 const config=syntheticRestartConfig(),spy=restartClientSpy(config,patch);
 await assert.rejects(()=>openLookupRestartClient(config,spy.Client),/LOOKUP_RESTART_IDENTITY_MISMATCH/);
 assert.equal(spy.calls.construct,1);assert.equal(spy.calls.queries,1);assert.equal(spy.calls.disconnect,1);assert.equal(spy.calls.mutations,0);
});
for(const [name,args]of [['missing flag',[]],['empty flag',['--rfl-test-db-config=']]])test('lookup restart loader rejects '+name+' without reading files',()=>{
 let reads=0;assert.throws(()=>loadLookupRestartConfig(args,()=>{reads++;}),/LOOKUP_RESTART_CONFIG_MISSING/);assert.equal(reads,0);
});
for(const [name,read]of [
 ['missing file',()=>{throw Error('SYNTHETIC_PRIVATE_MARKER');}],
 ['malformed JSON',()=>'{"password":"SYNTHETIC_PRIVATE_MARKER'],
 ['malformed object',()=>JSON.stringify(null)],
])test('lookup restart loader rejects '+name+' without leaking raw configuration',()=>{
 assert.throws(()=>loadLookupRestartConfig(['--rfl-test-db-config=synthetic.json'],read),error=>error.message==='LOOKUP_RESTART_CONFIG_INVALID'&&!error.message.includes('SYNTHETIC_PRIVATE_MARKER'));
});
test('lookup restart never falls back to DATABASE_URL or DIRECT_URL',async()=>{
 // Test processes must be clean before installing synthetic sentinel values;
 // never read, overwrite or retain an inherited real URL.
 assert.equal(Object.hasOwn(process.env,'DATABASE_URL'),false);assert.equal(Object.hasOwn(process.env,'DIRECT_URL'),false);
 process.env.DATABASE_URL='postgresql://synthetic@production.invalid/shared';process.env.DIRECT_URL='postgresql://synthetic@shared.invalid/shared';
 try{
  const config=syntheticRestartConfig(),spy=restartClientSpy(config);
  await assert.rejects(()=>openLookupRestartClient(undefined,spy.Client),/LOOKUP_RESTART_CONFIG_INVALID/);assert.equal(spy.calls.construct,0);
  const client=await openLookupRestartClient(config,spy.Client);assert.equal(new URL(spy.calls.urls[0]).hostname,'127.0.0.1');assert.equal(new URL(spy.calls.urls[0]).pathname,'/'+config.database);await client.$disconnect();
 }finally{delete process.env.DATABASE_URL;delete process.env.DIRECT_URL;}
});
