import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
import {provisioningFixture} from './helpers/stripe-foundation-harness.mjs';
async function fixture(){
 const f=await provisioningFixture('isolated'),cache=new Map(),calls=[];let configured=false;const create=f.stripe.accounts.create;
 f.stripe.accounts.create=async(params,options)=>{calls.push(structuredClone({params,options}));if(cache.has(options.idempotencyKey))throw cache.get(options.idempotencyKey);
 if(!configured){const error=Object.assign(new Error('synthetic rejected create'),{type:'StripeInvalidRequestError',statusCode:400,requestId:'req_rejected123'});cache.set(options.idempotencyKey,error);throw error;}return create(params,options);};
 const managerToken=f.token();await f.issue('ADMIN');const admin=await f.session.getCurrentSession();f.use(managerToken);
 const operation=f.load('lib/stripeConnectRecovery.ts').prepareConfirmedStripeRejectionRetry;
 return {...f,calls,admin,operation,configure:()=>{configured=true;},recovery:{prepareConfirmedStripeRejectionRetry:(text,apply=true,operator=admin)=>operation(text,operator,apply)},attempt:f.load('lib/stripeProvisioningAttempt.ts')};
}
async function payload(f,changes={}){
 const row=await f.journal(),state=f.attempt.readProvisioningAttempt(row),now=f.db.now;
 return {version:1,purpose:'RFL_CONNECT_CONFIRMED_REJECTION_RETRY',approvalId:randomUUID(),businessId:f.identity.businessId,journalId:row.id,expectedAttemptId:state.attempt.id,expectedCalls:state.attempt.calls,expectedPendingCalls:0,expectedOutcome:state.attempt.kind==='LEGACY'&&state.attempt.calls===0?'LEGACY_UNRECORDED':'UNCONFIRMED',expectedKey:f.attempt.provisioningAttemptKey(row.id,state.attempt),expectedLastRequestId:state.attempt.lastRequestId??null,platformAccountId:'acct_platform',mode:'test',profile:'LEGACY_DESTINATION',parametersDigest:f.attempt.provisioningRequestDigest(state.request),rejectedRequestId:'req_rejected123',evidenceKind:'PROVIDER_VERIFIED_NO_CREATION',evidenceReference:'ev_syntheticSupportReceipt',terminalRejectionConfirmed:true,allRequestsUnderKeyVerified:true,configurationCorrected:true,issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+5*60000).toISOString(),...changes};
}
function token(_f,p){return JSON.stringify(p);}
async function reject(f,p,code){await assert.rejects(()=>f.recovery.prepareConfirmedStripeRejectionRetry(token(f,p)),e=>e.code===code);}

