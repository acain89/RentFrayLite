import test from "node:test";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { authHarness } from "./helpers/auth-harness.mjs";

async function fixture(patch={}) {
 const calls=[];
 const state={mode:"live",platform:"acct_platform",account:"acct_owned",dashboard:"express",url:"https://connect.stripe.com/express/acct_owned/example",...patch};
 const stripe={accounts:{retrieve:async (id,...args)=>{
   const options=typeof id==="string"?args[1]:id;assert.equal(options.timeout,5000);assert.equal(options.maxNetworkRetries,0);
   if(state.failure===(typeof id==="string"?"account":"platform"))throw new Error("synthetic private provider error");
   calls.push(["retrieve",typeof id==="string"?id:"platform"]);
   if(typeof id!=="string")return {id:state.platform};
   return {id:state.account,deleted:state.deleted,type:"express",controller:{stripe_dashboard:{type:state.dashboard}}};
 },createLoginLink:async (id,params,opts)=>{assert.deepEqual(params,{});assert.equal(opts.timeout,5000);assert.equal(opts.maxNetworkRetries,0);calls.push(["login",id]);if(state.failure==="login")throw new Error("synthetic private provider error");await state.onLogin?.();return {url:state.url};}},balance:{retrieve:async()=>{if(state.failure==="balance")throw new Error("synthetic private provider error");return {livemode:state.mode==="live"};}}};
 const h=await authHarness("isolated",undefined,{"@/lib/stripe":{getStripeClient:()=>stripe}}, {NODE_ENV:"production",STRIPE_SECRET_KEY:state.key??"sk_live_fixture_no_network"});
 h.db.$queryRaw=async()=>[{now:new Date()}];
 h.db.stripeConnection={findUnique:async({where})=>{assert.equal(where.businessId,h.businesses[0].id);return state.missing?null:{stripeAccountId:"acct_owned"};}};
 h.db.stripeAccountProvisioning={findUnique:async({where})=>{assert.equal(where.businessId,h.businesses[0].id);return state.noJournal?null:({stripeAccountId:state.journalAccount??"acct_owned",stripePlatformAccountId:"acct_platform",stripeMode:state.journalMode??"live"});}};
 await h.issue();
 const request=(body="{}",origin="https://example.test")=>new Request("https://example.test/api/manager/banking",{method:"POST",headers:{"content-type":"application/json",...(origin?{origin}:{})},body});
 const post=(...args)=>h.load("app/api/manager/banking/route.ts").POST(request(...args));
 return {...h,state,calls,post};
}

