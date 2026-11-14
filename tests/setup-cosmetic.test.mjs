import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const benefits=['Stripe securely collects your banking information.','RentFrayLite never sees or stores your bank login credentials.','Customer payments are processed securely through Stripe.','Receive payouts directly to your connected bank account.'];
const tip="If you're a sole proprietor, selecting Individual / Sole Proprietorship during Stripe setup is usually the simplest option.";
let browser,bundle,css;
before(async()=>{
 const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Bank from './app/setup/stripe/BankSetupClient.tsx';createRoot(document.getElementById('root')).render(React.createElement(Bank,window.__props));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'local-next',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/link'?"import React from 'react';export default function Link({href,children,...p}){return React.createElement('a',{href,...p},children);}":"export function useRouter(){return {push:url=>window.__redirect=url,refresh:()=>{window.__refresh=true;}};}",loader:'js',resolveDir:process.cwd()}));}}]});bundle=result.outputFiles[0].text;
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'})).css+'\n:root{--font-geist-sans:Arial;}';browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();});
function props(extra={}){return {initialStatus:{exists:false,requirementsSummary:null},readiness:null,highestReachedStep:6,returnedFromStripe:false,initialError:null,...extra};}
async function view(width,extra={}){
 const page=await browser.newPage({viewport:{width,height:950}}),requests=[],external=[];let respond;
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!=='https://example.test'){external.push(u.origin);return route.abort();}
  if(u.pathname==='/api/stripe/connect'){requests.push({method:req.method(),body:req.postData()});respond=async result=>result==='network'?route.abort('failed'):route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});return;}
  return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><div id="root"></div><script>window.__props='+JSON.stringify(props(extra))+';</script><script>'+bundle.replaceAll('</script','<\/script')+'</script>'});
 });
 await page.goto('https://example.test/setup/stripe');return {page,requests,external,respond:result=>respond(result)};
}
test('cosmetic patch preserves request handlers, navigation, API/recovery code and tier editor logic',()=>{
 const base=n=>execFileSync('git',['show','HEAD:'+n],{encoding:'utf8'}).replaceAll('\r\n','\n'),current=n=>readFileSync(n,'utf8').replaceAll('\r\n','\n');
 const bank='app/setup/stripe/BankSetupClient.tsx',cut=s=>s.slice(0,s.indexOf('  return (\n    <main'));
 assert.equal(cut(current(bank)),cut(base(bank)));
 const actions=s=>s.slice(s.indexOf('        <div className="rfl-bank-actions">'),s.indexOf('        </div>',s.indexOf('        <div className="rfl-bank-actions">'))+14);assert.equal(actions(current(bank)),actions(base(bank)));
 const tiers='app/setup/recurring/tiers/RecurringTiersClient.tsx',link='<a href={"/setup/recurring/tiers?incremental=1"+(settingsMode?"&mode=settings":"")}>Edit one tier at a time</a>\n';assert.equal(current(tiers),base(tiers).replace(link,''));
 for(const n of ['app/api/stripe/connect/route.ts','app/api/setup/recurring/review/route.ts','lib/stripeAccountProvisioning.ts','lib/stripeProvisioningAttempt.ts','lib/stripeConnectRecovery.ts','scripts/prepare-stripe-connect-recovery.ts','prisma/schema.prisma'])assert.equal(current(n),base(n),n);
});
for(const width of [375,1280]){
 test(`Stripe introduction is compact, semantic and readable at ${width}px`,async()=>{
  const readiness={canChooseAccountCode:false,ready:false,title:'Payment readiness',reasons:[1,2,3,4].map(n=>({code:String(n),route:'/setup/stripe?notice='+n,message:'Payment notice '+n}))};
  const v=await view(width,{readiness});try{
   await expect(v.page.getByRole('heading',{level:1})).toHaveText('Connect your bank');await expect(v.page.getByRole('heading',{level:1})).toHaveCount(1);
   const list=v.page.getByRole('list',{name:'Stripe banking benefits'});await expect(list.getByRole('listitem').locator('p')).toHaveText(benefits);await expect(list.locator('[aria-hidden="true"]')).toHaveText(['\u2713','\u2713','\u2713','\u2713']);
   const note=v.page.getByRole('complementary',{name:'Stripe setup tip'});await expect(note.locator('strong')).toHaveText('Tip');await expect(note.locator('p')).toHaveText(tip);
   const body=await v.page.locator('body').innerText();for(const removed of ['Secure verification','Direct deposits','Usually takes less than 2 minutes.','Your banking information is securely collected and stored by Stripe.','Step 6 of 7'])assert.ok(!body.includes(removed),removed);assert.doesNotMatch(body,/\u00e2\u0153|\ufffd/);
   await expect(v.page.getByRole('button',{name:'Connect Bank Account',exact:true})).toBeEnabled();
   assert.ok(await v.page.evaluate(()=>document.querySelector('h1').compareDocumentPosition(document.querySelector('[aria-label="Payment readiness"]'))&Node.DOCUMENT_POSITION_FOLLOWING));await expect(v.page.getByRole('link',{name:'Payment notice 1',exact:true})).toHaveAttribute('href','/setup/stripe?notice=1');
   assert.ok(await v.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const rows=await list.getByRole('listitem').all();for(const row of rows){const box=await row.boundingBox();assert.ok(box.width>200&&box.height<90);}
   const contrast=await list.locator('p').first().evaluate(el=>{const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=rgb=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);const foreground=lum(rgb(getComputedStyle(el).color));return 1.05/(foreground+.05);});assert.ok(contrast>=4.5,'Text contrast against the white card');
   await v.page.screenshot({path:`../evidence/stripe-${width}.png`,fullPage:true});assert.deepEqual(v.external,[]);
  }finally{await v.page.close();}
 });
 test(`Connect loading, rejected response and successful retry retain the empty POST at ${width}px`,async()=>{
  const v=await view(width);try{
   const button=v.page.getByRole('button',{name:'Connect Bank Account',exact:true});await button.click();await expect(v.page.getByRole('button',{name:'Opening Stripe...'})).toBeDisabled();assert.equal(v.requests.length,1);assert.deepEqual(v.requests[0],{method:'POST',body:null});
   await v.respond({status:400,body:{error:'Synthetic setup rejection'}});await expect(v.page.getByRole('alert')).toHaveText('Synthetic setup rejection');await expect(button).toBeEnabled();
   await button.click();await expect(v.page.getByRole('button',{name:'Opening Stripe...'})).toBeDisabled();await v.respond({status:200,body:{redirectTo:'https://example.test/mock-onboarding'}});await expect(v.page).toHaveURL('https://example.test/mock-onboarding');assert.equal(v.requests.length,2);assert.ok(v.requests.every(r=>r.method==='POST'&&r.body===null));assert.deepEqual(v.external,[]);
  }finally{await v.page.close();}
 });
 test(`existing-account notice, initial error and network retry remain at ${width}px`,async()=>{
  const v=await view(width,{initialStatus:{exists:true,requirementsSummary:'Additional details required'},returnedFromStripe:true,initialError:'Status check failed'});try{
   await expect(v.page.getByRole('alert')).toHaveText('Status check failed');await expect(v.page.getByText('Stripe still needs more information.',{exact:true})).toBeVisible();await expect(v.page.getByText('Remaining: Additional details required',{exact:true})).toBeVisible();
   await v.page.getByRole('button',{name:'Continue Stripe Setup',exact:true}).click();await expect(v.page.getByRole('alert')).toHaveCount(0);await expect(v.page.getByRole('button',{name:'Opening Stripe...'})).toBeDisabled();await v.respond('network');await expect(v.page.getByRole('alert')).toHaveText('Unable to connect. Please try again.');await expect(v.page.getByRole('button',{name:'Continue Stripe Setup'})).toBeEnabled();assert.deepEqual(v.external,[]);
  }finally{await v.page.close();}
 });
 test(`connected-account continuation states are preserved at ${width}px`,async()=>{
  for(const ready of [false,true]){const v=await view(width,{readiness:{canChooseAccountCode:true,ready,reasons:[],title:'Bank connected'}});try{
   await expect(v.page.getByRole('heading',{level:1})).toHaveText('Connect your bank');await expect(v.page.getByText('Bank account connected',{exact:true})).toBeVisible();await expect(v.page.locator('.rfl-bank-success > span')).toHaveText('\u2713');await v.page.getByRole('button',{name:ready?'Go to Dashboard':'Continue to Account Code',exact:true}).click();await expect.poll(()=>v.page.evaluate(()=>window.__redirect)).toBe(ready?'/manager/dashboard':'/setup/account-code');assert.equal(await v.page.evaluate(()=>window.__refresh),true);assert.equal(v.requests.length,0);assert.deepEqual(v.external,[]);
  }finally{await v.page.close();}}
 });
}
