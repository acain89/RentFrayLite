import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import path from "node:path";
import os from "node:os";
import {mkdirSync} from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {build} from "esbuild";
import {chromium,expect} from "@playwright/test";
import {reportingFixture,reportingSignOut,assertReportingSignOutDestroyed,reportingBrowserBridge,interceptReportingBrowser,postgres} from "./helpers/reporting-harness.mjs";

const bundles=new Map();
const screenshotDir=process.env.RFL_DASHBOARD_SCREENSHOTS ?? path.join(os.tmpdir(),"rfl-dashboard-ui");
mkdirSync(screenshotDir,{recursive:true});
const dashboardCss=postcss([tailwind()]).process(readFileSync("app/globals.css","utf8"),{from:path.resolve("app/globals.css")}).then(result=>result.css+"\n:root{--font-geist-sans:Arial;}");
async function bundle(file){
 if(!bundles.has(file))bundles.set(file,build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './"+file+"';createRoot(document.getElementById('root')).render(React.createElement(Client,window.props));",resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",jsx:"automatic",plugins:[{name:"isolated-next",setup(b){
  b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:"fixture"}));
  b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="next/navigation"?"export const useRouter=()=>({refresh:()=>{window.__refreshCount=(window.__refreshCount||0)+1;},push:url=>window.location.assign(url),replace:url=>window.location.replace(url)});":"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children);}",loader:"js",resolveDir:process.cwd()}));
 }}]}).then(r=>r.outputFiles[0].text));
 return bundles.get(file);
}
async function serve(f,page,onSignOut){
 const csv=[];
 await page.context().route("**/*",async route=>{
  const url=new URL(route.request().url());if(url.origin!=="https://example.test")return route.abort();
  if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:"<h1>Signed out</h1>"});
  if(url.pathname==="/api/auth/logout"){
   const response=await reportingSignOut(f,route.request());
   onSignOut?.(response.clone());
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(url.pathname==="/api/manager/transactions/export"){
   const response=await f.endpoint(url.searchParams.toString()),body=await response.text();
   if(response.headers.get("content-type")?.includes("text/csv"))csv.push(body);
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
  }
  const dashboard=url.pathname==="/manager/dashboard",element=dashboard?await f.dashboardPage(url.searchParams.toString()):await f.history(url.searchParams.toString());
  const code=await bundle(dashboard?"app/manager/dashboard/ManagerDashboardClient.tsx":"app/manager/history/ManagerHistoryClient.tsx");
  const body='<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script>window.props='+JSON.stringify({...element.props,notificationHistory:null}).replaceAll("<","\\u003c")+';</script><script>'+code.replaceAll("</script","<\\/script")+'</script>';
  return route.fulfill({contentType:"text/html",body});
 });
 return csv;
}

test("history form filters server-side, paginates, and exports/prints every match",async()=>{
 const f=await reportingFixture(),first=await f.seed();const data={...first};delete data.id;
 await f.db.payment.createMany({data:Array.from({length:100},(_,n)=>({...data,payerFirstName:"Jane"+n,status:n<60?"RETURNED":"PAID",returnedAt:n<60?new Date("2026-12-01"):null}))});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(30000);const csv=await serve(f,page);await page.goto("https://example.test/manager/history");
  await expect(page.locator("tbody tr")).toHaveCount(50);await expect(page.getByRole("link",{name:"Next",exact:true})).toBeVisible();
  await page.getByLabel("Payment status",{exact:true}).selectOption("FAILED");
  await Promise.all([page.waitForURL(/status=FAILED/),page.getByRole("button",{name:"Apply filters"}).click()]);
  await expect(page.getByRole("heading",{name:"60 matching transactions"})).toBeVisible();await expect(page.locator("tbody tr")).toHaveCount(50);
  await page.getByRole("link",{name:"Next",exact:true}).click();await expect(page.locator("tbody tr")).toHaveCount(10);
  const download=page.waitForEvent("download");await page.getByRole("link",{name:"Export CSV"}).click();await download;
  assert.equal(csv.length,1);assert.equal(csv[0].split("\r\n").length,61);assert.match(csv[0],/Failed \(Returned\)/);
  const popup=page.context().waitForEvent("page");await page.getByRole("link",{name:"Print",exact:true}).click();const print=await popup;
  await print.waitForLoadState();await expect(print.locator("tbody tr")).toHaveCount(60);await print.emulateMedia({media:"print"});
  await expect(print.getByText("Use your browser Print command",{exact:false})).toBeHidden();
  await expect(page.getByText("Verified management proceeds",{exact:true}).first()).toHaveCount(1);
 }finally{await browser.close();}
});

