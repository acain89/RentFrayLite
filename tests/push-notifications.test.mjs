import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {authHarness,postgres} from './helpers/auth-harness.mjs';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const fixtureCurve=require('node:crypto').createECDH('prime256v1');fixtureCurve.generateKeys();const fixturePublicKey=fixtureCurve.getPublicKey().toString('base64url');
function loader(db,send=async()=>{},env={VAPID_PUBLIC_KEY:'fixture',VAPID_PRIVATE_KEY:'fixture',VAPID_SUBJECT:'mailto:test@example.test'}){
 const cache=new Map(),mocks={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db},'web-push':{sendNotification:send},'@prisma/client':require('@prisma/client')};
 const load=p=>{if(cache.has(p))return cache.get(p);const filename=path.join(root,p),text=ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const mod={exports:{}};vm.runInThisContext('(function(require,module,exports,process){'+text+'})',{filename})(n=>Object.hasOwn(mocks,n)?mocks[n]:n.startsWith('@/lib/')?load(n.slice(2)+'.ts'):(()=>{throw Error('Unexpected import '+n);})(),mod,mod.exports,{env});cache.set(p,mod.exports);return mod.exports;};return load;
}
function fixture(){
 const now=new Date(),state={pushEvent:[],pushDelivery:[],managerPushSubscription:[],payment:[],session:[]};let seq=0;
 const clone=structuredClone;
 const match=(row,w={})=>Object.entries(w).every(([k,v])=>k==='OR'?v.some(x=>match(row,x)):k==='AND'?v.every(x=>match(row,x)):v&&typeof v==='object'&&!(v instanceof Date)?Object.entries(v).every(([op,x])=>op==='lt'?row[k]<x:op==='lte'?row[k]<=x:op==='gte'?row[k]>=x:op==='in'?x.includes(row[k]):false):v instanceof Date?row[k]?.getTime()===v.getTime():row[k]===v);
 const hydrate=(name,row,include)=>{if(!row)return null;const out=clone(row);if(name==='pushDelivery'&&include){out.event=hydrate('pushEvent',state.pushEvent.find(e=>e.id===row.eventId),{payment:true});out.subscription=clone(state.managerPushSubscription.find(s=>s.id===row.subscriptionId));}if(name==='pushEvent'&&include?.payment)out.payment=clone(state.payment.find(p=>p.id===row.paymentId));return out;};
 const db={$transaction:async fn=>fn(db)};
 for(const name of Object.keys(state))db[name]={findMany:async({where={},take=100,select}={})=>state[name].filter(x=>match(x,where)).slice(0,take).map(x=>select?Object.fromEntries(Object.keys(select).map(k=>[k,x[k]])):clone(x)),findUnique:async({where,include})=>hydrate(name,state[name].find(x=>match(x,where)),include),findUniqueOrThrow:async o=>{const row=await db[name].findUnique(o);assert.ok(row);return row;},upsert:async({where,create})=>{const row=state[name].find(x=>match(x,where));if(row)return clone(row);const fresh={createdAt:now,dispatchedAt:null,...clone(create)};state[name].push(fresh);return clone(fresh);},createMany:async({data})=>{for(const row of data){if(state[name].some(x=>x.eventId===row.eventId&&x.subscriptionId===row.subscriptionId))continue;state[name].push({id:'job'+(++seq),status:'QUEUED',attempts:0,nextAttemptAt:new Date(0),leaseUntil:null,...clone(row)});}return{count:data.length};},update:async({where,data})=>{const row=state[name].find(x=>match(x,where));assert.ok(row);Object.assign(row,clone(data));return clone(row);},updateMany:async({where,data})=>{const rows=state[name].filter(x=>match(x,where));for(const row of rows)for(const[k,v]of Object.entries(data))row[k]=v&&typeof v==='object'&&'increment'in v?row[k]+v.increment:clone(v);return{count:rows.length};}};
 const business={id:'business-a',isActive:true,status:'ACTIVE'},manager={id:'manager-a',isActive:true,businessId:business.id,business};
 state.session.push({id:'session-a',type:'MANAGER',managerId:manager.id,businessId:business.id,adminAccessId:null,expiresAt:new Date(Date.now()+3600000),business,manager});
 state.payment.push({id:'payment-a',businessId:business.id,paymentMethod:'ACH',status:'PENDING'});
 state.managerPushSubscription.push({id:'device-a',businessId:business.id,managerId:manager.id,sessionId:'session-a',createdAt:new Date(Date.now()-60000),updatedAt:now,active:true,endpoint:'https://fcm.googleapis.com/fcm/send/fixture',p256dh:'fixture',auth:'fixture'});
 return{db,state,payment:state.payment[0]};
}
test('only verified ACH processing/success transitions create deduplicated durable events',async()=>{
 const f=fixture(),load=loader(f.db),{queueAchPushEvent}=load('lib/pushNotifications.ts');
 await queueAchPushEvent(f.db,f.payment,'PENDING','evt_same');await queueAchPushEvent(f.db,f.payment,'PENDING','evt_same');assert.equal(f.state.pushEvent.length,1);
 await queueAchPushEvent(f.db,f.payment,'PAID','evt_paid');await queueAchPushEvent(f.db,f.payment,'FAILED','evt_failed');await queueAchPushEvent(f.db,{...f.payment,paymentMethod:'CARD'},'PAID','evt_card');assert.equal(f.state.pushEvent.length,2);
});
test('push delivers generic private payloads once, retries independently, and skips superseded states',async()=>{
 const f=fixture(),calls=[],load=loader(f.db,async(...args)=>calls.push(args));await load('lib/pushNotifications.ts').queueAchPushEvent(f.db,f.payment,'PENDING','evt');
 await load('lib/pushDelivery.ts').processPushQueue();await load('lib/pushDelivery.ts').processPushQueue();assert.equal(calls.length,1);assert.equal(f.state.pushDelivery[0].status,'ACCEPTED');const payload=JSON.parse(calls[0][1]);assert.match(payload.body,/not a completed payment/);assert.equal(JSON.stringify(payload).includes(f.payment.id),false);assert.deepEqual(Object.keys(payload).sort(),['body','kind','tag']);
 f.payment.status='PAID';await load('lib/pushNotifications.ts').queueAchPushEvent(f.db,f.payment,'PAID','evt_paid');await load('lib/pushDelivery.ts').processPushQueue();assert.match(JSON.parse(calls[1][1]).body,/does not mean funds have reached/);
});
test('failures retry with bounded attempts and expired subscriptions are deactivated',async()=>{
 const f=fixture();let code=503;const load=loader(f.db,async()=>{throw{statusCode:code};});await load('lib/pushNotifications.ts').queueAchPushEvent(f.db,f.payment,'PENDING','evt');await load('lib/pushDelivery.ts').processPushQueue();assert.equal(f.state.pushDelivery[0].status,'QUEUED');assert.equal(f.state.pushDelivery[0].attempts,1);assert.ok(f.state.pushDelivery[0].nextAttemptAt>Date.now());
 f.state.pushDelivery[0].nextAttemptAt=new Date(0);code=410;await load('lib/pushDelivery.ts').processPushQueue();assert.equal(f.state.pushDelivery[0].status,'FAILED');assert.equal(f.state.managerPushSubscription[0].active,false);assert.equal(f.payment.status,'PENDING');
});
test('revoked sessions, other businesses, stale events and absent subscribers cannot receive alerts',async()=>{
 for(const mode of ['revoked','other','stale','none','superseded','late-enrollment']){
  const f=fixture();let sends=0;const load=loader(f.db,async()=>sends++);await load('lib/pushNotifications.ts').queueAchPushEvent(f.db,f.payment,'PENDING','evt');
  if(mode==='revoked')f.state.session=[];if(mode==='other')f.state.managerPushSubscription[0].businessId='business-b';if(mode==='stale')f.state.pushEvent[0].expiresAt=new Date(0);if(mode==='none')f.state.managerPushSubscription=[];if(mode==='superseded')f.payment.status='PAID';if(mode==='late-enrollment')f.state.managerPushSubscription[0].createdAt=new Date(Date.now()+1000);
  await load('lib/pushDelivery.ts').processPushQueue();assert.equal(sends,0,mode);assert.equal(f.state.pushEvent.length,1);
 }
});
test('subscription parser rejects arbitrary hosts, invalid keys and identity fields',()=>{
 const {parsePushSubscription}=loader({})('lib/pushSubscription.ts'),valid={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',keys:{p256dh:fixturePublicKey,auth:Buffer.alloc(16,9).toString('base64url')}};
 assert.ok(parsePushSubscription(valid));for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])assert.throws(()=>parsePushSubscription({...valid,endpoint}));assert.throws(()=>parsePushSubscription({...valid,businessId:'other'}));assert.throws(()=>parsePushSubscription({...valid,keys:{...valid.keys,auth:'bad'}}));
});
test('actual manager routes enforce authentication, origin and business/device isolation',async()=>{
 const h=await authHarness(postgres?'postgres':'isolated',undefined,{}, {NODE_ENV:'test',VAPID_PUBLIC_KEY:'A'.repeat(87),VAPID_PRIVATE_KEY:'synthetic',VAPID_SUBJECT:'mailto:test@example.test'}),route=h.load('app/api/manager/push/route.ts');
 const body={endpoint:'https://fcm.googleapis.com/fcm/send/fixture-'+h.managers[0].id,keys:{p256dh:fixturePublicKey,auth:Buffer.alloc(16,9).toString('base64url')}};
 const request=(origin='https://example.test',data=body)=>new Request('https://example.test/api/manager/push',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await route.POST(request())).status,401);await h.issue();assert.equal((await route.POST(request('https://foreign.test'))).status,403);assert.equal((await route.POST(request())).status,200);
 const saved=(await h.db.managerPushSubscription.findMany({where:{managerId:h.managers[0].id}}))[0];assert.equal(saved.businessId,h.businesses[0].id);assert.equal(saved.managerId,h.managers[0].id);assert.equal((await route.POST(request('https://example.test',{...body,businessId:h.businesses[1].id}))).status,400);
 await h.issue('MANAGER',1);assert.equal((await route.POST(request())).status,400);assert.equal((await h.db.managerPushSubscription.findMany({where:{managerId:h.managers[0].id}}))[0].businessId,h.businesses[0].id);
 await h.issue('MANAGER',0);assert.equal((await route.DELETE(request('https://example.test',{endpoint:body.endpoint}))).status,200);assert.equal((await h.db.managerPushSubscription.findMany({where:{managerId:h.managers[0].id}}))[0].active,false);
});