test('confirmed rejection creates exactly one durable replacement with frozen parameters and stable journal',async()=>{
 const f=await fixture();assert.equal((await f.connect()).status,500);const row=await f.journal(),state=f.attempt.readProvisioningAttempt(row);assert.equal(state.attempt.state,'UNCONFIRMED');assert.equal(state.attempt.pendingCalls,0);assert.equal(state.attempt.calls,1);assert.equal(state.attempt.lastRequestId,'req_rejected123');
 f.configure();assert.equal((await f.connect()).status,500);assert.equal(f.calls[0].options.idempotencyKey,f.calls[1].options.idempotencyKey);
 const approval=await payload(f),before=await f.journal();const result=await f.recovery.prepareConfirmedStripeRejectionRetry(token(f,approval));assert.equal(result.status,'PREPARED');const after=await f.journal(),replacement=f.attempt.readProvisioningAttempt(after);
 assert.equal(after.id,before.id);assert.deepEqual(after.createdAt,before.createdAt);assert.deepEqual(replacement.request,state.request);assert.notEqual(replacement.attempt.id,state.attempt.id);assert.equal(replacement.attempt.startedAt,f.db.now.toISOString());assert.equal(f.calls.length,2,'Preparing recovery never calls the provider');
 assert.equal((await f.connect()).status,200);assert.equal(f.state.accounts.size,1);assert.notEqual(f.calls[2].options.idempotencyKey,f.calls[1].options.idempotencyKey);assert.deepEqual(f.calls[2].params,f.calls[1].params);assert.equal(Object.hasOwn(f.calls[2].params,'attempt'),false);assert.equal(Object.hasOwn(f.calls[2].params,'request'),false);assert.equal(Object.hasOwn(f.calls[2].params,'rflProvisioningVersion'),false);
 assert.equal((await f.connect()).status,200);assert.equal(f.calls.length,3,'Existing account is reused');
 const audit=await f.db.auditLog.findMany({where:{action:'STRIPE_PROVISIONING_RETRY_DECISION'}});assert.equal(audit.length,1);assert.equal(audit[0].actorType,'ADMIN');assert.equal(audit[0].actorId,f.admin.adminAccessId);assert.equal(audit[0].metadata.decision,'PREPARED');assert.equal(audit[0].metadata.rejectedRequestId,'req_rejected123');assert.doesNotMatch(JSON.stringify(audit),/example\.test|parametersDigest|signature|rfl-connect-v|synthetic rejected create/);
});
for(const [name,change] of [
 ['HTTP 400 only',{evidenceKind:'HTTP_400'}],['message only',{evidenceKind:'ERROR_MESSAGE'}],['replay marker only',{evidenceKind:'REPLAY_MARKER'}],['network timeout',{evidenceKind:'NETWORK_TIMEOUT'}],['no account ID',{evidenceKind:'LOCAL_ACCOUNT_NULL'}],['expired retry window',{evidenceKind:'EXPIRED_WINDOW'}],['nonterminal observation',{terminalRejectionConfirmed:false}],['unreviewed history',{allRequestsUnderKeyVerified:false}],['unfixed configuration',{configurationCorrected:false}],['missing request',{rejectedRequestId:undefined}],['extra arbitrary input',{notes:'sensitive input'}]
])test(`unverified evidence cannot rotate: ${name}`,async()=>{
 const f=await fixture();await f.connect();const before=await f.journal();const p=await payload(f,change);await assert.rejects(()=>f.recovery.prepareConfirmedStripeRejectionRetry(token(f,p)),e=>e.code==='APPROVAL_INVALID');assert.deepEqual(await f.journal(),before);assert.equal(f.calls.length,1);
});
test('malformed, oversize and former signed envelopes reject without mutation',async()=>{
 const f=await fixture();await f.connect();const p=await payload(f),before=await f.journal();
 for(const text of ['{','x'.repeat(16385),JSON.stringify({payload:p,signature:'removed'})])await assert.rejects(()=>f.recovery.prepareConfirmedStripeRejectionRetry(text),e=>e.code==='APPROVAL_INVALID');
 assert.deepEqual(await f.journal(),before);assert.equal((await f.db.auditLog.findMany({where:{action:'STRIPE_PROVISIONING_RETRY_DECISION'}})).length,0);
});