test("banking link is bound to the signed-in business and not cached",async()=>{
 const h=await fixture(),r=await h.post();assert.equal(r.status,200);
 assert.equal((await r.json()).url,h.state.url);assert.ok(r.headers.get("cache-control").includes("no-store"));
 assert.equal(r.headers.get("referrer-policy"),"no-referrer");assert.deepEqual(h.calls.at(-1),["login","acct_owned"]);
});
test("full dashboards use Stripe sign-in without creating an Express login link",async()=>{
 const h=await fixture({dashboard:"full"}),r=await h.post();assert.equal(r.status,200);assert.equal((await r.json()).url,"https://dashboard.stripe.com/");assert.ok(!h.calls.some(c=>c[0]==="login"));
});
for(const [label,patch] of [["missing connection",{missing:true}],["journal ownership mismatch",{journalAccount:"acct_other"}],["platform mismatch",{platform:"acct_other"}],["mode mismatch",{mode:"test"}],["connected identity mismatch",{account:"acct_other"}],["unsupported dashboard",{dashboard:"none"}]])test("banking fails closed: "+label,async()=>{
 const h=await fixture(patch),r=await h.post();assert.equal(r.status,503);assert.ok(!h.calls.some(c=>c[0]==="login"));assert.doesNotMatch(await r.text(),/acct_|sk_live/);
});
for(const url of ["http://connect.stripe.com/x","https://evil.example/x","https://connect.stripe.com.evil.example/x","https://user@connect.stripe.com/x"])test("banking rejects unsafe provider URL "+url,async()=>{
 const h=await fixture({url});assert.equal((await h.post()).status,503);
});
test("banking refuses caller account IDs, malformed JSON and cross-origin requests before provider access",async()=>{
 const h=await fixture();assert.equal((await h.post('{"account":"acct_other"}')).status,400);assert.equal((await h.post('invalid')).status,400);
 assert.equal((await h.post('{}','https://evil.example')).status,403);assert.equal((await h.post('{}',null)).status,403);assert.equal(h.calls.length,0);
});
test("banking denies ADMIN and revoked sessions before provider access",async()=>{
 const h=await fixture();await h.issue("ADMIN");assert.equal((await h.post()).status,401);await h.issue();await h.db.session.deleteMany({where:{managerId:h.managers[0].id}});assert.equal((await h.post()).status,401);assert.equal(h.calls.length,0);
});
test("banking revalidates a stale manager snapshot inside the existing mutation guard",async()=>{
 const h=await fixture(),stale=await h.session.getCurrentSession();
 h.mocks["@/lib/session"]={...h.session,getCurrentSession:async()=>stale};
 await h.db.session.deleteMany({where:{managerId:h.managers[0].id}});
 assert.equal((await h.post()).status,401);assert.equal(h.calls.length,0);
});
test("welcome walkthrough is public, labels fictional examples and explains processing fees and secure banking",async()=>{
 const h=await fixture();h.mocks["next/link"]={__esModule:true,default:p=>React.createElement("a",p)};
 const Page=h.load("app/new-here/page.tsx").default,html=renderToStaticMarkup(React.createElement(Page));
 for(const text of ["Welcome to","Demo \u00b7 fictional data","Payment tiers","Manager dashboard","Customer view","Customers pay a processing fee","Stripe collects","Consent is optional","does not enroll anyone in autopay"]) assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/AC-1989|ANDREW|936|<input|<button/);assert.equal(h.calls.length,0);
});

for(const [label,patch]of [["missing journal",{noJournal:true}],["deleted account",{deleted:true}],["unrecognized key",{key:"invalid_fixture"}],["production test key",{key:"rk_test_fixture"}],["journal mode mismatch",{journalMode:"test"}]])test("additional banking fail-closed control: "+label,async()=>{
 const h=await fixture(patch),r=await h.post();assert.equal(r.status,503);assert.ok(!h.calls.some(c=>c[0]==="login"));assert.doesNotMatch(await r.text(),/acct_|fixture|private/);
});
for(const failure of ["platform","balance","account","login"])test("provider failure is sanitized and retryable: "+failure,async()=>{
 const h=await fixture({failure}),r=await h.post();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/synthetic|private|acct_|sk_live/);h.state.failure=null;assert.equal((await h.post()).status,200);
});
for(const [label,change]of [["inactive manager",async h=>h.db.manager.update({where:{id:h.managers[0].id},data:{isActive:false}})],["inactive business",async h=>h.db.business.update({where:{id:h.businesses[0].id},data:{isActive:false}})],["expired session",async h=>h.db.session.updateMany({where:{managerId:h.managers[0].id},data:{expiresAt:new Date(0)}})]])test("banking rejects "+label,async()=>{
 const h=await fixture();await change(h);assert.equal((await h.post()).status,401);assert.equal(h.calls.length,0);
});
test("banking rechecks expiry after provider call before returning a login URL",async()=>{
 const h=await fixture(),original=h.db.$queryRaw;let expired=false;h.db.$queryRaw=async q=>expired?[{now:new Date("2100-01-01")}]:original(q);h.state.onLogin=()=>{expired=true;};const r=await h.post();assert.equal(r.status,401);assert.ok(!JSON.stringify(await r.json()).includes("https://connect"));
});
test("banking does not allow unbounded JSON, arrays or non-JSON bodies",async()=>{
 const h=await fixture();assert.equal((await h.post('{"x":"'+"x".repeat(300)+'"}')).status,413);for(const body of ["[]","null","",'"x"'])assert.equal((await h.post(body)).status,400);const r=await h.load("app/api/manager/banking/route.ts").POST(new Request("https://example.test/api/manager/banking",{method:"POST",headers:{origin:"https://example.test"},body:"{}"}));assert.equal(r.status,415);assert.equal(h.calls.length,0);
});
test("banking page requires manager authority and completed setup",async()=>{
 const h=await fixture();h.mocks["./BankingClient"]={__esModule:true,default:()=>null};const Page=h.load("app/manager/settings/banking/page.tsx").default;const result=await Page();assert.equal(result.props.businessName,h.businesses[0].name);await h.db.business.update({where:{id:h.businesses[0].id},data:{setupCompletedAt:null,setupStep:"CONNECT_STRIPE"}});await assert.rejects(Page,/REDIRECT \/setup\/continue/);await h.issue("ADMIN");await assert.rejects(Page,/REDIRECT/);assert.equal(h.calls.length,0);
});

