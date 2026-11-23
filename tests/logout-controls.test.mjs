import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import LogoutButton from './components/LogoutButton';createRoot(document.getElementById('root')).render(<LogoutButton href={window.target} label="Sign Out"/>);`, loader: "tsx", resolveDir: process.cwd() }, bundle:true, write:false, platform:"browser", jsx:"automatic" });
for (const target of ["/", "/login/admin"]) for (const failure of ["http", "network"]) test(`logout ${target}: ${failure} failure stays accessible and retry navigates only on success`, async () => {
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({serviceWorkers:"block"});const page=await context.newPage();let attempts=0,landed=0;
  await context.route("**/*",async route=>{
   const url=new URL(route.request().url());if(url.origin!=="https://example.test")return route.abort();
   if(url.pathname==="/api/auth/logout") { attempts++; if(attempts===1) return failure==="network"?route.abort():route.fulfill({status:500,body:"Unavailable"});return route.fulfill({status:200,contentType:"application/json",body:'{"success":true}'}); }
   if(url.pathname==="/fixture")return route.fulfill({contentType:"text/html",body:`<html lang="en"><div id="root"></div><script>window.target=${JSON.stringify(target)}</script><script>${bundle.outputFiles[0].text.replaceAll("</script","<\\/script")}</script></html>`});
   landed++;return route.fulfill({contentType:"text/html",body:"<h1>Signed out</h1>"});
  });
  await page.goto("https://example.test/fixture");await page.getByRole("button",{name:"Sign Out"}).click();
  await expect(page.getByRole("alert")).toContainText("Your session may still be active");assert.equal(page.url(),"https://example.test/fixture");assert.equal(landed,0);
  const button=page.getByRole("button",{name:"Sign Out"});await expect(button).toBeEnabled();assert.equal(await button.getAttribute("aria-describedby"),await page.getByRole("alert").getAttribute("id"));
  await button.focus();await page.keyboard.press("Enter");await page.waitForURL("https://example.test"+target);assert.equal(attempts,2);assert.equal(landed,1);
 } finally {await browser.close();}
});
test("manager and admin use the tested control; review copy and legacy redirect stay truthful",()=>{
 for(const file of ["app/manager/dashboard/ManagerDashboardClient.tsx","app/admin/AdminDashboardClient.tsx"]) {const source=readFileSync(file,"utf8");assert.match(source,/<LogoutButton /);assert.doesNotMatch(source,/fetch\("\/api\/auth\/logout"/);}
 const review=readFileSync("app/[accountCode]/review/ReviewPaymentClient.tsx","utf8");assert.doesNotMatch(review,/Optional payment-status texts|SMS receipt sent after payment/);
 assert.match(review.replace(/\s+/g," "),/By continuing, you authorize this one-time payment only\. No recurring or automatic payments will be created\./);
 assert.match(review,/<li>One-time payment only<\/li>/);assert.match(review,/<li>No automatic payments<\/li>/);
 assert.match(review,/href="\/terms"/);assert.match(review,/href="\/privacy"/);
 assert.match(readFileSync("app/checkout/page.tsx","utf8"),/redirect\("\/"\)/);
});
