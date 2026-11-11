import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { customFixture, customBrowserMutationRequest } from "./helpers/custom-payment-harness.mjs";
import { postgres } from "./helpers/checkout-harness.mjs";
const bundles=new Map();
function bundle(file){
 if(!bundles.has(file))bundles.set(file,build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './"+file+"';createRoot(document.getElementById('root')).render(React.createElement(Client,window.props));",resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",jsx:"automatic",plugins:[{name:"isolated-next",setup(b){
  b.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:"fixture"}));
  b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="next/link"?"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children);}":"export const useRouter=()=>({push:url=>window.location.assign(url)});export const useSearchParams=()=>new URLSearchParams();",loader:"js",resolveDir:process.cwd()}));
 }}]}).then(r=>r.outputFiles[0].text));return bundles.get(file);
}
async function html(file,props){const code=(await bundle(file)).replaceAll("</script","<\\/script");return '<div id="root"></div><script>window.props='+JSON.stringify(props).replaceAll("<","\\u003c")+';</script><script>'+code+'</script>';}
async function publicProps(h){
 h.mocks["next/link"]={__esModule:true,default:()=>null};h.mocks["./RecurringCheckoutClient"]={__esModule:true,default:()=>null};
 const page=await h.load("app/[accountCode]/page.tsx").default({params:Promise.resolve({accountCode:h.business.accountCode})});
 return page.props.children.find(child=>Array.isArray(child?.props?.plans)).props;
}
for(const backend of postgres?["isolated","postgres"]:["isolated"])for(const method of ["ACH","CARD"]){
 test(backend+" "+method+": property code ? Custom ? summary/method ? Stripe ? private confirmation",async()=>{
  const h=await customFixture(method,backend),origin=h.load("lib/credentialRequest.ts").configuredCredentialOrigin(),browser=await chromium.launch({headless:true});
  try{
   const page=await browser.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000);page.on("pageerror",error=>console.error("Isolated browser error:",error.message));await page.route("**/*",async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==="checkout.stripe.com")return route.fulfill({contentType:"text/html",body:"<h1>Mock Stripe Checkout</h1>"});
    if(url.origin!==origin)return route.abort();
    if(url.pathname.startsWith("/api/")){const file=url.pathname.endsWith("/session")?"app/api/public/checkout/session/route.ts":"app/api/public/checkout/start/route.ts";const forwarded=await customBrowserMutationRequest(request);assert.equal(forwarded.headers.get("origin"),origin);const response=await h.load(file).POST(forwarded);return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});}
    if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:await html("app/page.tsx",{})});
    if(url.pathname==="/payment/success"){const node=await h.load("app/payment/success/page.tsx").default({searchParams:Promise.resolve(Object.fromEntries(url.searchParams))});return route.fulfill({contentType:"text/html",body:renderToStaticMarkup(node)});}
    if(url.pathname.endsWith("/review")){const checkout=await h.db.checkoutSession.findUnique({where:{id:url.searchParams.get("session")}});return route.fulfill({contentType:"text/html",body:await html("app/[accountCode]/review/ReviewPaymentClient.tsx",(await h.review(checkout)).props)});}
    return route.fulfill({contentType:"text/html",body:await html("app/[accountCode]/RecurringCheckoutClient.tsx",await publicProps(h))});
   });
   await page.goto(origin+"/");await page.getByLabel("Enter Account Code").fill(h.business.accountCode);await page.getByRole("button",{name:/continue/i}).click();await page.waitForURL("**/"+h.business.accountCode);
   await page.getByRole("button",{name:/Custom Payment/}).click();await page.getByLabel("Custom Payment amount ($)").fill("123.45");
   await page.getByLabel("First name",{exact:true}).fill("Custom");await page.getByLabel("Last name",{exact:true}).fill("Payer");await page.getByLabel("Unit / space number").fill("101");await page.getByLabel("Mobile phone").fill("5555551234");
   const quoteResponse=page.waitForResponse(r=>r.url()===origin+"/api/public/checkout/session");await page.getByRole("button",{name:"Review Payment",exact:true}).click();assert.equal((await quoteResponse).status(),201);await page.waitForURL("**/review?session=*");await expect(page.getByRole("heading",{name:"Review Payment"})).toBeVisible();
   assert.equal(await page.getByText("Billing Cycle",{exact:true}).count(),0);assert.equal(await page.getByText("Due Date",{exact:true}).count(),0);
   const originalUrl=page.url();if(method==="CARD"){const methodResponse=page.waitForResponse(r=>r.url()===origin+"/api/public/checkout/session");await page.getByRole("radio",{name:"Credit or debit card",exact:true}).click();assert.equal((await methodResponse).status(),201);await page.waitForURL(url=>url.href!==originalUrl);await expect(page.getByRole("radio",{name:"Credit or debit card",exact:true})).toBeChecked();}
   const latestId=new URL(page.url()).searchParams.get("session"),latest=await h.db.checkoutSession.findUnique({where:{id:latestId}});
   assert.equal(latest.paymentMethod,method);assert.equal(latest.subtotalCents,12345);assert.equal(latest.platformFeeCents,method==="ACH"?395:700);await expect(page.getByText("Processing fee",{exact:true})).toBeVisible();
   const startResponse=page.waitForResponse(r=>r.url()===origin+"/api/public/checkout/start");await page.getByRole("button",{name:"Continue to Secure Payment"}).click();assert.equal((await startResponse).status(),200);await page.waitForURL("https://checkout.stripe.com/**");assert.equal(h.calls.creates.length,1);assert.equal((await h.payments()).length,1);
   const a=await h.current(latest),intent=h.intentFor(a);h.settle(a,intent);await h.webhook(a,intent);await page.goto(origin+"/payment/success?accountCode="+h.business.accountCode+"&session_id="+a.session.id);
   await expect(page.getByRole("heading",{name:"Payment successful"})).toBeVisible();await expect(page.getByText("Custom Payment",{exact:true})).toBeVisible();
   const paid=await h.db.payment.findUnique({where:{id:a.payment.id}});assert.equal(paid.status,"PAID");assert.equal(paid.totalChargedCents,latest.totalCents);assert.equal(paid.subtotalCents,latest.subtotalCents);assert.equal(paid.platformFeeCents,latest.platformFeeCents);assert.deepEqual(paid.lineItemsSnapshot,latest.lineItems);
   console.log("RFL_CUSTOM_BROWSER_FLOW_PROOF "+JSON.stringify({backend,method,quoteStatus:201,startStatus:200,subtotalCents:paid.subtotalCents,feeCents:paid.platformFeeCents,totalCents:paid.totalChargedCents,providerCreates:h.calls.creates.length,privateConfirmation:true}));
  }finally{await browser.close();}
 });
}
for(const backend of postgres?["isolated","postgres"]:["isolated"]){
 test(backend+": Custom history label, search, CSV formula safety and print remain available",async()=>{
  const h=await customFixture("ACH",backend),{checkout}=await h.prepareCustom("123.45",{firstName:"=SUM(1,1)"});assert.equal((await h.start(checkout)).status,200);const a=await h.current(checkout),intent=h.intentFor(a);h.settle(a,intent);await h.webhook(a,intent);
  h.mocks["@/lib/auth"]={requireManager:async()=>({manager:{displayName:"Manager",email:"manager@example.test"},business:h.business})};h.mocks["./ManagerHistoryClient"]={__esModule:true,default:()=>null};h.mocks["next/navigation"].redirect=url=>{throw Error("Unexpected redirect "+url);};
  const props=(await h.load("app/manager/history/page.tsx").default()).props,browser=await chromium.launch({headless:true});
  try{
   const page=await browser.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000);await page.route("**/*",route=>new URL(route.request().url()).hostname==="example.test"?route.fulfill({contentType:"text/html",body:'<div id="root"></div>'}):route.abort());await page.goto("https://example.test/history");
   await page.evaluate(p=>{window.props=p;window.__printCount=0;window.print=()=>window.__printCount++;URL.createObjectURL=blob=>{window.__csvPromise=blob.text();return "blob:isolated-export";};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};},props);
   await page.addScriptTag({content:await bundle("app/manager/history/ManagerHistoryClient.tsx")});await expect(page.getByRole("columnheader",{name:"Type",exact:true})).toBeVisible();await expect(page.locator("tbody").getByText("Custom",{exact:true})).toBeVisible();
   await expect(page.getByLabel("Tenant name")).toBeVisible();await expect(page.getByRole("link",{name:"Export CSV"})).toHaveAttribute("href",/api\/manager\/transactions\/export/);
   const csvResponse=await h.load("app/api/manager/transactions/export/route.ts").GET(new Request("https://example.test/api/manager/transactions/export?type=CUSTOM"));const csv=await csvResponse.text();assert.equal(csvResponse.status,200);assert.match(csv,/"Custom"/);assert.match(csv,/'=SUM\(1,1\)/);
   const printResponse=await h.load("app/api/manager/transactions/export/route.ts").GET(new Request("https://example.test/api/manager/transactions/export?type=CUSTOM&format=print"));assert.equal(printResponse.status,200);const printable=await printResponse.text();assert.match(printable,/Use your browser Print/);assert.match(printable,/Custom/);await expect(page.getByRole("link",{name:"Print",exact:true})).toHaveAttribute("href",/format=print/);

  }finally{await browser.close();}
 });
}