test('subscription renewal cannot release previously queued events and retries stop after five attempts',async()=>{
 const f=fixture(),load=loader(f.db,async()=>{throw{statusCode:503};});await load('lib/pushNotifications.ts').queueAchPushEvent(f.db,f.payment,'PENDING','evt');await load('lib/pushDelivery.ts').processPushQueue();
 f.state.managerPushSubscription[0].createdAt=new Date(Date.now()+1000);f.state.pushDelivery[0].nextAttemptAt=new Date(0);await load('lib/pushDelivery.ts').processPushQueue();assert.equal(f.state.pushDelivery[0].status,'SKIPPED');
 const other=fixture(),retry=loader(other.db,async()=>{throw{statusCode:503};});await retry('lib/pushNotifications.ts').queueAchPushEvent(other.db,other.payment,'PENDING','evt');for(let i=0;i<7;i++){if(other.state.pushDelivery[0])other.state.pushDelivery[0].nextAttemptAt=new Date(0);await retry('lib/pushDelivery.ts').processPushQueue();}assert.equal(other.state.pushDelivery[0].attempts,5);assert.equal(other.state.pushDelivery[0].status,'FAILED');assert.equal(other.payment.status,'PENDING');
});
test('concurrent workers claim one delivery and absent configuration leaves durable events untouched',async()=>{
 const f=fixture();let calls=0;const load=loader(f.db,async()=>{calls++;await Promise.resolve();});await load('lib/pushNotifications.ts').queueAchPushEvent(f.db,f.payment,'PENDING','evt');await Promise.all([load('lib/pushDelivery.ts').processPushQueue(),load('lib/pushDelivery.ts').processPushQueue()]);assert.equal(calls,1);assert.equal(f.state.pushDelivery.length,1);
 const blocked=fixture(),missing=loader(blocked.db,async()=>assert.fail('No provider operation allowed'),{});await missing('lib/pushNotifications.ts').queueAchPushEvent(blocked.db,blocked.payment,'PENDING','evt');await assert.rejects(missing('lib/pushDelivery.ts').processPushQueue());assert.equal(blocked.state.pushEvent[0].dispatchedAt,null);
});
test('service worker checks current session ownership and does not cache private pages or trust redirect payloads',async()=>{
 const listeners={},shown=[],opened=[];let authorized=false;const self={location:{origin:'https://rentfraylite.com'},skipWaiting:()=>{},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)},registration:{showNotification:async(...args)=>shown.push(args)},addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(readFileSync(path.join(root,'public/manager-sw.js'),'utf8'),{self,URL,fetch:async()=>({ok:true,json:async()=>({authorized})})});assert.equal(listeners.fetch,undefined);
 const push=async kind=>{let task;listeners.push({data:{json:()=>({kind,tag:'rfl-ach-'+ 'a'.repeat(64),body:'Untrusted banking details',url:'https://foreign.test'})},waitUntil:p=>task=p});await task;};
 await push('PENDING');assert.equal(shown.length,0);authorized=true;await push('PENDING');assert.match(shown[0][1].body,/not a completed payment/);await push('PAID');assert.match(shown[1][1].body,/does not mean funds have reached/);assert.ok(!JSON.stringify(shown).includes('Untrusted'));
 let click;listeners.notificationclick({notification:{close:()=>{}},waitUntil:p=>click=p});await click;assert.deepEqual(opened,['https://rentfraylite.com/manager/dashboard']);
 const manifest=loader({})('app/manifest.ts').default();assert.equal(manifest.start_url,'/manager/dashboard');assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
});
test('standards-based Web Push encrypts payload locally without contacting a provider',async()=>{
 const webPush=await import('web-push'),{createECDH,randomBytes}=await import('node:crypto');const receiver=createECDH('prime256v1');receiver.generateKeys();const keys=webPush.generateVAPIDKeys();
 const payload=JSON.stringify({kind:'PENDING',tag:'rfl-ach-'+ 'a'.repeat(64)});const request=webPush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},payload,{vapidDetails:{subject:'mailto:test@example.test',publicKey:keys.publicKey,privateKey:keys.privateKey},TTL:300});assert.equal(request.method,'POST');assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert.ok(!request.body.toString('utf8').includes('PENDING'));
});

test('disabling a device prevents an already queued retry from sending',async()=>{
 const f=fixture();let attempts=0;const load=loader(f.db,async()=>{attempts++;throw{statusCode:503};});await load('lib/pushNotifications.ts').queueAchPushEvent(f.db,f.payment,'PENDING','evt_disable');await load('lib/pushDelivery.ts').processPushQueue();assert.equal(attempts,1);assert.equal(f.state.pushDelivery[0].status,'QUEUED');f.state.managerPushSubscription[0].active=false;f.state.pushDelivery[0].nextAttemptAt=new Date(0);await load('lib/pushDelivery.ts').processPushQueue();assert.equal(attempts,1);assert.equal(f.state.pushDelivery[0].status,'SKIPPED');assert.equal(f.payment.status,'PENDING');
});
