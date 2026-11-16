import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {chromium,expect} from '@playwright/test';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),manifest=JSON.parse(readFileSync('tests/fixtures/sms-consent-captures.json','utf8')),cache=new Map();
const forbidden=()=>{throw Error('NO_AUTH_DATABASE_PROVIDER_OR_BUDGET_ACCESS_EXPECTED');};
function load(file){if(cache.has(file))return cache.get(file);const code=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const m={exports:{}};vm.runInThisContext('(function(require,module,exports,process){'+code+'})',{filename:file})(n=>{
 if(n==='@/lib/prisma')return {prisma:new Proxy({},{get:forbidden})};if(n==='@/lib/publicRequestBudget')return {publicRequestGuard:forbidden};if(n==='@/lib/verifiedLookupIp')return {verifiedLookupIp:forbidden};
 if(n==='@/lib/smsConsent')return load('lib/smsConsent.ts');if(n==='./lib/publicMetadata'||n==='@/lib/publicMetadata')return load('lib/publicMetadata.ts');if(n.startsWith('@/'))return forbidden();return require(n);
},m,m.exports,{env:{NODE_ENV:'production'}});cache.set(file,m.exports);return m.exports;}
const Page=load('app/sms-consent/page.tsx'),Terms=load('app/terms/page.tsx'),html=()=>renderToStaticMarkup(React.createElement(Page.default));
test('evidence page is anonymous and noindex independently of credentials and lookup ingress',async()=>{
 const output=html();assert.match(output,/CBA Processing LLC/);assert.deepEqual(Page.metadata.robots,{index:false,follow:false});assert.doesNotMatch(output,/<form|<input|sk_live_|RFL Live Verification|cmwhe|cmwie/);assert.ok(output.includes('/privacy')&&output.includes('/terms'));
 const {NextRequest}=require('next/server');for(const method of ['GET','HEAD'])for(const url of ['/sms-consent','/sms-consent/customer-opt-in.png']){const r=await load('proxy.ts').proxy(new NextRequest('https://example.test'+url,{method}));assert.equal(r.headers.get('x-middleware-next'),'1');}
 const rules=await load('next.config.ts').default.headers(),{pathToRegexp}=require('next/dist/compiled/path-to-regexp');for(const url of ['/sms-consent','/sms-consent/customer-opt-in.png'])assert.ok(rules.some(r=>pathToRegexp(r.source).test(url)&&r.headers.some(h=>h.key==='X-Robots-Tag'&&h.value.includes('noindex'))));
 assert.ok(!load('app/(marketing)/sitemap.ts').default().some(x=>x.url.endsWith('/sms-consent')));
});
test('explanation preserves the separate optional choices and exact live disclosure wording',()=>{
 const output=html(),copy=load('lib/smsConsent.ts');for(const text of ['separate, unchecked checkbox','Managers separately enable notifications','Manage','Payment SMS Notifications','Message frequency varies','message and data rates may apply','STOP','HELP','fictional example details'])assert.ok(output.includes(text),text);assert.ok(output.includes(copy.TENANT_SMS_DISCLOSURE));assert.ok(output.includes(copy.MANAGEMENT_SMS_DISCLOSURE));assert.match(output,/separate consent checkbox is unchecked/);
});
test('all six genuine captures retain source/image integrity, fabricated details and unchecked consent states',()=>{
 assert.equal(manifest.captureMethod,'Playwright Chromium screenshots of the actual unmodified RFL React components and stylesheet');assert.deepEqual(manifest.fictionalDetails,{firstName:'Jordan',lastName:'Example',unit:'DEMO-12',phone:'202-555-0142'});assert.equal(manifest.mutatingRequests,0);assert.equal(manifest.externalRequests,0);assert.equal(manifest.captures.length,6);
 for(const [file,digest]of Object.entries(manifest.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),digest,'Consent source changed: recapture evidence');
 for(const c of manifest.captures){const b=readFileSync(c.file);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),c.width);assert.equal(b.readUInt32BE(20),c.height);assert.equal(createHash('sha256').update(b).digest('hex'),c.sha256);if(c.file.includes('customer'))assert.equal(c.customerConsentChecked,false);if(c.file.includes('manager-consent')){assert.equal(c.notificationsEnabled,true);assert.equal(c.managerConsentChecked,false);}if(c.file.includes('manager-off'))assert.equal(c.notificationsEnabled,false);}
});
test('Terms SMS section bolds STOP and HELP and uses the approved existing support email',()=>{
 const output=renderToStaticMarkup(React.createElement(Terms.default)),section=output.slice(output.indexOf('<h2>11. Payment-status SMS'),output.indexOf('<h2>12. Acceptable Use'));assert.match(section,/<strong>STOP<\/strong>/);assert.match(section,/<strong>HELP<\/strong>/);assert.match(section,/<a href="mailto:helpdesk@rentfray.com">helpdesk@rentfray.com<\/a>/);assert.match(section,/Supplying a phone number alone does not provide SMS consent/);
});
const style=postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:path.resolve('app/globals.css')}).then(r=>r.css+'\n:root{--font-geist-sans:Arial;}');
const screenshotDir=process.env.RFL_CONSENT_SCREENSHOTS??path.join(require('node:os').tmpdir(),'rfl-sms-consent-page');mkdirSync(screenshotDir,{recursive:true});
for(const width of [320,390,768,1280])test('anonymous evidence page and authentic responsive images at '+width+'px',async()=>{
 const browser=await chromium.launch({headless:true}),css=await style,requests=[];try{const page=await browser.newPage({viewport:{width,height:1000}});await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());assert.equal(r.method(),'GET');assert.equal(u.origin,'https://example.test');assert.ok(!r.headers().cookie);requests.push(u.pathname);if(u.pathname.endsWith('.png')){const f=manifest.captures.find(x=>'/'+x.file.replace(/^public\//,'')===u.pathname);assert.ok(f,'Only approved capture images may load');return route.fulfill({status:200,contentType:'image/png',body:readFileSync(f.file),headers:{'X-Robots-Tag':'noindex, nofollow'}});}assert.equal(u.pathname,'/sms-consent');return route.fulfill({status:200,contentType:'text/html; charset=utf-8',headers:{'X-Robots-Tag':'noindex, nofollow'},body:'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><style>'+css+'</style></head><body>'+html()+'</body></html>'});});const response=await page.goto('https://example.test/sms-consent');assert.equal(response.status(),200);assert.ok(response.headers()['x-robots-tag'].includes('noindex'));await expect(page.getByRole('heading',{level:1,name:'How SMS consent is collected'})).toBeVisible();await expect(page.locator('figure')).toHaveCount(3);await expect(page.locator('input,form')).toHaveCount(0);
 for(const img of await page.locator('figure img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());assert.ok(await img.evaluate(e=>e.complete&&e.naturalWidth>0));const src=await img.evaluate(e=>e.currentSrc);assert.equal(src.endsWith('-mobile.png'),width<=600);}
 await page.getByText('Read the exact customer disclosure',{exact:true}).click();await expect(page.getByText(load('lib/smsConsent.ts').TENANT_SMS_DISCLOSURE,{exact:true})).toBeVisible();await page.getByText('Read the exact manager disclosure',{exact:true}).click();await expect(page.getByText(load('lib/smsConsent.ts').MANAGEMENT_SMS_DISCLOSURE,{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');assert.equal((await page.context().cookies()).length,0);assert.ok(!requests.some(x=>x.startsWith('/api/')));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(screenshotDir,'sms-consent-'+width+'.png'),fullPage:true});writeFileSync(path.join(screenshotDir,'anonymous-'+width+'.json'),JSON.stringify({httpStatus:response.status(),noindex:true,cookies:0,requests},null,2));
 }finally{await browser.close();}
});
