import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {managementBillingHarness} from './helpers/management-billing-harness.mjs';
import {tierFixture} from './helpers/tier-configuration-harness.mjs';
const plan=()=>({id:'a',businessId:'business',isActive:true,name:'Standard',baseAmountCents:10000,dueDay:1,gracePeriodDays:5,initialLateFeeCents:0,dailyLateFeeCents:0,dailyLateFeeMaxDays:0,charges:[]});
const rule=days=>({recurringPlanId:'a',dueDay:1,gracePeriodDays:5,initialLateFeeCents:0,dailyLateFeeCents:days===0?0:100,dailyLateFeeMaxDays:days});
for(const days of [0,25,-1,26,1.5,'bad','25',null])test(`bulk and paginated billing agree on daily days ${JSON.stringify(days)}`,async()=>{
 const valid=days===0||days===25,h=managementBillingHarness({plans:[plan()]}),response=await h.load('app/api/setup/recurring/billing/route.ts').PUT(h.request({sameRulesForAll:false,rules:[rule(days)]}));assert.equal(response.status,valid?200:400);if(!valid)assert.deepEqual(h.writes,[]);
 const f=await tierFixture(),before=await f.row(f.first.id),value={...rule(days)};delete value.recurringPlanId;
 const patch=await f.send('billing',{operation:'billing',id:f.first.id,version:await f.version(f.first.id),shared:false,rule:value});assert.equal(patch.status,valid?200:400,await patch.clone().text());if(!valid)assert.deepEqual(await f.row(f.first.id),before);
});
test('historical rules are displayed without a silent cap and rejected writes leave history alone',async()=>{
 const f=await tierFixture();await f.db.recurringPlan.update({where:{id:f.first.id},data:{dailyLateFeeCents:100,dailyLateFeeMaxDays:365}});const before=await f.row(f.first.id);assert.equal((await f.page()).tiers[0].dailyLateFeeMaxDays,365);
 const response=await f.send('billing',{operation:'billing',id:f.first.id,version:await f.version(f.first.id),shared:false,rule:{...rule(26),recurringPlanId:undefined}});assert.equal(response.status,400);assert.deepEqual(await f.row(f.first.id),before);
 const h=managementBillingHarness({plans:[{...plan(),dailyLateFeeCents:100,dailyLateFeeMaxDays:365}]});const html=renderToStaticMarkup(h.renderClient('app/setup/recurring/billing/RecurringBillingClient.tsx',{initialRules:[{recurringPlanId:'a',tierName:'Historical',dueDay:'1',gracePeriodDays:'5',initialLateFee:'0.00',dailyLateFee:'1.00',dailyLateFeeMaxDays:'365'}],highestReachedStep:4}));assert.match(html,/value="365"/);await h.flushAutosaves();assert.equal(h.requests.length,0);
});
test('new day constraint preserves daily-fee coupling and total financial ceiling',async()=>{
 for(const extra of [{dailyLateFeeCents:100,dailyLateFeeMaxDays:0},{dailyLateFeeCents:0,dailyLateFeeMaxDays:25},{initialLateFeeCents:500000,dailyLateFeeCents:0,dailyLateFeeMaxDays:0},{initialLateFeeCents:10000001,dailyLateFeeCents:0,dailyLateFeeMaxDays:0}]){
 const h=managementBillingHarness({plans:[plan()]});assert.equal((await h.load('app/api/setup/recurring/billing/route.ts').PUT(h.request({sameRulesForAll:false,rules:[{...rule(0),...extra}]}))).status,400);assert.deepEqual(h.writes,[]);
 }
});
test('tier creation still rejects invalid amounts and accepts cent-accurate valid amounts',async()=>{
 const f=await tierFixture();for(const amountCents of [-1,0,1.5,500001])assert.equal((await f.send('tiers',{operation:'tier',name:'Invalid',amountCents})).status,400);
 const response=await f.send('tiers',{operation:'tier',name:'New option',amountCents:10050});assert.equal(response.status,200);assert.equal((await f.db.recurringPlan.findMany({where:{businessId:f.businessId,name:'New option'}}))[0].baseAmountCents,10050);
});