for(const width of [360,390,1280])test("dashboard simplified navigation/statuses at viewport "+width,async()=>{
 const f=await reportingFixture();await f.seed({status:"RETURNED",returnedAt:new Date("2026-12-01")});await f.seed({status:"DISPUTED",disputedAt:new Date("2026-12-02")});await f.seed({status:"PENDING",paidAt:null});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width,height:900}});await serve(f,page);await page.goto("https://example.test/manager/dashboard");await page.addStyleTag({content:await dashboardCss});
  await expect(page.getByRole("link",{name:"Payment History",exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Manage",exact:true})).toBeVisible();
  await expect(page.getByText("Failed (Returned)",{exact:true})).toBeVisible();await expect(page.getByText(/^Disputed.*Dispute outcome unknown$/)).toBeVisible();
  await expect(page.getByRole("link",{name:"Returned",exact:true})).toHaveCount(0);await expect(page.getByText(/Instant Payout|unpaid|outstanding|expected rent/i)).toHaveCount(0);
  await page.getByRole("link",{name:"Issues",exact:true}).click();await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.addStyleTag({content:await dashboardCss});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,"No horizontal page overflow");
  await expect(page.getByRole("navigation",{name:"Transaction pages"})).toHaveCount(0);
  await expect(page.locator(".rfl-home-share span")).toHaveText("\u2197");await expect(page.locator(".rfl-home-code span")).toHaveText("\u2197");
  assert.equal(await page.locator("thead").evaluate(e=>getComputedStyle(e).display),width<640?"none":"table-header-group");
  await page.screenshot({path:path.join(screenshotDir,"dashboard-"+width+".png"),fullPage:true});
 }finally{await browser.close();}
});

test("open dashboard revalidates at the server-supplied month boundary without changing payment data",async()=>{
 const f=await reportingFixture();await f.seed();const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.addInitScript(()=>{
   window.__longTimers=[];const original=window.setTimeout.bind(window);
   window.setTimeout=(fn,delay,...args)=>{if(delay>3600000){window.__longTimers.push(fn);return 987654;}return original(fn,delay,...args);};
  });await serve(f,page);await page.goto("https://example.test/manager/dashboard");await expect(page.locator("tbody tr")).toHaveCount(1);
  assert.ok(await page.evaluate(()=>window.__longTimers.length>0));
  await page.evaluate(()=>{Date.now=()=>Date.parse(window.props.nextCycleAt)+1;window.__longTimers.at(-1)();window.dispatchEvent(new Event("focus"));});
  assert.equal(await page.evaluate(()=>window.__refreshCount),1);assert.equal((await f.list()).total,1);
 }finally{await browser.close();}
});

