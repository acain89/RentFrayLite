import assert from 'node:assert/strict';
import test from 'node:test';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {provisioningFixture} from './helpers/stripe-foundation-harness.mjs';
const require=createRequire(import.meta.url);
const {NextRequestAdapter}=require('next/dist/server/web/spec-extension/adapters/next-request.js');
const {NodeNextRequest}=require('next/dist/server/base-http/node.js');
const path='app/api/stripe/connect/route.ts',url='https://example.test/api/stripe/connect';
function adapted(chunks=[],headers={}){const incoming=Readable.from(chunks);incoming.method='POST';incoming.url=url;incoming.headers={origin:'https://example.test',...headers};return NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming),new AbortController().signal);}
function plain(body,headers={}){return new Request(url,{method:'POST',headers:{origin:'https://example.test',...headers},...(body===undefined?{}:{body})});}
async function noProvision(f){assert.equal(f.state.createCalls.length,0);assert.equal(f.state.links,0);assert.equal(f.state.reads,0);assert.equal(await f.journal(),null);assert.equal(await f.db.stripeConnection.count({where:{businessId:f.identity.businessId}}),0);}

test('regression: Next.js zero-byte Connect POST must reach mocked onboarding',async()=>{
 const f=await provisioningFixture(),req=adapted([],{'content-length':'0'});assert.ok(req.body);const response=await f.load(path).POST(req);assert.equal(response.status,200);assert.deepEqual(await response.json(),{redirectTo:'https://example.test/onboarding'});assert.equal(f.state.createCalls.length,1);assert.equal(f.state.links,1);
});
for(const [name,req] of [['null body',()=>plain()],['empty string',()=>plain('',{'content-length':'0'})],['Next empty stream without length',()=>adapted()]])test(`legitimate Connect empty POST: ${name}`,async()=>{
 const f=await provisioningFixture();assert.equal((await f.load(path).POST(req())).status,200);assert.equal(f.state.createCalls.length,1);assert.equal(f.state.links,1);assert.ok(await f.journal());
});
for(const [i,body] of ['{}','null',' ','{bad','x'.repeat(1024*1024),new Uint8Array([0])].entries())test(`Connect rejects nonempty body before provisioning: ${i}`,async()=>{
 const f=await provisioningFixture(),response=await f.load(path).POST(plain(body));assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'This action does not accept a request body.'});await noProvision(f);
});
for(const [name,req] of [['lying zero length',()=>adapted([Buffer.from('x')],{'content-length':'0'})],['positive length',()=>adapted([Buffer.from('x')],{'content-length':'1'})],['malformed length',()=>adapted([],{'content-length':'bad'})]])test(`Connect rejects invalid framing: ${name}`,async()=>{const f=await provisioningFixture();assert.equal((await f.load(path).POST(req())).status,400);await noProvision(f);});
for(const origin of [undefined,'null','https://attacker.test','http://example.test'])test(`Connect invalid origin rejects before body read: ${origin}`,async()=>{
 const f=await provisioningFixture(),req=adapted([],{'content-length':'0'});if(origin===undefined)req.headers.delete('origin');else req.headers.set('origin',origin);assert.equal((await f.load(path).POST(req)).status,403);assert.equal(req.bodyUsed,false);await noProvision(f);
});
test('Connect cross-site marker rejects',async()=>{const f=await provisioningFixture();assert.equal((await f.load(path).POST(adapted([],{'sec-fetch-site':'cross-site'}))).status,403);await noProvision(f);});
for(const name of ['missing session','revoked session','administrator'])test(`Connect unauthorized ${name} rejects`,async()=>{
 const f=await provisioningFixture();if(name==='missing session')f.jar.clear();else if(name==='revoked session')await f.db.session.deleteMany({where:{id:f.identity.id}});else await f.issue('ADMIN');assert.equal((await f.load(path).POST(adapted([],{'content-length':'0'}))).status,401);await noProvision(f);
});
test('Connect retains account and link parameters and idempotently reuses account',async()=>{
 const f=await provisioningFixture(),links=[],create=f.stripe.accountLinks.create;f.stripe.accountLinks.create=async(params,options)=>{links.push({params,options});return create(params,options);};
 for(let i=0;i<2;i++)assert.equal((await f.load(path).POST(adapted([],{'content-length':'0'}))).status,200);
 assert.equal(f.state.createCalls.length,1);assert.equal(f.state.accounts.size,1);assert.equal(f.state.links,2);const journal=await f.journal();
 assert.equal(f.state.createCalls[0].params.type,'express');assert.deepEqual(f.state.createCalls[0].params.capabilities,{transfers:{requested:true}});assert.equal(f.state.createCalls[0].options.idempotencyKey,'rfl-connect-v1-'+journal.id);
 for(const call of links){assert.deepEqual(call.params,{account:f.state.accountId,refresh_url:'https://example.test/api/stripe/onboard',return_url:'https://example.test/setup/stripe?returned=1',type:'account_onboarding'});assert.deepEqual(call.options,{timeout:5000,maxNetworkRetries:0});}
 assert.equal(await f.db.auditLog.count({where:{businessId:f.identity.businessId,action:'STRIPE_ACCOUNT_CREATED'}}),1);
});
test('Connect empty POST preserves persisted account on link failure',async()=>{
 const f=await provisioningFixture();f.state.failLink=true;assert.equal((await f.load(path).POST(adapted())).status,500);const before=await f.db.stripeConnection.findUnique({where:{businessId:f.identity.businessId}});assert.ok(before);f.state.failLink=false;assert.equal((await f.load(path).POST(adapted())).status,200);assert.equal(f.state.createCalls.length,1);assert.deepEqual(await f.db.stripeConnection.findUnique({where:{businessId:f.identity.businessId}}),before);
});
test('Connect broken stream fails closed',async()=>{
 const f=await provisioningFixture(),body=new ReadableStream({start(c){c.error(Error('synthetic stream failure'));}});assert.equal((await f.load(path).POST(new Request(url,{method:'POST',headers:{origin:'https://example.test'},body,duplex:'half'}))).status,400);await noProvision(f);
});
test('Connect stalled stream times out and cancels',async t=>{
 const f=await provisioningFixture();t.mock.timers.enable({apis:['setTimeout']});let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});const pending=f.load(path).POST(new Request(url,{method:'POST',headers:{origin:'https://example.test'},body,duplex:'half'}));await Promise.resolve();t.mock.timers.tick(10000);assert.equal((await pending).status,400);assert.equal(cancelled,true);await noProvision(f);
});
test('Connect endless empty chunks fail closed',async()=>{
 const f=await provisioningFixture();let cancelled=false;const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array());},cancel(){cancelled=true;}});assert.equal((await f.load(path).POST(new Request(url,{method:'POST',headers:{origin:'https://example.test'},body,duplex:'half'}))).status,400);assert.equal(cancelled,true);await noProvision(f);
});

