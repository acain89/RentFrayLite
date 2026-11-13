import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { harness } from './payment-readiness.test.mjs';
const require=createRequire(import.meta.url);
const {NextRequestAdapter}=require('next/dist/server/web/spec-extension/adapters/next-request.js');
const {NodeNextRequest}=require('next/dist/server/base-http/node.js');
const path='app/api/setup/recurring/review/route.ts',url='https://example.test/api/setup/recurring/review';
function fixture(){const h=harness();Object.assign(h.state.business,{status:'SETUP',setupStep:'REVIEW_RECURRING',setupCompletedAt:null,createdAt:new Date('2026-11-12T12:00:00Z'),propertyTimeZone:'America/Chicago',firstStandardBillingDate:new Date('2026-12-01T00:00:00Z')});return h;}
function adapted(chunks=[],headers={}){
 const incoming=Readable.from(chunks);incoming.method='POST';incoming.url=url;incoming.headers={origin:'https://example.test',...headers};
 return NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming),new AbortController().signal);
}
function plain(body,headers={}){return new Request(url,{method:'POST',headers:{origin:'https://example.test',...headers},...(body===undefined?{}:{body})});}

test('regression: Next.js Content-Length 0 POST has a stream but must complete review',async()=>{
 const h=fixture(),req=adapted([],{'content-length':'0'});assert.ok(req.body);assert.equal(req.headers.get('content-length'),'0');
 const response=await h.load(path).POST(req);assert.equal(response.status,200);assert.deepEqual(await response.json(),{saved:true,redirectTo:'/setup/stripe'});assert.equal(h.state.business.setupStep,'CONNECT_STRIPE');assert.equal(h.calls.stripeCreates.length,0);
});
for(const [name,request] of [['null body',()=>plain()],['explicit empty string',()=>plain('',{'content-length':'0'})],['Next empty stream without length',()=>adapted()]])test(`legitimate empty POST: ${name}`,async()=>{
 const h=fixture(),before=structuredClone(h.state.business.recurringPlans);assert.equal((await h.load(path).POST(request())).status,200);assert.equal(h.state.business.setupStep,'CONNECT_STRIPE');assert.deepEqual(h.state.business.recurringPlans,before);assert.equal(h.calls.stripeCreates.length,0);
});
for(const [i,body] of ['{}','null',' ','{bad','x'.repeat(1024*1024),new Uint8Array([0])].entries())test(`nonempty body rejects without setup changes: ${i}`,async()=>{
 const h=fixture(),response=await h.load(path).POST(plain(body));assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'This action does not accept a request body.'});assert.equal(h.state.business.setupStep,'REVIEW_RECURRING');assert.equal(h.calls.writes.length,0);assert.equal(h.calls.stripeCreates.length,0);
});
for(const [name,request] of [['lying zero length',()=>adapted([Buffer.from('x')],{'content-length':'0'})],['positive length',()=>adapted([Buffer.from('x')],{'content-length':'1'})],['malformed length',()=>adapted([],{'content-length':'bad'})]])test(`stream framing rejects: ${name}`,async()=>{
 const h=fixture();assert.equal((await h.load(path).POST(request())).status,400);assert.equal(h.calls.writes.length,0);
});
for(const origin of [undefined,'null','https://attacker.test','http://example.test'])test(`invalid origin stops before body inspection: ${origin}`,async()=>{
 const h=fixture(),req=adapted([],{'content-length':'0'});if(origin===undefined)req.headers.delete('origin');else req.headers.set('origin',origin);
 assert.equal((await h.load(path).POST(req)).status,403);assert.equal(req.bodyUsed,false);assert.equal(h.calls.writes.length,0);
});
test('cross-site marker remains rejected',async()=>{const h=fixture();assert.equal((await h.load(path).POST(adapted([],{'sec-fetch-site':'cross-site'}))).status,403);assert.equal(h.calls.writes.length,0);});
for(const state of ['absent session','wrong business'])test(`authorization rejects ${state}`,async()=>{
 const h=fixture();if(state==='absent session')h.state.session=false;else h.state.managerBusinessId='other';
 assert.equal((await h.load(path).POST(adapted([],{'content-length':'0'}))).status,401);assert.equal(h.calls.writes.length,0);
});
test('invalid setup configuration remains blocked',async()=>{const h=fixture();h.state.business.recurringPlans=[];assert.equal((await h.load(path).POST(adapted())).status,409);assert.equal(h.calls.writes.length,0);});
test('broken stream fails closed',async()=>{
 const h=fixture(),body=new ReadableStream({start(c){c.error(Error('synthetic read failure'));}});const req=new Request(url,{method:'POST',headers:{origin:'https://example.test'},body,duplex:'half'});assert.equal((await h.load(path).POST(req)).status,400);assert.equal(h.calls.writes.length,0);
});
test('stalled stream is bounded and cancelled',async t=>{
 const h=fixture();t.mock.timers.enable({apis:['setTimeout']});let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});const req=new Request(url,{method:'POST',headers:{origin:'https://example.test'},body,duplex:'half'});
 const pending=h.load(path).POST(req);await Promise.resolve();t.mock.timers.tick(10000);const response=await pending;assert.equal(response.status,400);assert.equal(cancelled,true);assert.equal(h.calls.writes.length,0);
});
test('unbounded empty chunks fail closed',async()=>{
 const h=fixture();let cancelled=false;const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array());},cancel(){cancelled=true;}});const req=new Request(url,{method:'POST',headers:{origin:'https://example.test'},body,duplex:'half'});assert.equal((await h.load(path).POST(req)).status,400);assert.equal(cancelled,true);assert.equal(h.calls.writes.length,0);
});

test('real Review client empty POST advances to Stripe without provider access',async()=>{
 const {build}=await import('esbuild'),{chromium,expect}=await import('@playwright/test');const h=fixture();
 const tier={id:'plan-owner',name:'Rent',baseAmountCents:100000,dueDay:1,gracePeriodDays:1,initialLateFeeCents:0,dailyLateFeeCents:0,dailyLateFeeMaxDays:0,charges:[]};
 const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './app/setup/recurring/review/RecurringReviewClient.tsx';createRoot(document.getElementById('root')).render(React.createElement(Client,"+JSON.stringify({tiers:[tier],highestReachedStep:5})+"));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'local-next',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/link'?"import React from 'react';export default function Link({href,children,...p}){return React.createElement('a',{href,...p},children);}":"export function useRouter(){return {push:url=>window.__redirect=url,refresh:()=>{}};}",loader:'js',resolveDir:process.cwd()}));
 }}]});
 const browser=await chromium.launch({headless:true});const external=[];let calls=0;
 try{const page=await browser.newPage();page.setDefaultTimeout(15000);await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin!=='https://example.test'){external.push(u.origin);return route.abort();}
 if(u.pathname==='/api/setup/recurring/review'){
 calls++;assert.equal(req.method(),'POST');assert.ok(req.postData()===null||req.postData()==='');
 const response=await h.load(path).POST(adapted([],{'content-length':'0'}));return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }
 return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'});
 });await page.goto('https://example.test/setup/recurring/review');await page.getByRole('button',{name:'Continue to Stripe',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__redirect)).toBe('/setup/stripe');assert.equal(calls,1);assert.equal(h.state.business.setupStep,'CONNECT_STRIPE');assert.equal(h.calls.stripeCreates.length,0);assert.deepEqual(external,[]);
 }finally{await browser.close();}
});