test("dashboard preserves existing sign-out endpoint and redirect behavior",async()=>{
 const f=await reportingFixture(),token=f.token(),target=await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(token)}});await f.issue('MANAGER',1);const other=await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(f.token())}});f.use(token);const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),observed=[];await serve(f,page,r=>observed.push(r));await page.goto("https://example.test/manager/dashboard");
  await page.getByLabel('Account menu',{exact:true}).click();const logout=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/logout');await page.getByRole("button",{name:"Sign Out",exact:true}).click();const response=await logout;assert.equal(response.status(),200);assert.equal(observed.length,1);await assertReportingSignOutDestroyed(observed[0],await f.db.session.findUnique({where:{id:target.id}}));await expect(page.getByRole("heading",{name:"Signed out"})).toBeVisible();
  assert.equal(await f.session.getCurrentSession(),null);
  assert.deepEqual(await f.db.session.findUnique({where:{id:other.id}}),other);
  console.log('RFL_REPORTING_SIGNOUT_PROOF '+JSON.stringify({httpStatus:response.status(),targetDeleted:true,currentSessionNull:true,otherBusinessSessionPreserved:true}));
 }finally{await browser.close();}
});


async function nativeReportingBridge(f){
 return reportingBrowserBridge(f,async(kind,props)=>{
  const file=kind==='login'?'app/login/manager/ManagerLoginClient.tsx':kind==='dashboard'?'app/manager/dashboard/ManagerDashboardClient.tsx':'app/manager/history/ManagerHistoryClient.tsx';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+readFileSync('app/globals.css','utf8').replace(/^@import "tailwindcss";\s*/,'')+'</style></head><body><div id="root"></div><script>window.props='+JSON.stringify({...props,notificationHistory:null}).replaceAll('<','\\u003c')+';</script><script>'+(await bundle(file)).replaceAll('</script','<\\/script')+'</script></body></html>';
 });
}
const browserOrigin='https://example.test';
for(const [width,height] of [[360,800],[390,844],[1024,768],[1440,900]])test('PostgreSQL native expired-session redirect/cookies '+width+'x'+height,{skip:!postgres},async()=>{
 assert.ok(postgres,'Verified disposable PostgreSQL configuration is required');const f=await reportingFixture('postgres');await f.seed({payerFirstName:'OWNER_A_MARKER'});await f.seed({businessId:f.businesses[1].id,payerFirstName:'OWNER_B_MARKER'});
 const seededHash=f.session.hashSessionToken(f.token()),seeded=await f.db.session.findUnique({where:{tokenHash:seededHash}}),bridge=await nativeReportingBridge(f),browser=await chromium.launch({headless:true}),transports=[];
 try{
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<500});page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(10000);transports.push(await interceptReportingBrowser(page,bridge));
  const ownCookie=async p=>(await p.context().cookies()).find(c=>c.name==='rfl_session');
  const denied=async(path,expiresCookie=false)=>{
   const url=browserOrigin+path,observed=page.waitForResponse(r=>r.url()===url&&r.request().isNavigationRequest());
   const before=bridge.events.length,final=await page.goto(url),response=await observed;
   assert.equal(response.status(),307);assert.equal(await response.headerValue('location'),'/login/manager');assert.equal(final.status(),200);assert.equal(page.url(),browserOrigin+'/login/manager');await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
   assert.equal(await page.getByText('OWNER_A_MARKER',{exact:false}).count(),0);assert.equal(await page.getByText('OWNER_B_MARKER',{exact:false}).count(),0);
   assert.equal(bridge.events.slice(before).filter(e=>e.status===307).length,1,'No redirect loop');
   // CDP-fulfilled redirects omit raw Set-Cookie in Playwright's response API.
   // Verify the exact emitted headers and Chromium's independently stored cookie.
   const emitted=bridge.events.slice(before).find(e=>e.path===path&&e.status===307);assert.equal(emitted.cookieHeaders,expiresCookie?1:0);
   if(expiresCookie){assert.equal(emitted.expiredSessionCookie,true);assert.equal(!!await ownCookie(page),false);}
  };
  const login=async(p,index)=>{await p.goto(browserOrigin+'/login/manager');await p.getByLabel('Email address',{exact:true}).fill(f.managers[index].email);await p.getByLabel('Password',{exact:true}).fill('old-password');const sent=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await p.getByRole('button',{name:'Sign In',exact:true}).click();assert.equal((await sent).status(),200);await p.waitForURL('**/manager/dashboard');const cookie=await ownCookie(p);assert.ok(cookie&&cookie.httpOnly&&cookie.secure&&cookie.sameSite==='Lax');assert.ok(cookie.expires>Date.now()/1000);assert.ok(await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(cookie.value)}}));return cookie;};
  await denied('/manager/history');assert.ok(await f.db.session.findUnique({where:{id:seeded.id}}),'Fixture jar must not authenticate the browser');
  const count=await f.db.session.count();await page.getByLabel('Email address',{exact:true}).fill(f.managers[0].email);await page.getByLabel('Password',{exact:true}).fill('wrong-password');const rejected=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await page.getByRole('button',{name:'Sign In',exact:true}).click();assert.equal((await rejected).status(),401);await expect(page.getByRole('alert')).toContainText('Unable to sign in');assert.equal(await f.db.session.count(),count);assert.equal(!!await ownCookie(page),false);
  const first=await login(page,0);await expect(page.getByText('OWNER_A_MARKER',{exact:false})).toBeVisible();assert.equal(await page.getByText('OWNER_B_MARKER',{exact:false}).count(),0);await page.getByRole('link',{name:'Payment History',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
  const cross=await page.evaluate(async url=>{const r=await fetch(url);return {status:r.status,body:await r.text()};},'/api/manager/transactions/export?businessId='+f.businesses[1].id);assert.equal(cross.status,400);assert.ok(!cross.body.includes('OWNER_B_MARKER'));
  const peer=await browser.newPage({viewport:{width,height}});peer.setDefaultTimeout(30000);transports.push(await interceptReportingBrowser(peer,bridge));const peerCookie=await login(peer,1),peerRow=await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(peerCookie.value)}});
  await page.goto(browserOrigin+'/manager/dashboard');await page.getByLabel('Account menu',{exact:true}).click();const logout=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/logout');await page.getByRole('button',{name:'Sign Out',exact:true}).click();const loggedOut=await logout;assert.equal(loggedOut.status(),200);await page.waitForURL(browserOrigin+'/');assert.equal(!!await ownCookie(page),false);assert.equal(await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(first.value)}}),null);
  await page.context().addCookies([first]);await denied('/manager/history');assert.ok(await ownCookie(page),'Server-component redirect must not fabricate cookie mutation');await denied('/api/manager/transactions/export',true);
  const timed=await login(page,0),expiredRow=await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(timed.value)}});await f.db.session.update({where:{id:expiredRow.id},data:{expiresAt:new Date(0)}});await denied('/manager/history');assert.equal(await f.db.session.findUnique({where:{id:expiredRow.id}}),null);assert.ok(await ownCookie(page));await denied('/api/manager/transactions/export',true);
  await page.context().addCookies([{name:'rfl_session',value:'synthetic-invalid-session',url:browserOrigin,httpOnly:true,secure:true,sameSite:'Lax',expires:Date.now()/1000+3600}]);await denied('/manager/history');await denied('/api/manager/transactions/export',true);
  await peer.goto(browserOrigin+'/manager/history');await expect(peer.getByText('OWNER_B_MARKER',{exact:false})).toBeVisible();assert.equal(await peer.getByText('OWNER_A_MARKER',{exact:false}).count(),0);assert.ok(await f.db.session.findUnique({where:{id:peerRow.id}}));assert.ok(await f.db.session.findUnique({where:{id:seeded.id}}));
  const blocked=await browser.newPage();transports.push(await interceptReportingBrowser(blocked,bridge));await assert.rejects(blocked.goto('https://unmatched-provider.invalid/'));await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  console.log('RFL_NATIVE_REDIRECT_PROOF '+JSON.stringify({browser:browser.version(),viewport:[width,height],finalUrl:page.url(),allRedirects307:true,location:'/login/manager',readOnlyCookieNotFabricated:true,handlerExpiryPreserved:true,revokedAndExpiredRowsRemoved:true,invalidSessionDenied:true,wrongPasswordRejected:true,unrelatedSessionUsable:true,crossBusinessDenied:true,noLoops:true,externalOriginBlocked:true,redirects:bridge.events.filter(e=>e.status===307).map(e=>({path:e.path,status:e.status,location:e.location,cookieHeaders:e.cookieHeaders}))}));
 }finally{try{for(const t of transports.reverse())await t.close();}finally{bridge.close();await browser.close();}}
});