for(const [name,changes,code] of [
 ['attempt',{expectedAttemptId:'stale'},'STALE_APPROVAL'],['call counter',{expectedCalls:0},'STALE_APPROVAL'],['key',{expectedKey:'wrong'},'STALE_APPROVAL'],['observed request',{expectedLastRequestId:'req_other'},'STALE_APPROVAL'],['request digest',{parametersDigest:'a'.repeat(64)},'REQUEST_MISMATCH'],['platform',{platformAccountId:'acct_other'},'IDENTITY_MISMATCH'],['mode',{mode:'live'},'IDENTITY_MISMATCH'],['profile',{profile:'DIRECT'},'IDENTITY_MISMATCH'],['journal',{journalId:'missing'},'TARGET_UNAVAILABLE']
])test(`approval binding rejects wrong ${name}`,async()=>{const f=await fixture();await f.connect();const before=await f.journal();await reject(f,await payload(f,changes),code);assert.deepEqual(await f.journal(),before);});
test('expired approvals are audited before an error is returned',async()=>{
 const f=await fixture();await f.connect();await reject(f,await payload(f,{issuedAt:new Date(f.db.now.getTime()-10*60000).toISOString(),expiresAt:new Date(f.db.now.getTime()-1).toISOString()}),'APPROVAL_EXPIRED');const rows=await f.db.auditLog.findMany({where:{action:'STRIPE_PROVISIONING_RETRY_DECISION'}});assert.equal(rows.length,1);assert.equal(rows[0].metadata.decision,'APPROVAL_EXPIRED');
});
test('concurrent ADMIN applies can prepare only one attempt',async()=>{
 const f=await fixture();await f.connect();const approvalText=token(f,await payload(f));const results=await Promise.allSettled([f.recovery.prepareConfirmedStripeRejectionRetry(approvalText),f.recovery.prepareConfirmedStripeRejectionRetry(approvalText)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='STALE_APPROVAL').length,1);assert.equal(f.calls.length,1);assert.equal((await f.db.auditLog.findMany({where:{action:'STRIPE_PROVISIONING_RETRY_DECISION'}})).filter(x=>x.metadata.decision==='PREPARED').length,1);
});
test('recovery audit failure rolls back replacement atomically',async()=>{
 const f=await fixture();await f.connect();const before=await f.journal(),approvalText=token(f,await payload(f));f.fail('auditLog.create');await assert.rejects(()=>f.recovery.prepareConfirmedStripeRejectionRetry(approvalText));f.fail('auditLog.create',false);assert.deepEqual(await f.journal(),before);
});
test('ordinary retry invalidates an already prepared approval even when request ID repeats',async()=>{
 const f=await fixture();await f.connect();const p=await payload(f);await f.connect();await reject(f,p,'STALE_APPROVAL');assert.equal(f.calls[0].options.idempotencyKey,f.calls[1].options.idempotencyKey);
});
test('durable in-flight reservation prevents rotation during or after ambiguous persistence failure',async()=>{
 const f=await fixture();f.configure();const create=f.stripe.accounts.create;f.stripe.accounts.create=async(...args)=>{const account=await create(...args);f.fail('stripeConnection.create');return account;};assert.equal((await f.connect()).status,500);f.fail('stripeConnection.create',false);f.stripe.accounts.create=create;
 const state=f.attempt.readProvisioningAttempt(await f.journal());assert.equal(state.attempt.state,'IN_FLIGHT');assert.equal(state.attempt.pendingCalls,1);await reject(f,await payload(f),'STATE_INVALID');assert.equal(f.state.accounts.size,1);assert.equal((await f.connect()).status,200);assert.equal(f.state.accounts.size,1);assert.equal(f.calls[0].options.idempotencyKey,f.calls[1].options.idempotencyKey);
});
test('SDK timeout is durable UNCONFIRMED and never auto-authorizes a new key',async()=>{
 const f=await fixture();f.stripe.accounts.create=async()=>{throw Object.assign(new Error('synthetic timeout'),{type:'StripeConnectionError'});};assert.equal((await f.connect()).status,500);const state=f.attempt.readProvisioningAttempt(await f.journal());assert.equal(state.attempt.state,'UNCONFIRMED');assert.equal(state.attempt.pendingCalls,0);assert.equal((await f.db.auditLog.findMany({where:{action:'STRIPE_ACCOUNT_CREATE_UNCONFIRMED'}})).length,1);
 await reject(f,await payload(f,{evidenceKind:'NETWORK_TIMEOUT'}),'APPROVAL_INVALID');
});
test('replacement keeps one key through repeated failures and blocks after its own replay window',async()=>{
 const f=await fixture();await f.connect();await f.recovery.prepareConfirmedStripeRejectionRetry(token(f,await payload(f)));await f.connect();await f.connect();assert.equal(f.calls[1].options.idempotencyKey,f.calls[2].options.idempotencyKey);const calls=f.calls.length;
 f.db.now=new Date(f.db.now.getTime()+24*3600000);await f.db.session.update({where:{id:f.identity.id},data:{expiresAt:new Date(f.db.now.getTime()+3600000)}});assert.equal((await f.connect()).status,409);assert.equal(f.calls.length,calls);
});
test('legacy flat journal supports verified recovery without changing journal identity or request',async()=>{
 const f=await fixture();await f.connect();const row=await f.journal(),request=f.attempt.readProvisioningAttempt(row).request;await f.db.stripeAccountProvisioning.update({where:{id:row.id},data:{parameters:request,createdAt:new Date(f.db.now.getTime()-2*86400000)}});const approvalText=token(f,await payload(f));assert.equal((await f.recovery.prepareConfirmedStripeRejectionRetry(approvalText)).status,'PREPARED');assert.equal((await f.journal()).id,row.id);assert.deepEqual(f.attempt.readProvisioningAttempt(await f.journal()).request,request);
});
test('existing account is never replaced even with an old recovery approval',async()=>{
 const f=await fixture();await f.connect();const approvalText=token(f,await payload(f));f.configure();await f.recovery.prepareConfirmedStripeRejectionRetry(approvalText);assert.equal((await f.connect()).status,200);assert.equal((await f.recovery.prepareConfirmedStripeRejectionRetry(approvalText)).status,'EXISTING_ACCOUNT');assert.equal(f.state.accounts.size,1);
});
test('recovery is not reachable through any normal application route',()=>{
 function files(root){return readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(root+'/'+x.name):[root+'/'+x.name]);}
 for(const file of files('app').filter(x=>/\.[tj]sx?$/.test(x)))assert.doesNotMatch(readFileSync(file,'utf8'),/stripeConnectRecovery|prepareConfirmedStripeRejectionRetry/);
});