test('actual BankSetupClient sends empty POST and follows mocked onboarding link only',async()=>{
 const {build}=await import('esbuild'),{chromium,expect}=await import('@playwright/test');const f=await provisioningFixture();
 const props={initialStatus:{exists:false,requirementsSummary:null},readiness:null,highestReachedStep:6,returnedFromStripe:false,initialError:null};
 const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './app/setup/stripe/BankSetupClient.tsx';createRoot(document.getElementById('root')).render(React.createElement(Client,"+JSON.stringify(props)+"));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'local-next',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/link'?"import React from 'react';export default function Link({href,children,...p}){return React.createElement('a',{href,...p},children);}":"export function useRouter(){return {push:()=>{},refresh:()=>{}};}",loader:'js',resolveDir:process.cwd()}));
 }}]});
 const browser=await chromium.launch({headless:true});let calls=0;const external=[];
 try{const page=await browser.newPage();page.setDefaultTimeout(15000);await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin!=='https://example.test'){external.push(u.origin);return route.abort();}
 if(u.pathname==='/api/stripe/connect'){
 calls++;assert.equal(req.method(),'POST');assert.ok(req.postData()===null||req.postData()==='');const response=await f.load(path).POST(adapted([],{'content-length':'0'}));return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }
 if(u.pathname==='/onboarding')return route.fulfill({contentType:'text/html',body:'<p>Local mocked onboarding destination</p>'});
 return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'});
 });await page.goto('https://example.test/setup/stripe');await page.getByRole('button',{name:'Connect Bank Account',exact:true}).click();await page.waitForURL('https://example.test/onboarding');await expect(page.getByText('Local mocked onboarding destination')).toBeVisible();assert.equal(calls,1);assert.equal(f.state.createCalls.length,1);assert.equal(f.state.links,1);assert.deepEqual(external,[]);
 }finally{await browser.close();}
});
