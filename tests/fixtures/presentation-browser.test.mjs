import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import {reportingFixture} from '../helpers/reporting-harness.mjs';

// Explicit native-browser profile only: use the established offline browser guard.
assert.equal(typeof globalThis[Symbol.for('rfl.offline.guard.stats')],'function');
assert.ok(process.env.RFL_BROWSER_ARTIFACT,'A task-owned browser evidence directory is required');
const artifact=path.resolve(process.env.RFL_BROWSER_ARTIFACT);
const evidence=[];
const save=()=>writeFileSync(path.join(artifact,'presentation-results.json'),JSON.stringify(evidence,null,2));
const origin='https://example.test';
const sizes=[[360,800],[390,844],[1024,768],[1440,900]];

for(const [name,count,long,identifiers] of [['small',3,false,false],['multi-page',65,false,false],['long-descriptions',5,true,false],['long-identifiers',3,false,true]])test('native print: '+name,async()=>{
 const f=await reportingFixture(),disputeRows=[];
 for(let i=0;i<count;i++){
  const dispute=i===2?'under_review':i===3?'won':i===4?'lost':null;
  const row=await f.seed({payerFirstName:i===0?'=SUM(1,1)':'Synthetic',payerLastName:identifiers?('Long synthetic payer surname ').repeat(6)+i:'Tenant '+i,paymentMethod:i%2?'CARD':'ACH',...(identifiers?{id:'long_id_'+i+'_'+('0123456789abcdef').repeat(16)}:{}),
   status:dispute&&dispute!=='won'?'DISPUTED':'PAID',disputedAt:dispute?new Date('2026-11-16T12:00:00Z'):null,
   itemDescription:long?('Long synthetic description with readable words, unit details and <escaped> text. ').repeat(15):'Synthetic monthly rent',
   customerRefunds:i<2?[{stripeRefundId:'re_synthetic_'+i,currency:'usd',status:'succeeded',amountCents:i===0?10200:100}]:[],
   lineItemsSnapshot:[{label:long?'Long original charge description '.repeat(8):'Original rent',amountCents:10000}]});
  if(dispute)disputeRows.push(await f.db.auditLog.create({data:{businessId:f.business.id,actorType:'STRIPE_WEBHOOK',action:'SYNTHETIC_DISPUTE_OBSERVED',targetType:'PAYMENT',targetId:row.id,metadata:{reportingDisputeOutcome:dispute==='under_review'?'ACTIVE':dispute.toUpperCase(),reportingDisputes:[{id:'dp_synthetic_'+i,status:dispute}]}}}));
 }
 await f.seed({businessId:f.businesses[1].id,payerFirstName:'FOREIGN_PRIVATE_MARKER'});
 // The isolated auth store has no Prisma AND/JSON filtering. Supply exact scoped
 // observations while exercising the real terminal-outcome projection.
 f.db.auditLog.findMany=async({where})=>{assert.equal(where.actorType,'STRIPE_WEBHOOK');assert.equal(where.targetType,'PAYMENT');const scopes=where.AND[0].OR;assert.ok(scopes.every(s=>s.businessId===f.business.id));return disputeRows.filter(row=>scopes.some(s=>s.businessId===row.businessId&&s.targetId.in.includes(row.targetId)));};
 const query='from=2026-11-01&to=2026-11-30',before=await f.list(query,true),cells=f.report.transactionReportCells(before.payments,'America/Chicago');
 assert.ok(before.payments.some(p=>p.refundState==='FULL'));assert.ok(before.payments.some(p=>p.refundState==='PARTIAL'));assert.ok(before.payments.some(p=>p.disputeOutcome==='ACTIVE'));
 if(count>=5)for(const outcome of ['WON','LOST'])assert.ok(before.payments.some(p=>p.disputeOutcome===outcome),'Fixture must exercise dispute '+outcome);
 assert.equal(cells.headers.length,39);assert.ok(before.payments.some(p=>p.paymentMethod==='ACH')&&before.payments.some(p=>p.paymentMethod==='CARD'));
 const csvBefore=await (await f.endpoint(query)).text();
 const response=await f.endpoint(query+'&format=print');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 const html=await response.text();assert.ok(!html.includes('FOREIGN_PRIVATE_MARKER'));assert.ok(!html.includes('5555551234'));assert.ok(!html.includes('dp_synthetic'));assert.ok(!html.includes('<escaped>'));assert.match(csvBefore,/'=SUM\(1,1\)/);
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:1032,height:703}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.fulfill({contentType:'text/html',body:html}):route.abort());
  await page.goto(origin+'/print');await page.emulateMedia({media:'print'});
  await expect(page.locator('tbody tr')).toHaveCount(count);await expect(page.locator('tbody')).toContainText('Dispute active');if(count>=5)for(const outcome of ['Dispute closed won','Dispute closed lost'])await expect(page.locator('tbody')).toContainText(outcome);await expect(page.locator('.actions')).toBeHidden();
  assert.deepEqual(await page.locator('tbody h2 span').allTextContents(),cells.rows.map(row=>row[0]));
  assert.deepEqual(await page.locator('dd').allTextContents(),cells.rows.flatMap(row=>row.slice(1).map(value=>String(value??''))));
  assert.deepEqual(await page.locator('dt').evaluateAll(es=>es.map(e=>e.title)),cells.rows.flatMap(()=>cells.headers.slice(1)),'Every concise label retains its exact canonical field identity');
  const printedLabels=await page.locator('dt').allTextContents();assert.ok(printedLabels.every(label=>label.trim().length>0));assert.equal(new Set(printedLabels.slice(0,38)).size,38,'Every record has 38 distinct visible labels plus its transaction ID');
  assert.equal(await page.locator('thead').evaluate(e=>getComputedStyle(e).display),'table-header-group');
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   values:[...document.querySelectorAll('dd')].map(e=>{const field=e.parentElement.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);return {label:e.previousElementSibling.textContent,width:field.width,clipped:[...r.getClientRects()].some(b=>b.right>field.right+1||b.left<field.left-1),font:parseFloat(getComputedStyle(e).fontSize),labelFont:parseFloat(getComputedStyle(e.previousElementSibling).fontSize)};}),
   headerHeight:document.querySelector('thead').getBoundingClientRect().height,records:[...document.querySelectorAll('tbody tr')].map(e=>e.getBoundingClientRect().height),
   ids:[...document.querySelectorAll('h2 span')].map(e=>{const r=document.createRange();r.selectNodeContents(e);const box=e.parentElement.getBoundingClientRect();return {lines:r.getClientRects().length,clipped:[...r.getClientRects()].some(b=>b.left<box.left-1||b.right>box.right+1)};})}));
  assert.ok(layout.scrollWidth<=layout.width+1,'Report must not overflow horizontally');
  writeFileSync(path.join(artifact,name+'-layout.json'),JSON.stringify(layout,null,2));
  assert.ok(layout.values.every(v=>!v.clipped&&v.font>=13&&v.labelFont>=12),'Content-sized values must remain readable and unclipped: '+JSON.stringify(layout.values.filter(v=>v.clipped||v.font<13||v.labelFont<12)));
  assert.ok(layout.ids.every(id=>!id.clipped&&(identifiers?id.lines>1:id.lines===1)),'Ordinary IDs stay on one line; unusually long IDs wrap legibly without clipping');
  if(!long)assert.ok(Math.max(...layout.records)+layout.headerHeight<(210-24)*96/25.4-8,'Ordinary records and repeated header must fit within the physical printable page');
  const pdf=await page.pdf({path:path.join(artifact,name+'.pdf'),format:'A4',landscape:true,preferCSSPageSize:true,printBackground:true});
  const text=pdf.toString('latin1'),pageCount=(text.match(/\/Type\s*\/Page\b/g)||[]).length;
  assert.ok(pageCount>=1);if(count===65){assert.ok(pageCount>1,'The native multipage path must execute');assert.ok(pageCount/33<=0.6,'Ordinary bulk print must materially improve on the 33-page baseline without reducing readable font sizes');}
  const box=text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);assert.ok(box&&Number(box[1])>Number(box[2]),'Native output must be landscape');
  await page.screenshot({path:path.join(artifact,name+'.png'),fullPage:true});
  for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.emulateMedia({media:'screen'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Print document screen preview must not overflow at '+width);}
  assert.deepEqual(errors,[]);assert.deepEqual(await f.list(query,true),before);assert.equal(await (await f.endpoint(query)).text(),csvBefore);
  evidence.push({workflow:'print',name,records:count,browser:browser.version(),pageCount,landscape:true,maxRecordHeight:Math.max(...layout.records),valueColumnsReadable:true,all39ValuesPreserved:true,originalOrderAndCsvUnchanged:true});save();
 }finally{await browser.close();}
});

