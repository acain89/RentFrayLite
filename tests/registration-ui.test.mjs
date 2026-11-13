import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { managementBillingHarness } from './helpers/management-billing-harness.mjs';

const h=managementBillingHarness(),phone=h.load('lib/registrationPhone.ts');
const bundle=await build({entryPoints:['lib/registrationPhone.ts'],bundle:true,write:false,platform:'browser',format:'iife',globalName:'phone'});
const browser={};vm.runInNewContext(bundle.outputFiles[0].text,browser);
const account=extra=>({businessName:'Test Property',ownerName:'Test Manager',email:'manager@example.test',password:'Abcdef12',confirmPassword:'Abcdef12',acceptedTerms:true,propertyTimeZone:'America/Chicago',...extra});
const valid=['3125551234','312-555-1234','(312) 555-1234','1 312 555 1234','+13125551234','+1 (312) 555-1234'];
for(const value of valid)test(`US phone normalizes on client and server: ${value}`,async()=>{
  assert.equal(phone.normalizeRegistrationPhone(value),'+13125551234');assert.equal(browser.phone.normalizeRegistrationPhone(value),'+13125551234');
  assert.equal(phone.formatRegistrationPhone(value),'312-555-1234');assert.equal(browser.phone.formatRegistrationPhone(value),'312-555-1234');
  for(const consent of [false,true]){
    const f=managementBillingHarness(),response=await f.load('app/api/setup/route.ts').POST(f.request(account({contactPhone:value,smsConsent:consent})));
    assert.equal(response.status,201);const business=f.state().businesses[0];assert.equal(business.contactPhone,'+13125551234');
    assert.equal(business.smsConsentPhone,consent?'+13125551234':null);assert.equal(!!business.smsConsentAt,consent);
    assert.equal(business.smsConsentVersion,consent?f.load('lib/smsConsent.ts').SMS_CONSENT_VERSION:null);
  }
});
const invalid=['123-555-1234','312-155-1234','312-555-123','312-555-12345','+44 20 7946 0958','+31 255 51234','3125551234abc','3125551234 ext 9','++13125551234','2'.repeat(31),null,123];
for(const [i,value] of invalid.entries())test(`invalid phone rejects, without signup writes: ${i}`,async()=>{
 assert.equal(phone.normalizeRegistrationPhone(value),null);assert.equal(browser.phone.normalizeRegistrationPhone(value),null);
 for(const smsConsent of [false,true]){
 const f=managementBillingHarness(),response=await f.load('app/api/setup/route.ts').POST(f.request(account({contactPhone:value,smsConsent})));
 assert.equal(response.status,400);assert.deepEqual(f.writes,[]);
 }
});
for(const value of [undefined,'','   '])test(`empty optional phone: ${JSON.stringify(value)}`,async()=>{
 for(const smsConsent of [false,true]){
 const f=managementBillingHarness(),response=await f.load('app/api/setup/route.ts').POST(f.request(account({contactPhone:value,smsConsent})));
 assert.equal(response.status,smsConsent?400:201);
 if(smsConsent){assert.equal((await response.json()).error,phone.REGISTRATION_SMS_PHONE_REQUIRED);assert.deepEqual(f.writes,[]);}
 else{assert.equal(f.state().businesses[0].contactPhone,undefined);assert.equal(f.state().businesses[0].smsConsentAt,null);}
 }
});
test('partial formatting preserves invalid/overflow input for correction',()=>{
 for(const [value,expected] of [['',''],['3','3'],['3125','312-5'],['3125551','312-555-1'],['312555123456','312555123456'],['+442079460958','+442079460958'],['abc','abc']]){
 assert.equal(phone.formatRegistrationPhone(value),expected);assert.equal(browser.phone.formatRegistrationPhone(value),expected);
 }
});
test('Step 1 retains dependent name, one email, timezone and security controls',()=>{
 const html=renderToStaticMarkup(h.load('app/setup/SetupAccountClient.tsx').default());
 assert.match(html,/>Create your account</);assert.match(html,/>Business Name</);assert.match(html,/>Your name</);
 assert.match(html,/Cell Phone Number/);assert.match(html,/XXX-XXX-XXXX/);assert.match(html,/Optional/);
 assert.equal((html.match(/type="email"/g)||[]).length,1);
 assert.doesNotMatch(html,/Set up your property|Manager Login|Account password|Payment SMS Notifications default|push notifications/i);
 for(const text of ['I am authorized','STOP','HELP','frequency varies','Message and data rates may apply','Consent is not required to sign up or pay','registration-password-rules','Confirm password','Step 1 of 4'])assert.ok(html.includes(text),text);
 for(const zone of h.load('lib/managementBillingSetup.ts').PROPERTY_TIME_ZONE_OPTIONS)assert.ok(html.includes(zone.value));
 assert.match(html,/name="smsConsent"/);assert.doesNotMatch(html,/<input[^>]*name="smsConsent"[^>]*checked/);
 assert.match(html,/href="\/terms"/);assert.match(html,/href="\/privacy"/);
});
test('registration cannot omit the required account name',()=>{
 assert.equal(h.load('lib/validators.ts').setupAccountSchema.safeParse(account({ownerName:undefined})).success,false);
});