const screenDir=process.env.RFL_BANKING_SCREENSHOTS??path.join(os.tmpdir(),"rfl-banking-welcome-ui");
mkdirSync(screenDir,{recursive:true});
let cssPromise;
function styles(){return cssPromise??=postcss([tailwind()]).process(readFileSync("app/globals.css","utf8"),{from:path.resolve("app/globals.css")}).then(r=>r.css+"\n:root{--font-geist-sans:Arial;}");}
const bundles=new Map();
function clientBundle(file){if(!bundles.has(file))bundles.set(file,build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './"+file+"';createRoot(document.getElementById('root')).render(React.createElement(Client,window.props));",resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"isolated-next",setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:a.path==="next/link"?"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children);}":"export const useRouter=()=>({push:u=>window.location.assign(u)});",loader:"js",resolveDir:process.cwd()}));}}]}).then(r=>r.outputFiles[0].text));return bundles.get(file);}
function document(body,css,script=""){return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style>'+body+(script?'<script>'+script.replaceAll("</script","<\/script")+'</script>':'')+'</html>';}
for(const width of [320,390,768,1280])test("welcome walkthrough mobile/desktop layout at "+width,async()=>{
 const h=await fixture();h.mocks["next/link"]={__esModule:true,default:p=>React.createElement("a",p)};const Page=h.load("app/new-here/page.tsx").default;const html=renderToStaticMarkup(React.createElement(Page));const css=await styles(),browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width,height:900}}),requests=[];await page.route("**/*",async r=>{requests.push(r.request().url());return r.fulfill({contentType:"text/html; charset=utf-8",body:document(html,css)});});await page.goto("https://example.test/new-here");await expect(page.getByRole("heading",{level:1})).toHaveCount(1);await expect(page.locator("figure")).toHaveCount(3);await expect(page.locator("figcaption")).toHaveCount(3);await expect(page.locator("figcaption").first()).toContainText("fictional data");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"No horizontal overflow");for(const a of await page.locator("a").all()){const href=await a.getAttribute("href");assert.ok(["/","/setup","/login/manager","#how-it-works"].includes(href));}if(width>=900){const row=page.locator(".rfl-demo-payments li").first();const status=await row.locator(".rfl-demo-status").boundingBox(),name=await row.locator("div").boundingBox(),amount=await row.locator(":scope > strong").boundingBox();assert.ok(status.x<name.x&&name.x<amount.x,"Desktop demo status/name/amount match their labels");}await page.getByRole("link",{name:/Take a quick look/}).click();assert.ok(page.url().endsWith("#how-it-works"));assert.equal(requests.length,1);await page.screenshot({path:path.join(screenDir,"welcome-"+width+".png"),fullPage:true});assert.equal(h.calls.length,0);}
 finally{await browser.close();}
});
async function bankingBrowser(width=390){
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width,height:900}}),calls=[],outbound=[],state={status:503,data:{error:"Banking access is temporarily unavailable."},hold:null};
 const css=await styles(),code=await clientBundle("app/manager/settings/banking/BankingClient.tsx"),props={businessName:"LongBusinessName".repeat(8),accountCode:"AB-1234"};
 await page.route("**/*",async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!=="https://example.test"){outbound.push(req.url());return route.fulfill({contentType:"text/html",body:"<h1>Mock Stripe dashboard</h1>"});}if(u.pathname==="/api/manager/banking"){calls.push({method:req.method(),body:req.postData(),type:req.headers()["content-type"]});if(state.hold)await state.hold;return route.fulfill({status:state.status,contentType:"application/json",body:state.raw??JSON.stringify(state.data)});}return route.fulfill({contentType:"text/html; charset=utf-8",body:document('<div id="root"></div>',css,'window.props='+JSON.stringify(props)+';'+code)});});
 await page.goto("https://example.test/manager/settings/banking");await expect(page.getByRole("heading",{name:"Banking & payouts"})).toBeVisible();return {browser,page,calls,outbound,state};
}
for(const width of [320,1280])test("banking loading, retry and layout at "+width,async()=>{
 const f=await bankingBrowser(width);try{const {page,state}=f;assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);let release;state.hold=new Promise(r=>release=r);await page.getByRole("button",{name:/Manage banking in Stripe/}).click();await expect(page.getByRole("button",{name:/Opening Stripe/})).toBeDisabled();await expect.poll(()=>f.calls.length).toBe(1);await page.screenshot({path:path.join(screenDir,"banking-loading-"+width+".png"),fullPage:true});release();state.hold=null;await expect(page.getByRole("alert")).toContainText("temporarily unavailable");await expect(page.getByRole("button",{name:/Manage banking in Stripe/})).toBeEnabled();await page.getByRole("button",{name:/Manage banking in Stripe/}).click();await expect.poll(()=>f.calls.length).toBe(2);assert.deepEqual(f.calls[0],{method:"POST",body:"{}",type:"application/json"});assert.deepEqual(f.outbound,[]);await expect(page.getByRole("link",{name:"Get help"})).toHaveAttribute("href","/support");await page.screenshot({path:path.join(screenDir,"banking-error-"+width+".png"),fullPage:true});}
 finally{await f.browser.close();}
});
for(const [label,status,data,raw]of [["expired authorization",401,{error:"Please sign in again."}],["malformed response",200,null,"not JSON"],["unsafe redirect",200,{url:"https://evil.example/"}],["missing URL",200,{}]])test("banking browser rejects "+label,async()=>{
 const f=await bankingBrowser();try{Object.assign(f.state,{status,data,raw});await f.page.getByRole("button",{name:/Manage banking in Stripe/}).click();await expect(f.page.getByRole("alert")).toBeVisible();await expect(f.page.getByRole("button",{name:/Manage banking in Stripe/})).toBeEnabled();assert.deepEqual(f.outbound,[]);assert.ok(f.page.url().endsWith("/manager/settings/banking"));}finally{await f.browser.close();}
});
for(const url of ["https://connect.stripe.com/express/acct_synthetic/login","https://dashboard.stripe.com/"])test("banking browser follows approved mocked destination "+url,async()=>{
 const f=await bankingBrowser();try{Object.assign(f.state,{status:200,data:{url}});await f.page.getByRole("button",{name:/Manage banking in Stripe/}).click();await expect(f.page.getByRole("heading",{name:"Mock Stripe dashboard"})).toBeVisible();assert.deepEqual(f.outbound,[url]);}finally{await f.browser.close();}
});
test("home page links to welcome without altering account-code form",async()=>{
 const code=await clientBundle("app/page.tsx"),css=await styles(),browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.route("**/*",r=>r.fulfill({contentType:"text/html",body:document('<div id="root"></div>',css,'window.props={};'+code)}));await page.goto("https://example.test/");await expect(page.getByRole("link",{name:/New here/})).toHaveAttribute("href","/new-here");await expect(page.getByRole("button",{name:"Continue",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Manager Login",exact:true})).toBeVisible();}finally{await browser.close();}
});