function luminance(rgb){const channels=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return channels.reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const l=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(l[0]+.05)/(l[1]+.05);}
for(const [width,height] of sizes)test('native primary-button states: '+width+'x'+height,async()=>{
 const css=readFileSync('app/globals.css','utf8').replace(/^@import "tailwindcss";\s*/,''),browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width,height},hasTouch:width<500});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><main class="rfl-public-checkout"><button class="rfl-primary-button" id="primary">Continue to Secure Payment</button><button class="rfl-primary-button" disabled>Review Payment</button></main></body></html>'}):r.abort());
  await page.goto(origin+'/buttons');const button=page.locator('#primary'),states=[];
  const measure=async state=>{await button.evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));const s=await button.evaluate(e=>{const c=getComputedStyle(e);return{foreground:c.color,background:c.backgroundColor,outline:c.outline,shadow:c.boxShadow,focusVisible:e.matches(':focus-visible')};});const contrast=ratio(s.foreground,s.background);assert.ok(contrast>=4.5,state+' text contrast must be at least 4.5:1');states.push({state,...s,contrast});};
  await measure('normal');await button.hover();await measure('hover');await page.mouse.down();await measure('active');await page.mouse.up();await page.mouse.move(0,0);await page.goto(origin+'/buttons?keyboard=1');await page.keyboard.press('Tab');await expect(button).toBeFocused();await measure('focus');assert.ok(states.at(-1).focusVisible&&states.at(-1).shadow!=='none','Keyboard focus must remain visible');
  const disabled=page.getByRole('button',{name:'Review Payment',exact:true});await expect(disabled).toBeDisabled();const disabledStyle=await disabled.evaluate(e=>({opacity:getComputedStyle(e).opacity,cursor:getComputedStyle(e).cursor}));assert.ok(Number(disabledStyle.opacity)<1);assert.equal(disabledStyle.cursor,'not-allowed');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifact,'buttons-'+width+'.png'),fullPage:true});evidence.push({workflow:'contrast',browser:browser.version(),width,height,states,disabled:disabledStyle});save();
 }finally{await browser.close();}
});