test('default preview validates but changes neither journal nor audit and never calls Stripe',async()=>{
 const f=await fixture();await f.connect();const text=token(f,await payload(f)),before=await f.journal(),audit=await f.db.auditLog.findMany();
 const result=await f.operation(text,f.admin);assert.equal(result.status,'VERIFIED_PREVIEW');assert.deepEqual(await f.journal(),before);assert.deepEqual(await f.db.auditLog.findMany(),audit);assert.equal(f.calls.length,1);
 const applied=await f.operation(text,f.admin,true);assert.equal(applied.status,'PREPARED');
});
test('rejected preview has no audit or journal writes',async()=>{
 const f=await fixture();await f.connect();const before=await f.journal(),audit=await f.db.auditLog.findMany();await assert.rejects(async()=>f.operation(token(f,await payload(f,{expectedAttemptId:'stale'})),f.admin),e=>e.code==='STALE_APPROVAL');assert.deepEqual(await f.journal(),before);assert.deepEqual(await f.db.auditLog.findMany(),audit);
});
for(const kind of ['MANAGER','EXPIRED','REVOKED_SESSION','INACTIVE_ADMIN','CHANGED_CREDENTIAL','CHANGED_TOKEN'])test(`preview and apply reject unauthorized authority: ${kind}`,async()=>{
 const f=await fixture();await f.connect();const text=token(f,await payload(f)),before=await f.journal();let authority=f.admin;
 if(kind==='MANAGER')authority=f.identity;
 if(kind==='EXPIRED')await f.db.session.update({where:{id:f.admin.id},data:{expiresAt:f.db.now}});
 if(kind==='REVOKED_SESSION')await f.db.session.deleteMany({where:{id:f.admin.id}});
 if(kind==='INACTIVE_ADMIN')await f.db.adminAccess.update({where:{id:f.admin.adminAccessId},data:{isActive:false}});
 if(kind==='CHANGED_CREDENTIAL')await f.db.adminAccess.update({where:{id:f.admin.adminAccessId},data:{codeHash:'revoked'}});
 if(kind==='CHANGED_TOKEN')await f.db.session.update({where:{id:f.admin.id},data:{tokenHash:'revoked'}});
 for(const apply of [false,true])await assert.rejects(()=>f.operation(text,authority,apply),e=>e.constructor.name==='AdminMutationUnauthorized');
 assert.deepEqual(await f.journal(),before);assert.equal((await f.db.auditLog.findMany({where:{action:'STRIPE_PROVISIONING_RETRY_DECISION'}})).length,0);assert.equal(f.calls.length,1);
});
test('authority expiry at final check rolls back attempt and audit',async()=>{
 const f=await fixture();await f.connect();const text=token(f,await payload(f)),before=await f.journal(),create=f.db.auditLog.create;
 f.db.auditLog.create=async args=>{const result=await create(args);f.db.now=new Date(f.admin.expiresAt);return result;};
 await assert.rejects(()=>f.operation(text,f.admin,true),e=>e.constructor.name==='AdminMutationUnauthorized');assert.deepEqual(await f.journal(),before);assert.equal((await f.db.auditLog.findMany({where:{action:'STRIPE_PROVISIONING_RETRY_DECISION'}})).length,0);
});

