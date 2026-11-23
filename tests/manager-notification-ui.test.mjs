import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {authHarness} from './helpers/auth-harness.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
let browser,code,css,settingsHtml;
const out=process.env.RFL_SCREENSHOT_DIR??path.join(os.tmpdir(),'rfl-notification-ui');
before(async()=>{
 mkdirSync(out,{recursive:true});
 const h=await authHarness('isolated');await h.issue();h.mocks['@/components/ManagerPushControls']={__esModule:true,default:()=>React.createElement('div',{id:'notification-controls-root'})};h.mocks['next/link']={__esModule:true,default:props=>React.createElement('a',props,props.children)};settingsHtml=renderToStaticMarkup(await h.load('app/manager/settings/page.tsx').default());
 const bundle=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import Controls from './components/ManagerPushControls';import Sync from './components/ManagerPushSessionSync';const settings=document.getElementById('notification-controls-root');createRoot(settings??document.getElementById('root')).render(settings?<Controls/>:<><Sync/><h1>Dashboard fixture</h1></>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'mock-next-link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'next/link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"import React from 'react';export default function Link(p){return React.createElement('a',p,p.children);}",loader:'js',resolveDir:process.cwd()}));}}]});
 code=bundle.outputFiles[0].text;css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:path.resolve('app/globals.css')})).css+'\n:root{--font-geist-sans:Arial;--font-geist-mono:monospace;}';
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();});
async function fixture({permission='default',active=false,serverActive=active,unsupported=false,expired=false,width=375}={}){
 const context=await browser.newContext({viewport:{width,height:950}}),state={active:serverActive,auth:true,owner:true,session:1,bound:1,verifyFailure:false,deleteFailure:false,history:[],calls:[],errors:[]};
 await context.addInitScript(({permission,active,unsupported,expired})=>{
  const saved=JSON.parse(localStorage.getItem('fixture-device')||'null');const device=window.__device={permission:saved?.permission??permission,active:saved?.active??active,expired,unsubscribeFailure:false};
  const save=()=>localStorage.setItem('fixture-device',JSON.stringify({permission:device.permission,active:device.active}));
  const changes=new EventTarget();window.__changePermission=value=>{device.permission=value;save();changes.dispatchEvent(new Event('change'));};
  Object.defineProperty(window,'Notification',{configurable:true,value:class{static get permission(){return device.permission;}static async requestPermission(){device.permission=device.nextPermission??'granted';save();return device.permission;}}});
  if(unsupported)delete window.PushManager;else Object.defineProperty(window,'PushManager',{configurable:true,value:class{}});
  const subscription=()=>({endpoint:'https://fcm.googleapis.com/fcm/send/browser-fixture',expirationTime:device.expired?Date.now()-1000:null,toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/browser-fixture',expirationTime:null,keys:{p256dh:'synthetic',auth:'synthetic'}}),unsubscribe:async()=>{if(device.unsubscribeFailure)return false;device.active=false;device.expired=false;save();return true;}});
  const registration={pushManager:{getSubscription:async()=>device.active?subscription():null,subscribe:async()=>{device.active=true;device.expired=false;save();return subscription();}}};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>registration,register:async()=>registration,ready:Promise.resolve(registration)}});
  Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>changes}});
 },{permission,active,unsupported,expired});
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());if(u.origin!=='https://example.test')throw Error('External browser request prohibited');
  if(u.pathname==='/api/manager/push'){
   state.calls.push({method:request.method(),history:u.searchParams.has('history')});
   if(!state.auth)return route.fulfill({status:401,json:{error:'Authentication required.'}});
   if(request.method()==='GET')return route.fulfill({json:{publicKey:'B'.repeat(87),history:state.history}});
   assert.equal(new URL(request.url()).origin,'https://example.test');
   if(request.method()==='PATCH'){if(state.verifyFailure)return route.fulfill({status:503,json:{error:'Unavailable'}});if(state.active&&state.owner)state.bound=state.session;return route.fulfill({json:{enabled:state.active&&state.owner}});}
   if(request.method()==='POST'){if(!state.owner)return route.fulfill({status:400,json:{error:'Unavailable'}});state.active=true;state.bound=state.session;return route.fulfill({json:{saved:true}});}
   if(request.method()==='DELETE'){if(state.deleteFailure)return route.fulfill({status:503,json:{error:'Unavailable'}});state.active=false;return route.fulfill({json:{saved:true}});}
  }
  return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style>'+(u.pathname.includes('dashboard')?'<div id="root"></div>':settingsHtml)+'<script>'+code.replaceAll('</script','<\\/script')+'</script>'});
 });
 const page=await context.newPage();page.on('pageerror',e=>state.errors.push(e.message));page.setDefaultTimeout(15000);await page.goto('https://example.test/manager/settings');
 const open=async()=>{await page.locator('summary').click();};
 return{page,state,open,close:async()=>{assert.deepEqual(state.errors,[]);await context.close();}};
}
for(const width of [320,375,1440])test('collapsed native Settings section, lazy history and accessible layout at '+width,async()=>{
 const f=await fixture({width});try{
  await expect(f.page.locator('details')).not.toHaveAttribute('open','');assert.equal(f.state.calls.length,0);await f.page.locator('summary').focus();await f.page.keyboard.press('Enter');await expect(f.page.getByRole('button',{name:'Enable Notifications',exact:true})).toBeEnabled();await expect(f.page.getByText('No notifications yet.',{exact:true})).toBeVisible();assert.equal(f.state.calls.filter(c=>c.history).length,1);
  await expect(f.page.getByText('Notifications are off for this device.',{exact:true})).toBeVisible();assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await f.page.keyboard.press('Tab');assert.equal(await f.page.getByRole('button',{name:'Enable Notifications'}).evaluate(e=>getComputedStyle(e).outlineStyle),'solid');await f.page.screenshot({path:path.join(out,'settings-notifications-'+width+'.png'),fullPage:true});
  await f.page.locator('summary').click();await f.open();assert.equal(f.state.calls.filter(c=>c.history).length,1);const calls=f.state.calls.length;await f.page.waitForTimeout(100);assert.equal(f.state.calls.length,calls);
 }finally{await f.close();}
});
test('enable, refresh, logout/login reconnection and disable persist from actual device/server state',async()=>{
 const f=await fixture();try{
  await f.open();await f.page.getByRole('button',{name:'Enable Notifications',exact:true}).click();await expect(f.page.getByText('Notifications are on for this device.',{exact:true})).toBeVisible();assert.equal(f.state.active,true);
  await f.page.reload();await f.open();await expect(f.page.getByRole('button',{name:'Disable Notifications',exact:true})).toBeEnabled();assert.equal(await f.page.getByText(/Refresh notifications/i).count(),0);
  f.state.auth=false;await f.page.goto('https://example.test/manager/dashboard');f.state.auth=true;f.state.session++;await f.page.reload();await expect.poll(()=>f.state.bound).toBe(f.state.session);assert.equal(await f.page.getByText('Notifications',{exact:true}).count(),0);
  await f.page.goto('https://example.test/manager/settings');await f.open();await f.page.getByRole('button',{name:'Disable Notifications',exact:true}).click();await expect(f.page.getByText('Notifications are off for this device.',{exact:true})).toBeVisible();assert.equal(f.state.active,false);assert.equal(await f.page.evaluate(()=>window.__device.active),false);
  f.state.session++;await f.page.reload();await f.open();await expect(f.page.getByRole('button',{name:'Enable Notifications',exact:true})).toBeEnabled();assert.equal(f.state.active,false);
 }finally{await f.close();}
});
test('permission alone never means enabled; browser changes and unsupported browsers are clear',async()=>{
 for(const options of [{permission:'granted'},{permission:'denied'},{unsupported:true}]){
  const f=await fixture(options);try{await f.open();if(options.unsupported){await expect(f.page.getByText(/Notifications aren't supported/)).toBeVisible();assert.equal(await f.page.getByRole('button',{name:'Enable Notifications'}).count(),0);}else if(options.permission==='denied'){await expect(f.page.getByText('Notifications are blocked in your browser settings.',{exact:true})).toBeVisible();await expect(f.page.getByRole('button',{name:'Enable Notifications'})).toBeDisabled();}else{await expect(f.page.getByText('Notifications are off for this device.',{exact:true})).toBeVisible();await f.page.evaluate(()=>window.__changePermission('denied'));await expect(f.page.getByText('Notifications are blocked in your browser settings.',{exact:true})).toBeVisible();}assert.equal(await f.page.getByText('Notifications are on for this device.',{exact:true}).count(),0);}finally{await f.close();}
 }
});
test('denying the enable prompt does not enroll a device and later permission changes are rechecked',async()=>{
 const f=await fixture();try{await f.open();await f.page.evaluate(()=>window.__device.nextPermission='denied');await f.page.getByRole('button',{name:'Enable Notifications'}).click();await expect(f.page.getByText('Notifications are blocked in your browser settings.',{exact:true})).toBeVisible();assert.equal(f.state.active,false);assert.equal(f.state.calls.filter(c=>c.method==='POST').length,0);await f.page.evaluate(()=>{window.__device.nextPermission='granted';window.__changePermission('granted');});await expect(f.page.getByText('Notifications are off for this device.',{exact:true})).toBeVisible();await f.page.getByRole('button',{name:'Enable Notifications'}).click();await expect(f.page.getByText('Notifications are on for this device.',{exact:true})).toBeVisible();await f.page.evaluate(()=>window.__changePermission('denied'));await expect(f.page.getByText('Notifications are blocked in your browser settings.',{exact:true})).toBeVisible();await f.page.evaluate(()=>window.__changePermission('granted'));await expect(f.page.getByText('Notifications are on for this device.',{exact:true})).toBeVisible();}finally{await f.close();}
});
test('expired subscription requires explicit enable and disabled server preference is never auto-enabled',async()=>{
 for(const options of [{permission:'granted',active:true,expired:true},{permission:'granted',active:true,serverActive:false}]){
  const f=await fixture(options);try{await f.open();await expect(f.page.getByText('Notifications are off for this device.',{exact:true})).toBeVisible();assert.equal(f.state.calls.filter(c=>c.method==='POST').length,0);await f.page.getByRole('button',{name:'Enable Notifications'}).click();await expect(f.page.getByText('Notifications are on for this device.',{exact:true})).toBeVisible();}finally{await f.close();}
 }
});
test('verification, owner mismatch and disable failures do not falsely report success',async()=>{
 const f=await fixture({permission:'granted',active:true});try{
  f.state.verifyFailure=true;await f.open();await expect(f.page.getByText('Notification status is unavailable.',{exact:true})).toBeVisible();assert.equal(await f.page.getByText('Notifications are on for this device.',{exact:true}).count(),0);f.state.verifyFailure=false;await f.page.locator('summary').click();await f.open();await expect(f.page.getByRole('button',{name:'Disable Notifications'})).toBeEnabled();
  f.state.deleteFailure=true;await f.page.getByRole('button',{name:'Disable Notifications'}).click();await expect(f.page.getByRole('alert')).toContainText("Couldn't turn notifications off");assert.equal(f.state.active,true);f.state.deleteFailure=false;await f.page.evaluate(()=>window.__device.unsubscribeFailure=true);await f.page.getByRole('button',{name:'Disable Notifications'}).click();await expect(f.page.getByRole('alert')).toContainText('Notifications are off');assert.equal(f.state.active,false);await f.page.evaluate(()=>window.__device.unsubscribeFailure=false);await f.page.getByRole('button',{name:'Disable Notifications'}).click();await expect(f.page.getByText('Notifications are off for this device.',{exact:true})).toBeVisible();
 }finally{await f.close();}
 const other=await fixture({permission:'granted',active:true});try{other.state.owner=false;await other.open();await expect(other.page.getByText('Notifications are off for this device.',{exact:true})).toBeVisible();await other.page.getByRole('button',{name:'Enable Notifications'}).click();await expect(other.page.getByRole('alert')).toContainText("Couldn't enable");assert.equal(await other.page.getByText('Notifications are on for this device.',{exact:true}).count(),0);}finally{await other.close();}
});
test('dashboard has no notification panel and Settings keeps its existing links',()=>{
 const dashboard=readFileSync('app/manager/dashboard/ManagerDashboardClient.tsx','utf8'),page=readFileSync('app/manager/dashboard/page.tsx','utf8'),settings=readFileSync('app/manager/settings/page.tsx','utf8');assert.doesNotMatch(dashboard,/ManagerPushControls|notificationHistory/);assert.doesNotMatch(page,/ManagerPushHistory/);assert.ok(settings.indexOf('<ManagerPushControls />')>settings.indexOf('/manager/settings/security'));for(const link of ['banking','tiers','charges','billing','security'])assert.ok(settings.includes('/manager/settings/'+link));assert.ok(settings.includes('/manager/dashboard'));
});
