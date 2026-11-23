import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {authHarness} from './helpers/auth-harness.mjs';
const curve=createECDH('prime256v1');curve.generateKeys();
const body={endpoint:'https://fcm.googleapis.com/fcm/send/notification-preference-fixture',keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
const request=(method='PATCH',data=body,origin='https://example.test')=>new Request('https://example.test/api/manager/push',{method,headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
async function fixture(){const h=await authHarness('isolated',undefined,{}, {VAPID_PUBLIC_KEY:'A'.repeat(87),VAPID_PRIVATE_KEY:'synthetic',VAPID_SUBJECT:'mailto:fixture@example.test'});return {...h,route:h.load('app/api/manager/push/route.ts')};}
test('status verification requires authentication, same origin and valid subscription keys',async()=>{
 const h=await fixture();assert.equal((await h.route.PATCH(request())).status,401);await h.issue();assert.equal((await h.route.PATCH(request('PATCH',body,'https://foreign.test'))).status,403);assert.equal((await h.route.PATCH(request('PATCH',{...body,managerId:h.managers[1].id}))).status,400);assert.equal((await h.route.PATCH(request('PATCH',{endpoint:'http://127.0.0.1/private'}))).status,400);assert.deepEqual(await (await h.route.PATCH(request())).json(),{enabled:false});
});
test('enabled device survives refresh and safely rebinds after logout/login without enrollment',async()=>{
 const h=await fixture();await h.issue();assert.equal((await h.route.POST(request('POST'))).status,200);let [sub]=await h.db.managerPushSubscription.findMany();const enrolled=sub.createdAt,oldSession=sub.sessionId;
 assert.deepEqual(await (await h.route.PATCH(request())).json(),{enabled:true});[sub]=await h.db.managerPushSubscription.findMany();assert.equal(sub.createdAt.getTime(),enrolled.getTime());
 const oldToken=h.token();const logout=await h.load('app/api/auth/logout/route.ts').POST(new Request('https://example.test/api/auth/logout',{method:'POST',headers:{origin:'https://example.test'}}));assert.equal(logout.status,200);h.use(oldToken);assert.equal((await h.route.PATCH(request())).status,401);
 await h.issue();assert.deepEqual(await (await h.route.PATCH(request())).json(),{enabled:true});[sub]=await h.db.managerPushSubscription.findMany();assert.notEqual(sub.sessionId,oldSession);assert.ok(sub.createdAt>=enrolled);assert.equal(sub.managerId,h.managers[0].id);assert.equal((await h.db.managerPushSubscription.findMany()).length,1);
});
test('disabled preference persists across refresh and subsequent login; verification cannot re-enable it',async()=>{
 const h=await fixture();await h.issue();await h.route.POST(request('POST'));await h.route.DELETE(request('DELETE',{endpoint:body.endpoint}));assert.deepEqual(await (await h.route.PATCH(request())).json(),{enabled:false});await h.issue();assert.deepEqual(await (await h.route.PATCH(request())).json(),{enabled:false});assert.equal((await h.db.managerPushSubscription.findMany())[0].active,false);
});
test('another business or changed encryption keys cannot claim an existing endpoint',async()=>{
 const h=await fixture();await h.issue();await h.route.POST(request('POST'));const [original]=await h.db.managerPushSubscription.findMany();await h.issue('MANAGER',1);assert.deepEqual(await (await h.route.PATCH(request())).json(),{enabled:false});assert.equal((await h.route.POST(request('POST'))).status,400);assert.equal((await h.route.DELETE(request('DELETE',{endpoint:body.endpoint}))).status,400);assert.deepEqual((await h.db.managerPushSubscription.findMany())[0],original);await h.issue();assert.deepEqual(await (await h.route.PATCH(request('PATCH',{...body,keys:{...body.keys,auth:randomBytes(16).toString('base64url')}}))).json(),{enabled:false});
});
test('history is requested only explicitly and stays scoped to the authenticated business',async()=>{
 const h=await fixture();await h.issue();let queries=0;h.db.pushEvent={findMany:async args=>{queries++;assert.equal(args.where.businessId,h.businesses[0].id);assert.equal(args.take,20);return [{id:'synthetic-event',kind:'PAID',createdAt:new Date('2026-11-22T12:00:00Z')}];}};
 const ordinary=await h.route.GET(new Request('https://example.test/api/manager/push'));assert.equal(ordinary.status,200);assert.equal(queries,0);assert.equal((await ordinary.json()).history,undefined);
 const response=await h.route.GET(new Request('https://example.test/api/manager/push?history=1'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.deepEqual((await response.json()).history,[{id:'synthetic-event',kind:'PAID',createdAt:'2026-11-22T12:00:00.000Z'}]);assert.equal(queries,1);
 h.db.pushEvent.findMany=async()=>{throw Error('private storage failure');};const failed=await h.route.GET(new Request('https://example.test/api/manager/push?history=1'));assert.equal((await failed.json()).history,null);
});

test('history is withheld if the authenticated session changes during its query',async()=>{
 const h=await fixture();await h.issue();h.db.pushEvent={findMany:async()=>{await h.issue('MANAGER',1);return[{id:'private-event',kind:'PAID',createdAt:new Date()}];}};const response=await h.route.GET(new Request('https://example.test/api/manager/push?history=1'));assert.equal(response.status,401);assert.equal((await response.json()).history,undefined);
});