async function browserBundle(){return build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Tiers from './app/setup/recurring/tiers/RecurringTiersClient.tsx';import Charges from './app/setup/recurring/charges/RecurringChargesClient.tsx';import Billing from './app/setup/recurring/billing/RecurringBillingClient.tsx';import Review from './app/setup/recurring/review/RecurringReviewClient.tsx';import Paginated from './components/setup/PaginatedRecurringConfiguration.tsx';const clients={tiers:Tiers,charges:Charges,billing:Billing,review:Review,paginated:Paginated};createRoot(document.getElementById('root')).render(React.createElement(clients[window.__view],window.__props));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'local-next',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/link'?"import React from 'react';export default function Link({href,children,...p}){return React.createElement('a',{href,...p},children);}":"export function useRouter(){return {push:url=>window.__redirect=url,replace:url=>window.__redirect=url,refresh:()=>{}};}export function useSearchParams(){return new URLSearchParams(window.location.search);}",loader:'js',resolveDir:process.cwd()}));
 }}]});}

test('actual setup editors: mobile/desktop copy, assignments, zero placeholders, cents and bounded spinner',async()=>{
 const {chromium,expect}=await import('@playwright/test'),postcss=(await import('postcss')).default,tailwind=(await import('@tailwindcss/postcss')).default;
 const compiled=await browserBundle(),css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'})).css+'\n:root{--font-geist-sans:Arial;}';
 const browser=await chromium.launch({headless:true});
 async function view(kind,width,{existing=false,paginatedStep}={}){
 const f=await tierFixture('isolated',kind==='charges'?2:1),page=await browser.newPage({viewport:{width,height:950}});page.setDefaultTimeout(20000);
 // This existing storage fixture hydrates include relations; adapt Prisma's
 // select.charges projection too for the bulk billing route's real query.
 const findMany=f.db.recurringPlan.findMany.bind(f.db.recurringPlan);
 f.db.recurringPlan.findMany=args=>findMany(args?.select?.charges?{...args,include:{...args.include,charges:args.select.charges}}:args);
 if(existing)await f.db.recurringPlan.update({where:{id:f.first.id},data:{initialLateFeeCents:10000,dailyLateFeeCents:10050,dailyLateFeeMaxDays:25}});
 const plans=await f.db.recurringPlan.findMany({where:{businessId:f.businessId,isActive:true},include:{charges:true}}),version=f.load('lib/recurringConfiguration.ts').configurationFingerprint(plans),requests=[],external=[];
 const props=kind==='tiers'?{initialVersion:version,initialTiers:plans.map(p=>({id:p.id,name:p.name,amount:(p.baseAmountCents/100).toFixed(2)})),highestReachedStep:2}:kind==='charges'?{initialVersion:version,initialTiers:plans.map(p=>({recurringPlanId:p.id,name:p.name,baseAmount:(p.baseAmountCents/100).toFixed(2),charges:[]})),highestReachedStep:3}:kind==='billing'?{initialVersion:version,initialRules:plans.map(p=>({recurringPlanId:p.id,tierName:p.name,dueDay:'1',gracePeriodDays:'5',initialLateFee:(p.initialLateFeeCents/100).toFixed(2),dailyLateFee:(p.dailyLateFeeCents/100).toFixed(2),dailyLateFeeMaxDays:String(p.dailyLateFeeMaxDays)})),highestReachedStep:4}:kind==='review'?{tiers:plans,highestReachedStep:5}:{step:paginatedStep,highestReachedStep:5};
 await page.route('**/*',async route=>{try{
 const req=route.request(),u=new URL(req.url());if(u.origin!=='https://example.test'){external.push(u.origin);return route.abort();}
 if(u.pathname.startsWith('/api/setup/recurring/')){
 const body=req.postData()?JSON.parse(req.postData()):undefined;requests.push({path:u.pathname,method:req.method(),body});
 const handler=f.load('app'+u.pathname+'/route.ts')[req.method()];const response=await handler(new Request(req.url(),{method:req.method(),headers:{origin:'https://example.test','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));requests[requests.length-1].status=response.status;requests[requests.length-1].response=await response.clone().text();return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }
 return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><div id="root"></div><script>window.__view='+JSON.stringify(kind)+';window.__props='+JSON.stringify(props)+';</script><script>'+compiled.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'});
 }catch(error){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:String(error.message)})});}});
 await page.goto('https://example.test/fixture/'+kind);return {f,page,plans,requests,external};
 }
 try{for(const width of [375,1280]){
 let v=await view('tiers',width);await expect(v.page.getByRole('heading',{level:1})).toHaveText('Create each monthly price option your customers can select.');await expect(v.page.getByText('Enter numbers only. No $ needed.',{exact:true})).toHaveCount(0);
 await v.page.getByRole('button',{name:'+ Add Tier',exact:true}).click();await v.page.getByLabel('Tier name',{exact:true}).last().fill('Premium');await v.page.getByLabel('Monthly amount',{exact:true}).last().fill('100.50');await v.page.getByRole('button',{name:/^Continue to /}).click();await expect.poll(()=>v.page.evaluate(()=>window.__redirect)).toBe('/setup/recurring/charges');assert.equal((await v.f.db.recurringPlan.findMany({where:{businessId:v.f.businessId,name:'Premium'}}))[0].baseAmountCents,10050);
 await v.page.screenshot({path:`../evidence/tiers-${width}.png`,fullPage:true});assert.deepEqual(v.external,[]);await v.page.close();
 v=await view('charges',width);await expect(v.page.getByText('Edit one tier at a time',{exact:true})).toHaveCount(0);await expect(v.page.getByText('Enter numbers only. No $ needed.',{exact:true})).toHaveCount(0);await expect(v.page.getByRole('link',{name:'Back to Tiers',exact:true})).toHaveAttribute('href','/setup/recurring/tiers');
 await v.page.getByRole('button',{name:/Add.*Charge/i}).click();await v.page.getByLabel('Charge name',{exact:true}).fill('Water');await v.page.getByLabel('Monthly amount',{exact:true}).fill('10');await v.page.getByLabel('Selected tiers',{exact:true}).check();await v.page.getByRole('button',{name:/^Continue to /}).click();await expect(v.page.getByRole('alert')).toContainText(/at least one tier/i);
 await v.page.getByRole('checkbox').first().check();await v.page.getByRole('button',{name:/^Continue to /}).click();await expect.poll(()=>v.page.evaluate(()=>window.__redirect)).toBe('/setup/recurring/billing');let rows=await v.f.db.recurringCharge.findMany({where:{isActive:true}});assert.equal(rows.length,1);assert.equal(rows[0].recurringPlanId,v.plans[0].id);
 await v.page.getByLabel('All tiers',{exact:true}).check();await v.page.getByRole('button',{name:/^Continue to /}).click();await expect.poll(async()=> (await v.f.db.recurringCharge.findMany({where:{isActive:true}})).length).toBe(2);
 await v.page.screenshot({path:`../evidence/charges-${width}.png`,fullPage:true});assert.deepEqual(v.external,[]);await v.page.close();
 v=await view('billing',width);const initial=v.page.getByLabel('Initial late fee',{exact:true}),daily=v.page.getByLabel('Daily late fee',{exact:true}),days=v.page.locator('input[type="number"]');
 await expect(v.page.getByText('Edit one tier at a time',{exact:true})).toHaveCount(0);await expect(v.page.getByText('Payments are due on the 1st of every month. Choose your grace period and late fees.',{exact:true})).toBeVisible();await expect(v.page.locator('select option')).toHaveText(['3 days','4 days','5 days']);
 await expect(initial).toHaveValue('');await expect(daily).toHaveValue('');await expect(initial).toHaveAttribute('placeholder','0.00');await expect(daily).toHaveAttribute('placeholder','0.00');assert.equal(await initial.evaluate(el=>getComputedStyle(el,'::placeholder').color!==getComputedStyle(el).color),true);
 await v.page.getByRole('button',{name:/^Continue to /}).click();await expect.poll(()=>v.page.evaluate(()=>window.__redirect)).toBe('/setup/recurring/review').catch(async error=>{throw Error(error.message+'\n'+JSON.stringify({alerts:await v.page.getByRole('alert').allTextContents(),requests:v.requests}));});let stored=await v.f.row(v.f.first.id);assert.equal(stored.initialLateFeeCents,0);assert.equal(stored.dailyLateFeeCents,0);
 const help=await v.page.locator('.rfl-field-help').filter({hasText:'Includes the 1st.'}).boundingBox(),labelBox=await v.page.locator('label[for^="initial-fee-"]').boundingBox();assert.ok(help.y+help.height<=labelBox.y,'Grace-period help must not overlap the fee label');
 await v.page.screenshot({path:`../evidence/billing-zero-${width}.png`,fullPage:true});
 await initial.fill('100');await daily.fill('100.50');await days.fill('25');await v.page.getByRole('button',{name:/^Continue to /}).click();await expect.poll(async()=> (await v.f.row(v.f.first.id)).dailyLateFeeCents).toBe(10050);stored=await v.f.row(v.f.first.id);assert.equal(stored.initialLateFeeCents,10000);assert.equal(stored.dailyLateFeeMaxDays,25);
 await expect(days).toHaveAttribute('min','0');await expect(days).toHaveAttribute('max','25');await expect(days).toHaveAttribute('step','1');await days.press('ArrowUp');await expect(days).toHaveValue('25');await days.fill('0');await days.press('ArrowDown');await expect(days).toHaveValue('0');
 for(const value of ['-1','26','1.5','']){await days.fill(value);await expect(v.page.locator('[id^="daily-days-error-"]')).toHaveText('Enter a whole number from 0 to 25 for daily late-fee days.');await expect(days).toHaveAttribute('aria-invalid','true');const before=v.requests.filter(r=>r.body?.advance).length;await v.page.getByRole('button',{name:/^Continue to /}).click();assert.equal(v.requests.filter(r=>r.body?.advance).length,before);if(value==='26')await expect(days).toHaveValue('26');}
 await days.pressSequentially('abc');await expect(days).toHaveValue('');await expect(days).toHaveAttribute('aria-invalid','true');await days.fill('25');await expect(v.page.locator('[id^="daily-days-error-"]')).toHaveCount(0);
 await daily.fill('');await days.fill('0');for(const value of ['-1','100.001','bad']){await initial.fill(value);await v.page.getByRole('button',{name:/^Continue to /}).click();await expect(v.page.getByRole('alert')).toContainText('valid initial late fee');}
 assert.deepEqual(v.external,[]);await v.page.close();
 v=await view('billing',width,{existing:true});await expect(v.page.getByLabel('Initial late fee',{exact:true})).toHaveValue('100.00');await expect(v.page.getByLabel('Daily late fee',{exact:true})).toHaveValue('100.50');await expect(v.page.locator('input[type="number"]')).toHaveValue('25');await v.page.close();
 v=await view('review',width);await expect(v.page.getByText('Payment Due:',{exact:true})).toBeVisible();await expect(v.page.getByText('Rent Due:',{exact:true})).toHaveCount(0);await expect(v.page.getByRole('button',{name:'Continue to Stripe',exact:true})).toBeVisible();await v.page.screenshot({path:`../evidence/review-${width}.png`,fullPage:true});assert.deepEqual(v.external,[]);await v.page.close();
 v=await view('paginated',width,{paginatedStep:'billing'});await expect(v.page.getByLabel('Initial late fee',{exact:true})).toHaveValue('');await expect(v.page.getByLabel('Daily late fee',{exact:true})).toHaveValue('');await expect(v.page.locator('input[type="number"]')).toHaveAttribute('max','25');await v.page.getByLabel('Initial late fee',{exact:true}).fill('100.50');await v.page.getByRole('button',{name:'Save billing rules',exact:true}).click();await expect.poll(async()=> (await v.f.row(v.f.first.id)).initialLateFeeCents).toBe(10050);await v.page.close();
 }
 }finally{await browser.close();}
});
