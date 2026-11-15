import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {build} from 'esbuild';
import {chromium, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
let browser, bundle;
before(async()=>{
 const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './app/setup/account-code/AccountCodeClient.tsx';createRoot(document.getElementById('root')).render(React.createElement(Client,{initialAccountCode:null}));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-mocks',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next/link'?"import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children);}":"export function useRouter(){return {replace:()=>{},refresh:()=>{}};}",loader:'js',resolveDir:process.cwd()}));}}]});
 bundle=result.outputFiles[0].text;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();});
const button=page=>page.getByRole('button',{name:'Permanently Confirm Account Code'});
async function view(){
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  window.requests=[];window.confirmations=0;
  window.fetch=(url,options={})=>{
   if(String(url).includes('/availability?'))return new Promise((resolve,reject)=>{
    const entry={code:new URL(url,location.origin).searchParams.get('code'),signal:options.signal,reject,jsonStarted:false};
    entry.headers=status=>resolve({ok:status>=200&&status<300,status,json:()=>{entry.jsonStarted=true;return new Promise((yes,no)=>{entry.body=yes;entry.invalid=no;});}});
    window.requests.push(entry);
   });
   if(options.method==='POST'){window.confirmations++;return Promise.reject(new Error('Unexpected confirmation'));}
   return Promise.resolve({ok:true,json:async()=>({accountCode:'KK-4270'})});
  };
 });
 await page.route('**/*',route=>route.request().isNavigationRequest()&&route.request().url()==='https://example.test/setup/account-code'?route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}):route.abort());
 await page.goto('https://example.test/setup/account-code');
 await expect(page.locator('#accountCode')).toHaveValue('KK-4270');return page;
}
async function request(page,index=0){await expect.poll(()=>page.evaluate(()=>window.requests.length)).toBe(index+1);}
async function headers(page,index,status=200){await page.evaluate(({index,status})=>window.requests[index].headers(status),{index,status});}
async function body(page,index,value){await expect.poll(()=>page.evaluate(index=>window.requests[index].jsonStarted,index)).toBe(true);await page.evaluate(({index,value})=>window.requests[index].body(value),{index,value});}
async function settle(page,value,index=0){await headers(page,index);await body(page,index,value);}
async function unknown(page){await expect(page.getByRole('alert')).toHaveText('Unable to verify this account code. Please try again.');await expect(button(page)).toBeDisabled();await expect(page.locator('.rfl-account-code-availability')).toHaveText('Availability not verified.');assert.equal(await page.evaluate(()=>window.confirmations),0);}
for(const available of [true,false])test(`successful valid available:${available}`,async()=>{
 const page=await view();try{await expect(button(page)).toBeDisabled();await request(page);await settle(page,{available,valid:true});if(available){await expect(button(page)).toBeEnabled();await expect(page.locator('.rfl-account-code-availability')).toContainText('This code is available.');}else{await expect(button(page)).toBeDisabled();await expect(page.locator('.rfl-account-code-availability')).toHaveText('That account code is already taken. Please choose another.');}}finally{await page.close();}
});
for(const status of [429,503])test(`HTTP ${status} is unknown, never taken`,async()=>{const page=await view();try{await request(page);await headers(page,0,status);await unknown(page);}finally{await page.close();}});
for(const [name,value] of Object.entries({null:null,array:[],empty:{},missingValid:{available:false},invalidCode:{available:false,valid:false},missingAvailable:{valid:true},string:{valid:true,available:'false'},number:{valid:true,available:0}}))test(`malformed ${name} is unknown`,async()=>{const page=await view();try{await request(page);await settle(page,value);await unknown(page);}finally{await page.close();}});
for(const kind of ['invalid JSON','network failure'])test(`${kind} is unknown`,async()=>{const page=await view();try{await request(page);if(kind==='invalid JSON'){await headers(page,0);await expect.poll(()=>page.evaluate(()=>window.requests[0].jsonStarted)).toBe(true);await page.evaluate(()=>window.requests[0].invalid(new Error('Sensitive response omitted')));}else await page.evaluate(()=>window.requests[0].reject(new Error('Sensitive network detail omitted')));await unknown(page);}finally{await page.close();}});
for(const stale of [true,false,'error'])test(`stale JSON ${stale} cannot override newer result`,async()=>{const page=await view();try{await request(page);await headers(page,0);await expect.poll(()=>page.evaluate(()=>window.requests[0].jsonStarted)).toBe(true);await page.locator('#accountCode').fill('AB-1234');await request(page,1);await settle(page,{available:true,valid:true},1);await expect(button(page)).toBeEnabled();await page.evaluate(stale=>stale==='error'?window.requests[0].invalid(new Error('old failure')):window.requests[0].body({available:stale,valid:true}),stale);await page.evaluate(()=>new Promise(requestAnimationFrame));await expect(button(page)).toBeEnabled();await expect(page.getByRole('alert')).toHaveCount(0);assert.equal(await page.evaluate(()=>window.requests[0].signal.aborted),true);}finally{await page.close();}});
test('stale headers and failure cannot clear the newer pending check',async()=>{const page=await view();try{await request(page);await page.locator('#accountCode').fill('AB-1234');await request(page,1);await headers(page,0,503);await page.evaluate(()=>new Promise(requestAnimationFrame));await expect(page.locator('.rfl-account-code-availability')).toHaveText('Checking availability...');await expect(button(page)).toBeDisabled();await expect(page.getByRole('alert')).toHaveCount(0);await settle(page,{available:false,valid:true},1);await expect(page.locator('.rfl-account-code-availability')).toContainText('already taken');assert.equal(await page.evaluate(()=>window.requests[0].jsonStarted),false);}finally{await page.close();}});
test('editing clears accepted state immediately, including during debounce',async()=>{const page=await view();try{await request(page);await settle(page,{available:true,valid:true});await expect(button(page)).toBeEnabled();await page.locator('#accountCode').fill('AB-1234');await expect(button(page)).toBeDisabled();await request(page,1);await settle(page,{available:false,valid:true},1);await expect(button(page)).toBeDisabled();}finally{await page.close();}});
test('same normalized input preserves its verified state',async()=>{const page=await view();try{await request(page);await settle(page,{available:true,valid:true});await expect(button(page)).toBeEnabled();await page.locator('#accountCode').fill('kk-4270');await expect(button(page)).toBeEnabled();assert.equal(await page.evaluate(()=>window.requests.length),1);}finally{await page.close();}});
test('database uniqueness, assignment, proxy wiring and rate guards remain byte-identical',()=>{
 for(const path of ['prisma/schema.prisma','app/api/setup/account-code/route.ts','app/api/setup/account-code/availability/route.ts','lib/accountCode.ts','proxy.ts','lib/publicRequestBudget.ts'])assert.equal(readFileSync(path,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'}).replaceAll('\r\n','\n'),path);
});

test('stale available result cannot enable a newer taken code',async()=>{const page=await view();try{await request(page);await headers(page,0);await expect.poll(()=>page.evaluate(()=>window.requests[0].jsonStarted)).toBe(true);await page.locator('#accountCode').fill('AB-1234');await request(page,1);await settle(page,{available:false,valid:true},1);await page.evaluate(()=>window.requests[0].body({available:true,valid:true}));await page.evaluate(()=>new Promise(requestAnimationFrame));await expect(button(page)).toBeDisabled();await expect(page.locator('.rfl-account-code-availability')).toContainText('already taken');}finally{await page.close();}});
test('a new successful check clears the prior verification error',async()=>{const page=await view();try{await request(page);await headers(page,0,503);await unknown(page);await page.locator('#accountCode').fill('AB-1234');await request(page,1);await settle(page,{available:true,valid:true},1);await expect(button(page)).toBeEnabled();await expect(page.getByRole('alert')).toHaveCount(0);}finally{await page.close();}});
