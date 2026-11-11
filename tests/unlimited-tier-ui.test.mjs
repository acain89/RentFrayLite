import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { tierFixture, postgres } from './helpers/tier-configuration-harness.mjs';

let bundle;
async function code(){return bundle??=build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './components/setup/PaginatedRecurringConfiguration.tsx';createRoot(document.getElementById('root')).render(React.createElement(Client,window.props));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'isolated-navigation',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$|^@\/components\/setup\/SetupProgress$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children);}":args.path==='next/navigation'?"export const useRouter=()=>({push:url=>window.location.assign(url)});export const useSearchParams=()=>new URLSearchParams(window.location.search);":"export default function Progress(){return null;}",loader:'js',resolveDir:process.cwd()}));
 }}]}).then(r=>r.outputFiles[0].text);}

for(const backend of postgres?['isolated','postgres']:['isolated'])test(`${backend}: 1000-tier paginated UI edits, rejects stale saves, adds, removes and configures shared rules`,async()=>{
 const f=await tierFixture(backend,1000),browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(15000);page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!=='https://example.test')return route.abort();
   if(url.pathname.startsWith('/api/')){const response=await f.load('app'+url.pathname+'/route.ts')[request.method()](new Request(url.href,{method:request.method(),headers:request.headers(),...(request.method()==='PATCH'?{body:request.postData()}: {})}));return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
   const step=url.pathname.split('/').at(-1);return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.props='+JSON.stringify({step,highestReachedStep:7})+';</script><script>'+(await code()).replaceAll('</script','<\\/script')+'</script>'});
  });
  await page.goto('https://example.test/setup/recurring/tiers?mode=settings');await expect(page.getByText(/1000 active rent tiers/)).toBeVisible();
  assert.equal(await page.getByRole('button',{name:/^Tier \d+ —/}).count(),50);
  await page.getByRole('button',{name:'Next tiers'}).click();await expect(page.getByRole('button',{name:/^Tier 0051 —/})).toBeVisible();
  const selected=(await f.page((await f.page()).nextCursor)).tiers[0];
  await f.db.recurringPlan.update({where:{id:selected.id},data:{baseAmountCents:20000}});
  await page.getByLabel('Tier name',{exact:true}).fill('Stale name');await page.getByRole('button',{name:'Save tier',exact:true}).click();await expect(page.getByRole('status')).toContainText('changed');assert.equal((await f.row(selected.id)).baseAmountCents,20000);
  await page.getByRole('button',{name:'Reload latest configuration'}).click();await expect(page.getByLabel('Monthly amount',{exact:true})).toHaveValue('200.00');
  await page.getByLabel('Tier name',{exact:true}).fill('Updated via UI');await page.getByLabel('Monthly amount',{exact:true}).fill('201.23');await page.getByRole('button',{name:'Save tier',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved.');assert.equal((await f.row(selected.id)).baseAmountCents,20123);
  await page.getByRole('button',{name:'Add tier',exact:true}).click();await page.getByLabel('Tier name',{exact:true}).fill('New UI tier');await page.getByLabel('Monthly amount',{exact:true}).fill('123.45');await page.getByRole('button',{name:'Save tier',exact:true}).click();await expect(page.getByText(/1001 active rent tiers/)).toBeVisible();
  await page.getByRole('button',{name:'Remove tier',exact:true}).click();await expect(page.getByText(/1000 active rent tiers/)).toBeVisible();assert.equal((await f.row(selected.id)).isActive,false);
  await page.goto('https://example.test/setup/recurring/billing?mode=settings');await expect(page.getByText(/1000 active rent tiers/)).toBeVisible();
  await page.getByLabel('Grace period',{exact:true}).selectOption('4');await page.getByLabel('Initial late fee',{exact:true}).fill('1.25');await page.getByLabel('Same rules for all tiers',{exact:true}).check();await page.getByRole('button',{name:'Save billing rules',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved.');await expect(page.getByLabel('Same rules for all tiers',{exact:true})).toBeChecked();assert.equal(await f.db.recurringPlan.count({where:{businessId:f.businessId,isActive:true,gracePeriodDays:4}}),1000);
  await page.goto('https://example.test/setup/recurring/charges?mode=settings');await expect(page.getByText(/1000 active rent tiers/)).toBeVisible();await page.getByLabel('Charge name',{exact:true}).fill('Shared UI water');await page.getByLabel('Charge amount',{exact:true}).fill('2.00');await page.getByLabel('Apply to all tiers',{exact:true}).check();await page.getByRole('button',{name:'Save charge',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved.');assert.equal(await f.db.recurringCharge.count({where:{recurringPlan:{businessId:f.businessId,isActive:true},isActive:true}}),1000);
 }finally{await browser.close();}
});
