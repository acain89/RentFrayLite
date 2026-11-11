// Run after a production build, with an independently provisioned disposable
// --rfl-test-db-config. No application credentials or .env files are loaded.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { chromium, expect } from '@playwright/test';

const configPath = process.argv.find(x => x.startsWith('--rfl-test-db-config='))?.split('=').slice(1).join('=');
assert.ok(configPath, 'Explicit disposable PostgreSQL configuration required');
const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
assert.equal(c.isolationVerified, true); assert.equal(c.host, '127.0.0.1');
assert.match(c.role, /^rfl_s5_[a-f0-9]{12}$/); assert.equal(c.database, c.role);
assert.equal(path.resolve(c.data), path.resolve(os.tmpdir(), path.basename(c.data)));
assert.match(path.basename(c.data), /^rfl-b1-pg-[a-f0-9]{32}$/);
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${c.role}:${c.password}@127.0.0.1:${c.port}/${c.database}` } } });
const [identity] = await db.$queryRawUnsafe("SELECT current_user AS username,current_database() AS database,current_setting('data_directory') AS directory,host(inet_server_addr()) AS address,inet_server_port() AS port");
assert.equal(identity.username, c.role); assert.equal(identity.database, c.database); assert.equal(identity.address, '127.0.0.1'); assert.equal(identity.port, c.port); assert.equal(path.resolve(identity.directory), path.resolve(c.data));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rfl-sms-browser-'));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const freePort = async () => { const s = net.createServer(), port = await listen(s); await new Promise(r => s.close(r)); return port; };
const account = id => ({ id, object: 'account', country: 'US', default_currency: 'usd', details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: 'active' }, requirements: { disabled_reason: null, currently_due: [], past_due: [] } });
const providerRequests = [];
const provider = http.createServer((req, res) => {
  providerRequests.push({ method: req.method, url: req.url }); fs.appendFileSync(scratch+'/provider.jsonl',JSON.stringify({method:req.method,url:req.url})+'\n'); res.setHeader('content-type', 'application/json');
  if (req.method !== 'GET') { res.statusCode = 500; res.end(JSON.stringify({ error: { message: 'Provider mutations forbidden' } })); return; }
  if (req.url.startsWith('/v1/payment_method_configurations')) res.end(JSON.stringify({ object: 'list', has_more: false, data: [{ id: 'pmc_fixture', active: true, application: null, is_default: true, livemode: true, card: { available: true }, us_bank_account: { available: true } }] }));
  else if (req.url.startsWith('/v1/account')) res.end(JSON.stringify(account(req.url.split('?')[0].split('/').at(-1) === 'account' ? 'acct_platform' : req.url.split('?')[0].split('/').at(-1))));
  else { res.statusCode = 500; res.end(JSON.stringify({ error: { message: 'Unexpected mock read' } })); }
});
const providerPort = await listen(provider), appPort = await freePort();
execFileSync('C:/Program Files/Git/usr/bin/openssl.exe', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', scratch+'/key.pem', '-out', scratch+'/cert.pem', '-subj', '/CN=127.0.0.1', '-days', '1'], { windowsHide: true, stdio: 'ignore' });
const proxy = https.createServer({ key: fs.readFileSync(scratch+'/key.pem'), cert: fs.readFileSync(scratch+'/cert.pem') }, (req, res) => {
  const upstream = http.request({ hostname: '127.0.0.1', port: appPort, path: req.url, method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${appPort}`, 'x-forwarded-proto': 'https', 'x-forwarded-host': `127.0.0.1:${proxy.address().port}` } }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  upstream.on('error', () => { res.statusCode=502; res.end(); }); req.pipe(upstream);
});
const proxyPort = await listen(proxy), origin = `https://127.0.0.1:${proxyPort}`;
// Redirect only Stripe's HTTP transport to a loopback mock. All other external
// sockets/fetches fail closed, including messaging and payment destinations.
fs.writeFileSync(scratch+'/guard.cjs', `const net=require('net'),http=require('http'),https=require('https');const ports=new Set(${JSON.stringify([c.port, providerPort, appPort, proxyPort])});const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,o=a[0],h=typeof o==='object'?o.host??o.hostname:a[1],p=typeof o==='object'?Number(o.port):Number(o);if(typeof h==='string'&&(!['127.0.0.1','localhost','::1'].includes(h)||Number.isFinite(p)&&!ports.has(p)))throw Error('External or unverified network blocked');return connect.apply(this,args)};const request=https.request;https.request=function(options,...args){if(options&&typeof options==='object'&&(options.hostname==='api.stripe.com'||options.host==='api.stripe.com')){const req=http.request({...options,hostname:'127.0.0.1',host:'127.0.0.1',port:${providerPort},protocol:'http:',agent:undefined},...args);req.on('socket',socket=>{if(socket.connecting)socket.once('connect',()=>socket.emit('secureConnect'));else queueMicrotask(()=>socket.emit('secureConnect'));});return req;}return request.call(this,options,...args)};const fetch=globalThis.fetch;globalThis.fetch=(input,opts)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','::1'].includes(u.hostname)||!ports.has(Number(u.port)))throw Error('External fetch blocked');return fetch(input,opts)};`);
const env = { ...c.env, NODE_ENV: 'production', NEXT_PUBLIC_BASE_URL: origin, DATABASE_URL: `postgresql://${c.role}:${c.password}@127.0.0.1:${c.port}/${c.database}`, STRIPE_SECRET_KEY: 'sk_live_local_fixture_no_network', NODE_OPTIONS: '--require '+scratch+'/guard.cjs' };
const log = fs.openSync(scratch+'/server.log', 'w');
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(appPort)], { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', log, log] });
let browser;
try {
  let ready=false; for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error('Application exited: '+fs.readFileSync(scratch+'/server.log','utf8'));try{const r=await fetch(`http://127.0.0.1:${appPort}/privacy`);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Application startup timeout');
  const suffix=randomUUID().replaceAll('-',''), token=randomBytes(32).toString('base64url');
  let business; for(let i=0;i<5;i++){try{business=await db.business.create({data:{name:'SMS isolated browser',ownerName:'Fixture',contactEmail:suffix+'@example.test',accountCode:'ZX-'+String(Math.floor(Math.random()*10000)).padStart(4,'0'),status:'ACTIVE',setupCompletedAt:new Date(),paymentSmsEnabled:false,stripeConnection:{create:{stripeAccountId:'acct_'+suffix,readyForLive:true}},recurringPlans:{create:{name:'Fixture Tier',baseAmountCents:10000,dueDay:1,gracePeriodDays:1}}},include:{recurringPlans:true}});break;}catch(e){if(e.code!=='P2002'||i===4)throw e;}}
  const manager=await db.manager.create({data:{businessId:business.id,displayName:'Fixture Manager',email:suffix+'@example.test',passwordHash:'unused-browser-fixture-hash'}});
  await db.session.create({data:{type:'MANAGER',managerId:manager.id,businessId:business.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(); page.setDefaultTimeout(15000);
  const create=async(method,consent,sourceType='CUSTOM_PAYMENT')=>page.evaluate(async({method,consent,sourceType,code,plan})=>{const response=await fetch('/api/public/checkout/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sourceType,accountCode:code,firstName:'Browser',lastName:'Fixture',unitNumber:'101',phone:'3125550100',paymentMethod:method,smsConsent:consent,...(sourceType==='CUSTOM_PAYMENT'?{amount:'123.45'}:{planId:plan})})});return{status:response.status,body:await response.json()};},{method,consent,sourceType,code:business.accountCode,plan:business.recurringPlans[0].id});
  await page.goto(origin+'/privacy');
  for(const [method,consent]of [['ACH',true],['CARD',true],['ACH',false]])await test(`real HTTPS server: Custom ${method} change preserves consent=${consent}`,async()=>{
    const created=await create(method,consent);assert.equal(created.status,201,JSON.stringify(created));
    const before=await db.checkoutSession.findUnique({where:{id:created.body.checkoutSession.id}});
    await page.goto(origin+created.body.reviewUrl);const old=page.url(),target=method==='ACH'?'Credit or debit card':'Bank account (ACH)';
    await page.getByRole('radio',{name:target,exact:true}).check();await page.waitForURL(u=>u.href!==old);await expect(page.getByRole('radio',{name:target,exact:true})).toBeChecked();
    const saved=await db.checkoutSession.findUnique({where:{id:new URL(page.url()).searchParams.get('session')}});
    assert.equal(saved.smsConsentAt?.getTime()??null,before.smsConsentAt?.getTime()??null);assert.equal(saved.smsConsentVersion,before.smsConsentVersion);assert.equal(saved.subtotalCents,before.subtotalCents);
    assert.equal(saved.platformFeeCents,method==='ACH'?700:395);
    const cookie=(await context.cookies()).find(x=>x.name==='rfl_checkout_'+createHash('sha256').update(saved.id).digest('hex').slice(0,24));assert.ok(cookie?.httpOnly&&cookie.secure);assert.equal(cookie.sameSite,'Lax');
  });
  for(const method of ['ACH','CARD'])await test(`real HTTPS server: standard ${method} selection keeps affirmative form consent`,async()=>{
    await page.goto(origin+'/'+business.accountCode);await page.getByRole('button',{name:/Fixture Tier/}).click();
    await page.getByLabel('First name',{exact:true}).fill('Browser');await page.getByLabel('Last name',{exact:true}).fill('Fixture');await page.getByLabel('Unit / space number').fill('101');await page.getByLabel('Mobile phone').fill('3125550100');
    await page.getByRole('checkbox').check();await page.getByRole('radio',{name:method==='ACH'?'Credit or debit card':'Bank account',exact:true}).check();await page.getByRole('radio',{name:method==='ACH'?'Bank account':'Credit or debit card',exact:true}).check();
    await page.getByRole('button',{name:'Review Payment',exact:true}).click();await page.waitForURL('**/review?session=*');
    const row=await db.checkoutSession.findUnique({where:{id:new URL(page.url()).searchParams.get('session')}});assert.equal(row.paymentMethod,method);assert.ok(row.smsConsentAt);assert.equal(row.smsConsentVersion,'rfl-payment-sms-2026-10-v1');
  });
  await context.addCookies([{name:'rfl_session',value:token,url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
  await test('real HTTPS reverse proxy: management ON/OFF persists',async()=>{
    await page.goto(origin+'/manager/settings');await page.getByRole('checkbox',{name:'OFF',exact:true}).check();await page.getByLabel('Management mobile phone').fill('3125550100');await page.getByRole('checkbox',{name:/I am authorized/}).check();
    await page.getByRole('button',{name:'Save SMS preference'}).click();await expect(page.getByRole('status')).toContainText('SMS preference saved');assert.equal((await db.business.findUnique({where:{id:business.id}})).paymentSmsEnabled,true);
    await page.getByRole('checkbox',{name:'ON',exact:true}).uncheck();const response=page.waitForResponse(r=>r.url().endsWith('/api/manager/sms')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save SMS preference'}).click();assert.equal((await response).status(),200);assert.equal((await db.business.findUnique({where:{id:business.id}})).paymentSmsEnabled,false);
  });
  await test('real HTTPS server: cross-origin and forwarded-header spoofing rejected',async()=>{
    for(const headers of [{origin:'https://attacker.test'},{origin:'https://attacker.test','x-forwarded-host':'attacker.test','x-forwarded-proto':'https'}]){const r=await context.request.post(origin+'/api/manager/sms',{headers,data:{enabled:true,phone:'3125550100',consent:true}});assert.equal(r.status(),403);}
  });
  await test('real HTTPS server: anonymous management update rejected',async()=>{await context.clearCookies();const r=await context.request.post(origin+'/api/manager/sms',{headers:{origin},data:{enabled:true,phone:'3125550100',consent:true}});assert.equal(r.status(),401);});
  await test('isolated server made only mock-provider reads, with no payments or SMS sends',async()=>{
    assert.ok(providerRequests.length>0);assert.ok(providerRequests.every(r=>r.method==='GET'));
    assert.equal(await db.payment.count({where:{businessId:business.id}}),0);
    assert.equal(await db.smsNotification.count({where:{payment:{businessId:business.id}}}),0);
  });
  console.log('Only local mock provider reads; no payment or messaging sends. Server evidence: '+scratch);
}finally{await browser?.close();app.kill();await new Promise(r=>app.exitCode!==null?r():app.once('exit',r));fs.closeSync(log);proxy.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>provider.close(r))]);await db.$disconnect();}
