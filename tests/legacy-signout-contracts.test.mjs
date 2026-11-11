import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {assertLegacyFinancialSource,assertLegacyMigrationHashes,readLegacyMigrationHashes,legacySourceDigest} from './helpers/legacy-financial-guard.mjs';
import {authHarness,postgres} from './helpers/auth-harness.mjs';
import {reportingSignOut,assertReportingSignOutDestroyed} from './helpers/reporting-harness.mjs';

const baseline='223b6f853bf94475f30ca76a73ab85404307fd7c',schemaFile='prisma/schema.prisma';
const files=[schemaFile,'lib/auth.ts','lib/session.ts','lib/sessionAuthority.ts','lib/passwordRecovery.ts','lib/smsConsent.ts','lib/smsDelivery.ts','lib/smsNotifications.ts','lib/platformFees.ts','lib/rflDirectPricing.ts','lib/checkoutRetry.ts','lib/checkoutLifecycle.ts','lib/checkoutPricing.ts','lib/stripe.ts','lib/stripePaymentWebhook.ts','app/api/setup/route.ts','app/api/public/checkout/session/route.ts','app/api/public/checkout/start/route.ts'];
const sources=Object.fromEntries(files.map(f=>[f,readFileSync(f,'utf8').replaceAll('\r\n','\n')]));
const originals=Object.fromEntries(files.map(f=>[f,execFileSync('git',['show',baseline+':'+f],{encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n')]));
const schema=sources[schemaFile],refund=schema.slice(schema.indexOf('model CustomerRefundObservation {'),schema.indexOf('\n}\n',schema.indexOf('model CustomerRefundObservation {'))+3);
function once(text,before,after){assert.equal(text.split(before).length-1,1,'Mutation must reach exactly one intended section');return text.replace(before,after);}
test('exact approved refund additions pass without changing the historical schema remainder',()=>{
 assertLegacyFinancialSource(schemaFile,schema,originals[schemaFile]);
 assertLegacyFinancialSource(schemaFile,schema.replaceAll('\n','\r\n'),originals[schemaFile]);
});
test('every protected financial/security source matches its complete approved baseline',()=>{
 for(const file of files.filter(f=>f!==schemaFile))assertLegacyFinancialSource(file,sources[file],originals[file]);
});
test('all 24 source migrations and migration lock retain their exact approved contents',()=>assertLegacyMigrationHashes(readLegacyMigrationHashes()));

for(const [name,before,after] of [
 ['nullable refund amount','amountCents Int','amountCents Int?'],
 ['changed refund currency','currency String','currency Int'],
 ['missing refund account','  stripeAccountId String\n',''],
 ['changed payment foreign key','references: [id]','references: [businessId]'],
 ['cascading history deletion','onDelete: Restrict','onDelete: Cascade'],
 ['missing refund foreign key','  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Restrict)\n',''],
 ['missing refund scope dimension','stripePlatformAccountId, stripeAccountId, stripeMode, stripeRefundId','stripePlatformAccountId, stripeMode, stripeRefundId'],
 ['missing refund unique constraint','  @@unique([stripePlatformAccountId, stripeAccountId, stripeMode, stripeRefundId], map: "CustomerRefund_scope_identity_key")\n',''],
 ['renamed unique constraint','CustomerRefund_scope_identity_key','unapproved_identity_key'],
 ['missing refund status index','  @@index([paymentId, status])\n',''],
 ['missing observation timestamp','  observedAt DateTime @default(now())\n',''],
 ['changed update timestamp','@updatedAt','@default(now())'],
])test('historical guard rejects '+name,()=>assert.throws(()=>assertLegacyFinancialSource(schemaFile,once(schema,refund,once(refund,before,after)),originals[schemaFile])));
for(const [name,mutate] of [
 ['missing refund model',s=>once(s,refund,'')],
 ['duplicate refund model',s=>s+'\n'+refund],
 ['missing payment refund relation',s=>once(s,'  customerRefunds CustomerRefundObservation[]\n','')],
 ['changed immutable snapshot',s=>once(s,'lineItemsSnapshot     Json','lineItemsSnapshot     String')],
 ['changed original amount',s=>once(s,'subtotalCents         Int','subtotalCents         Int?')],
 ['changed payment history constraint',s=>once(s,'  @@index([businessId, billingCycle])\n','')],
 ['unexpected schema addition',s=>s+'\nmodel UnauthorizedFinancialRecord { id String @id }\n'],
])test('historical guard rejects '+name,()=>assert.throws(()=>assertLegacyFinancialSource(schemaFile,mutate(schema),originals[schemaFile])));
for(const file of files.filter(f=>f!==schemaFile))test('historical guard rejects unexpected protected source change: '+file,()=>{
 assert.throws(()=>assertLegacyFinancialSource(file,sources[file]+'\n// unauthorized source change\n',originals[file]));
});
const migrations=readLegacyMigrationHashes(),refundMigration='prisma/migrations/20261105010000_customer_refund_observation/migration.sql',firstMigration=Object.keys(migrations).find(f=>f.endsWith('/migration.sql')&&f!==refundMigration);
for(const [name,mutate] of [
 ['missing old migration',m=>{delete m[firstMigration];}],
 ['missing refund migration',m=>{delete m[refundMigration];}],
 ['changed old migration',m=>{m[firstMigration]='0'.repeat(64);}],
 ['changed refund migration',m=>{m[refundMigration]='0'.repeat(64);}],
 ['unexpected migration',m=>{m['prisma/migrations/20990101000000_unapproved/migration.sql']='0'.repeat(64);}],
 ['missing migration lock',m=>{delete m['prisma/migrations/migration_lock.toml'];}],
])test('historical guard rejects '+name,()=>{const changed={...migrations};mutate(changed);assert.throws(()=>assertLegacyMigrationHashes(changed));});
for(const needle of ['CREATE UNIQUE INDEX','CREATE INDEX','ON DELETE RESTRICT'])test('migration guard rejects removed '+needle,()=>{
 const sql=readFileSync(refundMigration,'utf8');assert.ok(sql.includes(needle));
 assert.throws(()=>assertLegacyMigrationHashes({...migrations,[refundMigration]:legacySourceDigest(sql.replace(needle,'-- removed protected clause'))}));
});

const browserRequest=(origin,headers,body=null,method='POST')=>({url:()=>origin+'/api/auth/logout',method:()=>method,allHeaders:async()=>headers,postDataBuffer:()=>body});
test('reporting sign-out adapter preserves actual method, Origin, Cookie, headers and body',async()=>{
 let captured;const f={load:()=>({POST:r=>{captured=r;return Response.json({success:true});}})},body=Buffer.from('{}');
 await reportingSignOut(f,browserRequest('https://example.test',{origin:'https://example.test',cookie:'rfl_session=synthetic','x-contract':'retained'},body));
 assert.equal(captured.method,'POST');assert.equal(captured.url,'https://example.test/api/auth/logout');assert.equal(captured.headers.get('origin'),'https://example.test');assert.equal(captured.headers.get('cookie'),'rfl_session=synthetic');assert.equal(captured.headers.get('x-contract'),'retained');assert.equal(await captured.text(),'{}');
});
test('reporting adapter cannot dispatch another HTTP method through POST',async()=>{
 await assert.rejects(()=>reportingSignOut({load:()=>{assert.fail('Handler must not be reached');}},browserRequest('https://example.test',{},null,'GET')));
});
test('successful-looking HTTP response cannot substitute for durable session destruction',async()=>{
 await assert.rejects(()=>assertReportingSignOutDestroyed(Response.json({success:true}),{id:'retained-synthetic-session'}));
 await assert.rejects(()=>assertReportingSignOutDestroyed(Response.json({success:false}),null));
 await assert.rejects(()=>assertReportingSignOutDestroyed(Response.json({success:true},{status:403}),null));
});
for(const backend of postgres?['isolated','postgres']:['isolated']){
 async function fixture(){
  const f=await authHarness(backend),token=await f.issue(),target=await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(token)}});
  await f.issue('MANAGER',1);const other=await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(f.token())}});
  await f.issue('ADMIN');const admin=await f.db.session.findUnique({where:{tokenHash:f.session.hashSessionToken(f.token())}});f.use(token);
  const origin=f.load('lib/credentialRequest.ts').configuredCredentialOrigin();
  const request=(headers={origin},body=null)=>browserRequest(origin,{...headers,...(f.token()?{cookie:'rfl_session='+f.token()}: {})},body);
  const rows=()=>f.db.session.findMany({where:{id:{in:[target.id,other.id,admin.id]}},orderBy:{id:'asc'}});
  return {...f,target,other,admin,token,request,rows};
 }
 test(backend+': same-origin reporting sign-out deletes only the intended durable session',async()=>{
  const f=await fixture(),response=await reportingSignOut(f,f.request());
  await assertReportingSignOutDestroyed(response,await f.db.session.findUnique({where:{id:f.target.id}}));
  assert.equal(await f.session.getCurrentSession(),null);f.use(f.token);assert.equal(await f.session.getCurrentSession(),null);
  assert.deepEqual(await f.db.session.findUnique({where:{id:f.other.id}}),f.other);assert.deepEqual(await f.db.session.findUnique({where:{id:f.admin.id}}),f.admin);assert.notEqual(f.target.businessId,f.other.businessId);
  console.log('RFL_SIGNOUT_CONTRACT_PROOF '+JSON.stringify({backend,httpStatus:response.status,targetDeleted:true,replayedCookieRejected:true,otherBusinessAndAdminPreserved:true}));
 });
 for(const kind of ['missing Origin','cross Origin','malformed Origin','unexpected body'])test(backend+': reporting sign-out rejects '+kind+' and preserves sessions',async()=>{
  const f=await fixture(),before=await f.rows(),origin=f.load('lib/credentialRequest.ts').configuredCredentialOrigin(),headers=kind==='missing Origin'?{}:{origin:kind==='cross Origin'?'https://foreign.example.test':kind==='malformed Origin'?'not an origin':origin};
  const response=await reportingSignOut(f,f.request(headers,kind==='unexpected body'?Buffer.from('{}'):null));
  assert.equal(response.status,kind==='unexpected body'?400:403);assert.notEqual((await response.clone().json()).success,true);assert.deepEqual(await f.rows(),before);
  await assert.rejects(()=>assertReportingSignOutDestroyed(response,f.target));
 });
 for(const kind of ['missing','invalid'])test(backend+': '+kind+' session credentials cannot destroy another business or admin session',async()=>{
  const f=await fixture(),before=await f.rows();f.use(kind==='missing'?'':'invalid-synthetic-cookie');
  const response=await reportingSignOut(f,f.request());assert.equal(response.status,200);assert.deepEqual(await f.rows(),before);
  const remaining=await f.db.session.findUnique({where:{id:f.target.id}});await assert.rejects(()=>assertReportingSignOutDestroyed(response,remaining));
 });
}