for(const origin of [null,'https://cross-origin.invalid'])test('browser adapter preserves '+(origin?'invalid':'missing')+' Origin rejection',async()=>{
 const f=await reportingFixture(),hash=f.session.hashSessionToken(f.token()),row=await f.db.session.findUnique({where:{tokenHash:hash}}),bridge=await nativeReportingBridge(f);
 try{const headers={cookie:'rfl_session='+f.token(),...(origin?{origin}:{})};const response=await bridge.dispatch(new Request(browserOrigin+'/api/auth/logout',{method:'POST',headers}));assert.equal(response.status,403);assert.equal(response.headers.getSetCookie().length,0);assert.deepEqual(await f.db.session.findUnique({where:{id:row.id}}),row);}finally{bridge.close();}
});
test('browser adapter propagates unexpected errors rather than inventing a redirect',async()=>{const f=await reportingFixture(),bridge=await nativeReportingBridge(f);f.history=async()=>{throw Error('REDIRECT /login/manager');};try{await assert.rejects(bridge.dispatch(new Request(browserOrigin+'/manager/history')),/REDIRECT \/login\/manager/);}finally{bridge.close();}});
test('browser adapter requires an active request scope',async()=>{const f=await reportingFixture(),bridge=await nativeReportingBridge(f);try{await assert.rejects(f.session.getCurrentSession(),/BROWSER_REQUEST_SCOPE_REQUIRED/);}finally{bridge.close();}});
test('browser adapter keeps simultaneous cookie and business scopes independent',async()=>{
 const f=await reportingFixture(),a=f.token();await f.db.business.update({where:{id:f.businesses[1].id},data:{propertyTimeZone:'America/Chicago'}});await f.seed({payerFirstName:'SCOPE_A_ONLY'});await f.seed({businessId:f.businesses[1].id,payerFirstName:'SCOPE_B_ONLY'});await f.issue('MANAGER',1);const b=f.token(),bridge=await nativeReportingBridge(f);
 try{const responses=await Promise.all([a,b].map(t=>bridge.dispatch(new Request(browserOrigin+'/manager/history',{headers:{cookie:'rfl_session='+t}}))));const text=await Promise.all(responses.map(r=>r.text()));assert.ok(text[0].includes('SCOPE_A_ONLY')&&!text[0].includes('SCOPE_B_ONLY'));assert.ok(text[1].includes('SCOPE_B_ONLY')&&!text[1].includes('SCOPE_A_ONLY'));}finally{bridge.close();}
});
test('browser adapter does not use a valid fixture jar for a cookie-less request',async()=>{const f=await reportingFixture(),bridge=await nativeReportingBridge(f);try{const response=await bridge.dispatch(new Request(browserOrigin+'/manager/history'));assert.equal(response.status,307);assert.equal(response.headers.get('location'),'/login/manager');assert.equal(response.headers.getSetCookie().length,0);}finally{bridge.close();}});
test('browser adapter preserves multiple Set-Cookie values and expiration commas',async()=>{
 const f=await reportingFixture(),token=f.token(),load=f.load;f.load=name=>{const loadedRoute=load(name);return name==='app/api/auth/logout/route.ts'?{...loadedRoute,POST:async request=>{const response=await loadedRoute.POST(request);response.headers.append('set-cookie','fixture_pref=one; Path=/; Expires=Tue, 01 Jan 2030 00:00:00 GMT; SameSite=Strict');return response;}}:loadedRoute;};const bridge=await nativeReportingBridge(f);
 try{const response=await bridge.dispatch(new Request(browserOrigin+'/api/auth/logout',{method:'POST',headers:{origin:browserOrigin,cookie:'rfl_session='+token}}));assert.equal(response.status,200);assert.equal((await response.json()).success,true);const values=response.headers.getSetCookie();assert.equal(values.length,2);assert.ok(values.some(c=>c.startsWith('fixture_pref=one;')&&c.includes('Tue, 01 Jan 2030')));assert.ok(values.some(c=>c.startsWith('rfl_session=;')&&c.includes('1970')&&c.includes('HttpOnly')));assert.equal(await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(token)}}),null);}finally{bridge.close();}
});
test('browser adapter preserves POST body rejection before session destruction',async()=>{const f=await reportingFixture(),token=f.token(),bridge=await nativeReportingBridge(f);try{const response=await bridge.dispatch(new Request(browserOrigin+'/api/auth/logout',{method:'POST',headers:{origin:browserOrigin,cookie:'rfl_session='+token},body:'{}'}));assert.equal(response.status,400);assert.equal(response.headers.getSetCookie().length,0);assert.ok(await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(token)}}));}finally{bridge.close();}});