test('concurrent ordinary clicks after recovery create one account with one stable key',async()=>{
 const f=await fixture();await f.connect();await f.recovery.prepareConfirmedStripeRejectionRetry(token(f,await payload(f)));f.configure();const results=await Promise.all(Array.from({length:6},()=>f.connect()));assert.ok(results.every(r=>r.status===200));assert.equal(f.state.accounts.size,1);assert.equal(f.state.createCalls.length,1);assert.equal(new Set(f.calls.slice(1).map(c=>c.options.idempotencyKey)).size,1);
});
test('link failure after replacement retains connection and never mints another account',async()=>{
 const f=await fixture();await f.connect();await f.recovery.prepareConfirmedStripeRejectionRetry(token(f,await payload(f)));f.configure();f.state.failLink=true;assert.equal((await f.connect()).status,500);const connection=await f.db.stripeConnection.findUnique({where:{businessId:f.identity.businessId}});assert.ok(connection);const count=f.calls.length;f.state.failLink=false;assert.equal((await f.connect()).status,200);assert.equal(f.calls.length,count);assert.equal(f.state.accounts.size,1);assert.deepEqual(await f.db.stripeConnection.findUnique({where:{businessId:f.identity.businessId}}),connection);
});
test('SDK mutation cannot alter frozen request data on failure',async()=>{
 const f=await fixture();f.stripe.accounts.create=async(params)=>{params.business_profile.name='MUTATED';throw Error('synthetic');};await f.connect();assert.notEqual(f.attempt.readProvisioningAttempt(await f.journal()).request.business_profile.name,'MUTATED');
});
test('pending durable reservation blocks otherwise valid recovery approval',async()=>{
 const f=await fixture();await f.connect();const approvalText=token(f,await payload(f)),row=await f.journal(),state=f.attempt.readProvisioningAttempt(row);
 await f.db.stripeAccountProvisioning.update({where:{id:row.id},data:{parameters:f.attempt.storeProvisioningAttempt(state.request,{...state.attempt,state:'IN_FLIGHT',pendingCalls:1})}});
 await assert.rejects(()=>f.recovery.prepareConfirmedStripeRejectionRetry(approvalText),e=>e.code==='STATE_INVALID');assert.equal(f.calls.length,1);
});
test('approval lifetime, malformed metadata and fresh uncalled attempts fail closed',async()=>{
 const f=await fixture();await f.connect();await reject(f,await payload(f,{issuedAt:new Date(f.db.now.getTime()+1).toISOString()}),'APPROVAL_EXPIRED');await reject(f,await payload(f,{expiresAt:new Date(f.db.now.getTime()+16*60000).toISOString()}),'APPROVAL_EXPIRED');
 const prepared=await f.recovery.prepareConfirmedStripeRejectionRetry(token(f,await payload(f)));assert.equal(prepared.status,'PREPARED');await reject(f,await payload(f),'STATE_INVALID');
 const approvalText=token(f,await payload(f)),row=await f.journal();await f.db.stripeAccountProvisioning.update({where:{id:row.id},data:{parameters:{...row.parameters,unexpected:'must reject'}}});
 await assert.rejects(()=>f.recovery.prepareConfirmedStripeRejectionRetry(approvalText),e=>e.code==='STATE_INVALID');assert.equal(f.calls.length,1);assert.equal((await f.journal()).parameters.unexpected,'must reject');
});