test('mobile and desktop UI block invalid SMS, format phone, submit canonical number without providers',async()=>{
 const {chromium,expect}=await import('@playwright/test');
 const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './app/setup/SetupAccountClient.tsx';createRoot(document.getElementById('root')).render(React.createElement(Client));",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'local-ui',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/link'?"import React from 'react';export default function Link({href,children,...p}){return React.createElement('a',{href,...p},children);}":"export function useRouter(){return {replace:url=>window.__redirect=url,refresh:()=>{}};}",loader:'js',resolveDir:process.cwd()}));
 }}]});
 const css=readFileSync('app/globals.css','utf8').replace(/@import[^;]+;/g,'')+'\n:root{--font-geist-sans:Arial;}';
 const instance=await chromium.launch({headless:true});
 try{for(const width of [375,1280]){
 const f=managementBillingHarness(),external=[];let apiCalls=0;
 const page=await instance.newPage({viewport:{width,height:900}});page.setDefaultTimeout(15000);
 await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin!=='https://example.test'){external.push(url.origin);return route.abort();}
 if(url.pathname==='/api/setup'){
 apiCalls++;const submitted=JSON.parse(request.postData());assert.equal(submitted.contactPhone,'+13125551234');assert.equal(submitted.smsConsent,true);
 assert.equal(submitted.email,'manager@example.test');assert.equal(Object.hasOwn(submitted,'managerEmail'),false);
 const response=await f.load('app/api/setup/route.ts').POST(f.request(submitted));return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }
 return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'});
 });
 await page.goto('https://example.test/setup');
 await page.getByLabel('Business Name',{exact:true}).fill('Test Property');await page.getByLabel('Your name',{exact:true}).fill('Test Manager');
 await page.getByLabel('Email',{exact:true}).fill('manager@example.test');
 await page.getByLabel('Password',{exact:true}).fill('Abcdef12');await page.getByLabel('Confirm password',{exact:true}).fill('Abcdef12');
 await page.locator('input[name="acceptedTerms"]').check();await page.locator('input[name="smsConsent"]').check();
 await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('#registration-phone-error')).toHaveText(phone.REGISTRATION_SMS_PHONE_REQUIRED);assert.equal(apiCalls,0);
 const input=page.locator('#contactPhone');await expect(input).toHaveAttribute('aria-invalid','true');
 await input.fill('312555123');await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('#registration-phone-error')).toHaveText(phone.REGISTRATION_SMS_PHONE_REQUIRED);assert.equal(apiCalls,0);
 await page.locator('input[name="smsConsent"]').uncheck();await input.fill('');await expect(page.locator('#registration-phone-error')).toHaveCount(0);assert.equal(await input.evaluate(el=>el.required),false);
 await input.fill('+1 (312) 555-1234');await expect(input).toHaveValue('312-555-1234');await page.locator('input[name="smsConsent"]').check();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 assert.deepEqual(await page.evaluate(()=>{const card=document.querySelector('.rfl-registration-card').getBoundingClientRect();return [...document.querySelectorAll('.rfl-field input,.rfl-field select')].flatMap(el=>{const r=el.getBoundingClientRect();return r.left>=card.left && r.right<=card.right ? [] : [{id:el.id,left:r.left,right:r.right,cardLeft:card.left,cardRight:card.right}];});}),[]);
 for(const selector of ['#contactPhone','#registration-password-rules','#confirmPassword'])await expect(page.locator(selector)).toBeVisible();
 await page.screenshot({path:`../registration-ui-evidence/registration-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Continue',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__redirect)).toBe('/setup/recurring/tiers');
 assert.equal(apiCalls,1);assert.equal(f.state().businesses[0].contactPhone,'+13125551234');assert.equal(f.state().businesses[0].smsConsentPhone,'+13125551234');assert.deepEqual(external,[]);await page.close();
 }}finally{await instance.close();}
});