test("monthly summary covers all records, ignores list filters and excludes other businesses",async()=>{
 const f=await reportingFixture();
 for(const status of ["PAID","PENDING","FAILED","RETURNED","DISPUTED","CREATED"])await f.seed({status});
 await f.seed({businessId:f.businesses[1].id});await f.seed({billingCycle:"2026-10"});
 const result=await f.dashboardPage("status=PENDING");assert.deepEqual(result.props.summary,{paid:1,pending:1,issues:3});assert.equal(result.props.total,1);
 const previous=await f.dashboardPage("cycle=2026-10");assert.deepEqual(previous.props.summary,{paid:1,pending:0,issues:0});assert.equal(previous.props.billingCycleLabel,"October 2026");assert.equal(previous.props.nextCycleAt,result.props.nextCycleAt);
 const invalid=await f.dashboardPage("cycle=invalid");assert.equal(invalid.props.children[0].props.children,"Payments");
});
function dashboardClient(f){
 f.mocks.react=React;f.mocks["next/link"]={__esModule:true,default:p=>React.createElement("a",p)};
 f.mocks["next/navigation"]={...f.mocks["next/navigation"],useRouter:()=>({refresh(){}})};
 return f.load("app/manager/dashboard/ManagerDashboardClient.tsx").default;
}
test("manager overview renders compact empty state, accurate labels and no redundant pagination",async()=>{
 const f=await reportingFixture(),Client=dashboardClient(f),page=await f.dashboardPage("");const html=renderToStaticMarkup(React.createElement(Client,page.props));
 assert.match(html,/No payments yet/);assert.match(html,/Share payment link/);assert.match(html,/<details class="rfl-home-help"><summary>About these totals/);assert.doesNotMatch(html,/aria-label="Transaction pages"/);
 await f.seed({status:"RETURNED"});const filled=await f.dashboardPage("status=FAILED"),filledHtml=renderToStaticMarkup(React.createElement(Client,filled.props));
 assert.match(filledHtml,/Failed \(Returned\)/);assert.match(filledHtml,/aria-current="page"[^>]*href="[^"]*status=FAILED/);
});
test('month selection rejects malformed, duplicate and unsupported calendar ranges before payment reads',async()=>{
 const f=await reportingFixture();let reads=0;const count=f.db.payment.count;f.db.payment.count=async(...args)=>{reads++;return count(...args);};
 for(const cycle of ['','invalid','2026-00','2026-13','0000-01','9999-01','9998-12',['2026-10','2026-11']]){
  const result=await f.load('app/manager/dashboard/page.tsx').default({searchParams:Promise.resolve({cycle})});assert.equal(result.props.children[1].props.role,'alert');
 }
 assert.equal(reads,0);await f.dashboardPage('cycle=0099-05');const early=await f.dashboardPage('cycle=0099-05');assert.equal(early.props.billingCycleLabel,'May 99');
});
test('summary counts are scoped and use one repeatable-read snapshot without changing payments',async()=>{
 const f=await reportingFixture();await f.seed();await f.seed({businessId:f.businesses[1].id,status:'PENDING'});
 const before=await f.db.payment.findMany({}),transaction=f.db.$transaction,isolations=[];
 f.db.$transaction=async(fn,options)=>{isolations.push(options?.isolationLevel);return transaction(fn,options);};
 const result=await f.dashboardPage('name=NO_MATCH');assert.deepEqual(result.props.summary,{paid:1,pending:0,issues:0});assert.equal(result.props.total,0);assert.equal(isolations[0],'RepeatableRead');assert.deepEqual(await f.db.payment.findMany({}),before);
});
for(const width of [360,1280])test('month navigation, pagination and sharing at '+width,async()=>{
 const f=await reportingFixture();Object.assign(f.business,await f.db.business.update({where:{id:f.business.id},data:{accountCode:'AB-1234',accountCodeLockedAt:new Date('2026-11-01')}}));const sample=await f.seed({billingCycle:'2026-10'}),data={...sample};delete data.id;await f.db.payment.createMany({data:Array.from({length:50},()=>({...data,status:'PAID'}))});
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width,height:900}});await page.addInitScript(()=>{window.__shares=[];Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shares.push(data);}});});
  await serve(f,page);await page.goto('https://example.test/manager/dashboard?cycle=2026-10');await page.addStyleTag({content:await dashboardCss});await expect(page.getByRole('heading',{name:'October 2026',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Next',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(1);assert.equal(new URL(page.url()).searchParams.get('cycle'),'2026-10');
  await page.getByRole('link',{name:'Paid',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('cycle'),'2026-10');await expect(page.locator('tbody tr')).toHaveCount(50);
  await page.getByRole('button',{name:'Share payment link',exact:true}).click();const shares=await page.evaluate(()=>window.__shares);assert.equal(shares.length,1);assert.equal(shares[0].url,'https://example.test/'+f.business.accountCode);
  await page.getByLabel('Choose month',{exact:true}).fill('2026-11');await page.getByRole('button',{name:'View',exact:true}).click();await expect(page.getByRole('heading',{name:'November 2026',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'No payments yet',exact:true})).toBeVisible();
  await page.addStyleTag({content:await dashboardCss});await page.screenshot({path:path.join(screenshotDir,'dashboard-empty-'+width+'.png'),fullPage:true});
  await page.getByLabel('Account menu',{exact:true}).click();await expect(page.getByRole('link',{name:'Settings',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await browser.close();}
});
for(const outcome of ['copied','cancelled','failed'])test('payment link sharing '+outcome+' leaves financial state unchanged',async()=>{
 const f=await reportingFixture();Object.assign(f.business,await f.db.business.update({where:{id:f.business.id},data:{accountCode:'AB-1234',accountCodeLockedAt:new Date('2026-11-01')}}));await f.seed();const before=await f.db.payment.findMany({}),browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.addInitScript(outcome=>{window.__copied=[];Object.defineProperty(navigator,'share',{configurable:true,value:outcome==='copied'?undefined:async()=>{throw new DOMException('Synthetic share result',outcome==='cancelled'?'AbortError':'NotAllowedError');}});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied.push(value);}}});},outcome);
  await serve(f,page);await page.goto('https://example.test/manager/dashboard');await page.getByRole('button',{name:'Share payment link',exact:true}).click();
  const status=page.locator('.rfl-home-share-message');if(outcome==='copied'){await expect(status).toHaveText('Payment link copied.');assert.deepEqual(await page.evaluate(()=>window.__copied),['https://example.test/'+f.business.accountCode]);}else if(outcome==='cancelled'){await expect(status).toBeEmpty();}else await expect(status).toHaveText('Unable to share. Open your payment page to copy its link.');
  assert.deepEqual(await f.db.payment.findMany({}),before);
 }finally{await browser.close();}
});