async function maintenance(f,text,args){
 const output=[],errors=[],processMock={argv:['node','maintenance',...args],exitCode:0};
 const bytes=Buffer.isBuffer(text)?text:Buffer.from(text);
 const prisma=new Proxy(f.db,{get(target,name){if(name==='$disconnect')return async()=>{};return target[name];}});
 const mocks={'node:fs/promises':{open:async()=>({read:async(buffer,offset,length,position)=>{const count=Math.max(0,Math.min(length,bytes.length-position));bytes.copy(buffer,offset,position,position+count);return {bytesRead:count};},close:async()=>{}})},'../lib/prisma':{prisma},'../lib/adminMutation':f.load('lib/adminMutation.ts'),'../lib/stripeConnectRecovery':f.load('lib/stripeConnectRecovery.ts')};
 const source=ts.transpileModule(readFileSync('scripts/prepare-stripe-connect-recovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replace('void run();','return run();');
 await vm.runInThisContext('(function(require,exports,process,console){'+source+'})')(name=>{assert.ok(Object.hasOwn(mocks,name),'No unexpected CLI imports');return mocks[name];},{},processMock,{log:x=>output.push(x),error:x=>errors.push(x)});
 return {output,errors,exit:processMock.exitCode};
}
test('maintenance CLI defaults to preview and requires explicit apply without signing configuration',async()=>{
 const f=await fixture();await f.connect();const text=token(f,await payload(f)),before=await f.journal(),args=['--admin-session',f.admin.id,'--approval','in-memory.json'];
 const preview=await maintenance(f,text,args);assert.equal(preview.exit,0);assert.equal(JSON.parse(preview.output[0]).status,'VERIFIED_PREVIEW');assert.deepEqual(await f.journal(),before);
 const applied=await maintenance(f,text,[...args,'--apply']);assert.equal(applied.exit,0);assert.equal(JSON.parse(applied.output[0]).status,'PREPARED');assert.equal(f.calls.length,1);
});
test('maintenance CLI rejects missing authority, malformed arguments, encoding and oversize input safely',async()=>{
 const f=await fixture();await f.connect();const text=token(f,await payload(f)),before=await f.journal(),audit=await f.db.auditLog.findMany(),args=['--admin-session',f.admin.id,'--approval','in-memory.json'];
 for(const [input,flags] of [[text,[]],[text,[...args,'--apply','--apply']],[text,[...args,'--unknown','value']],[text,['--admin-session','missing','--approval','x','--apply']],[text,['--admin-session',f.identity.id,'--approval','x','--apply']],[Buffer.from([0xff]),args],['x'.repeat(16385),args]]){
  const result=await maintenance(f,input,flags);assert.equal(result.exit,1);assert.equal(result.output.length,0);assert.ok(result.errors.every(x=>['CONNECT_RECOVERY_FAILED','ADMIN_UNAUTHORIZED','CONNECT_RECOVERY_CLEANUP_FAILED','APPROVAL_INVALID'].includes(x)));
 }
 assert.deepEqual(await f.journal(),before);assert.deepEqual(await f.db.auditLog.findMany(),audit);assert.equal(f.calls.length,1);
});
