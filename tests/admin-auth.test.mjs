import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import bcrypt from 'bcryptjs';
import {authHarness,postgres} from './helpers/auth-harness.mjs';
const secret='isolated-admin-passphrase';
async function login(h,code=secret,headers={}){return h.load('app/api/auth/login/route.ts').POST(new Request('https://example.test/api/auth/login',{method:'POST',headers,body:JSON.stringify({type:'ADMIN',code})}));}
const events=h=>h.db.auditLog.findMany({where:{action:'ADMIN_LOGIN_VERIFICATION_RESERVED'}});
function spy(h){const passwords=h.load('lib/password.ts'),verify=passwords.verifyPassword;let count=0;passwords.verifyPassword=async(...args)=>{count++;return verify(...args);};return ()=>count;}
for(const input of ['123456','',null,'x'.repeat(73),'😀'.repeat(19),' '.repeat(16),'123456'.padEnd(16,' '),'123456\0'.repeat(2)+'123456','\ud800'.repeat(16)])test(`B4 rejects weak/malformed credential ${JSON.stringify(input).slice(0,35)}`,async()=>{
 const h=await authHarness(),count=spy(h);const response=await login(h,input);assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'Unable to sign in.'});assert.equal(count(),0);assert.equal((await events(h)).length,1);
});
for(const input of ['a'.repeat(16),'x'.repeat(72),'🔐'.repeat(16),'  preserved passphrase  '])test(`B4 policy preserves valid credential (${Buffer.byteLength(input)} bytes)`,async()=>{
 const h=await authHarness();assert.equal(h.load('lib/adminCredential.ts').requireStrongAdminCredential(input),input);
 await h.db.adminAccess.update({where:{id:h.admins[0].id},data:{codeHash:await bcrypt.hash(input,12)}});assert.equal((await login(h,input)).status,200);assert.ok((await h.auth.requireAdmin()).adminAccess);
});
test('B4 real legacy bcrypt hash cannot be authenticated by NUL repetition',async()=>{
 const h=await authHarness(),disguised='123456\0'.repeat(2)+'123456',hash=await bcrypt.hash('123456',12);assert.equal(await bcrypt.compare(disguised,hash),true);
 await h.db.adminAccess.update({where:{id:h.admins[0].id},data:{codeHash:hash}});const count=spy(h);assert.equal((await login(h,disguised)).status,401);assert.equal(count(),0);
});
test('B4 repeated/changing guesses share limit; denied attempts perform no hashing or audit writes',async()=>{
 const h=await authHarness(),count=spy(h);for(let n=0;n<10;n++)assert.equal((await login(h,'different-password-'+n)).status,401);
 const checks=count();assert.equal(checks,20);for(let n=0;n<12;n++){const r=await login(h,'another-guess-'+n,{'x-forwarded-for':`192.0.2.${n}`,'forwarded':`for=192.0.2.${n}`});assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'300');}
 assert.equal(count(),checks);assert.equal((await events(h)).length,10);
});
test('B4 concurrent routes across module instances and restart share durable budget',async()=>{
 const first=await authHarness(),second=await authHarness('isolated',first.db);const responses=await Promise.all(Array.from({length:24},(_,n)=>login(n%2?first:second,'invalid-passphrase-'+n)));
 assert.equal(responses.filter(r=>r.status===401).length,10);assert.equal(responses.filter(r=>r.status===429).length,14);assert.equal((await events(first)).length,10);
 const restarted=await authHarness('isolated',first.db);assert.equal((await login(restarted)).status,429);
});
test('B4 recovery uses database time; blocked attempts cannot extend window',async()=>{
 const h=await authHarness();for(let n=0;n<10;n++)await login(h,'123456');const before=await events(h);h.db.now=new Date(h.db.now.getTime()+299999);assert.equal((await login(h)).status,429);assert.deepEqual(await events(h),before);
 h.db.now=new Date(h.db.now.getTime()+1);assert.equal((await login(h)).status,200);assert.ok(await h.session.getCurrentSession());
});
test('B4 successful login does not reset budget and creates fresh B5 session',async()=>{
 const h=await authHarness();for(let n=0;n<9;n++)await login(h,'123456');h.use('forged-token');assert.equal((await login(h)).status,200);assert.notEqual(h.token(),'forged-token');const token=h.token();assert.equal((await login(h,'incorrect-passphrase')).status,429);assert.equal(h.token(),token);
 await h.db.adminAccess.update({where:{id:(await h.session.getCurrentSession()).adminAccessId},data:{isActive:false}});assert.equal(await h.session.getCurrentSession(),null);
});
test('B4 manager valid/invalid logins remain independent of admin attack budget',async()=>{
 const h=await authHarness();for(let n=0;n<10;n++)await login(h,'123456');const route=h.load('app/api/auth/login/route.ts');
 assert.equal((await route.POST(h.request({type:'MANAGER',email:h.managers[0].email,password:'wrong-password'}))).status,401);
 assert.equal((await route.POST(h.request({type:'MANAGER',email:h.managers[0].email,password:'old-password'}))).status,200);assert.equal((await h.session.getCurrentSession()).type,'MANAGER');assert.equal((await events(h)).length,10);
});
test('B4 missing and inactive admins return same generic failure and perform dummy bcrypt comparison',async()=>{
 const h=await authHarness(),count=spy(h);await h.db.adminAccess.updateMany({where:{},data:{isActive:false}});const inactive=await login(h);assert.equal(inactive.status,401);assert.equal(count(),1);
 await h.db.adminAccess.deleteMany({where:{}});const missing=await login(h);assert.equal(missing.status,401);assert.deepEqual(await missing.json(),await inactive.json());assert.equal(count(),2);
});
test('B4 security events/public bodies never contain credentials, hashes or session tokens',async()=>{
 const h=await authHarness();const response=await login(h);const body=JSON.stringify(await response.json());assert.equal(response.status,200);const token=h.token();await login(h,'wrong-credential-value');const records=JSON.stringify(await events(h));
 for(const value of [secret,'wrong-credential-value',h.admins[0].codeHash,token]){assert.ok(!records.includes(value));assert.ok(!body.includes(value));}assert.equal((await events(h))[0].metadata.outcome,'SUCCESS');
});
test('B4 database reservation failure fails closed without bcrypt or session issuance',async()=>{
 const h=await authHarness(),count=spy(h);h.db.failures.add('auditLog.create');assert.equal((await login(h)).status,503);assert.equal(count(),0);assert.equal((await h.db.session.findMany()).length,0);
});
test('B4 actual seed fails before writes on weak/missing config; accepts strong config without trimming',async()=>{
 const h=await authHarness();for(const value of [undefined,'123456','123456'.padEnd(16,' '),'x'.repeat(73),'  preserved passphrase  ']){
  const calls=[],logs=[];let done;const finished=new Promise(r=>done=r);const db={adminAccess:{deleteMany:()=>{calls.push('delete');return {};},create:args=>{calls.push(args);return {};}},$transaction:async()=>{},$disconnect:async()=>done()};const mod={exports:{}};
  vm.runInThisContext('(function(require,module,exports,process,console){'+ts.transpileModule(readFileSync('prisma/seed.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText+'})')(
   name=>name==='@prisma/client'?{PrismaClient:class{constructor(){return db;}}}:name==='bcryptjs'?{__esModule:true,default:bcrypt}:h.load('lib/adminCredential.ts'),mod,mod.exports,{env:{SEED_ADMIN_CODE:value},exit:()=>{}},{log:(...a)=>logs.push(a),error:(...a)=>logs.push(a.map(v=>v instanceof Error?v.message:v))});
  await finished;if(value==='  preserved passphrase  '){assert.equal(calls.length,2);assert.equal(await bcrypt.compare(value,calls[1].data.codeHash),true);}else assert.equal(calls.length,0);
  const output=JSON.stringify(logs);if(value)assert.ok(!output.includes(value));
 }
});
if(postgres)test('B4 PostgreSQL: concurrent independent instances, persistent audit budget, recovery and real session issuance',async()=>{
 const first=await authHarness('postgres'),second=await authHarness('postgres');const original=postgres.adminAccess.findMany;
 // This shared disposable cluster contains many unrelated test principals. Limit
 // credential candidates to this scenario's fixtures; throttle SQL remains real/global.
 const ids=[...first.admins,...second.admins].map(a=>a.id);
 postgres.adminAccess.findMany=args=>original.call(postgres.adminAccess,{...args,where:{...args.where,id:{in:ids}}});
 const old=await events(first);
 // Age only B4 test security events in this explicitly verified disposable DB.
 for(const row of old){assert.equal(row.actorType,'SECURITY');assert.equal(row.targetType,'ADMIN_AUTH');}
 if(old.length)await postgres.auditLog.updateMany({where:{id:{in:old.map(r=>r.id)}},data:{createdAt:new Date(Date.now()-300001)}});
 try{
  const responses=await Promise.all(Array.from({length:24},(_,n)=>login(n%2?first:second,'123456',{'x-forwarded-for':`198.51.100.${n}`})));
  assert.equal(responses.filter(r=>r.status===401).length,10);assert.equal(responses.filter(r=>r.status===429).length,14);const rows=(await events(first)).filter(r=>!old.some(o=>o.id===r.id));assert.equal(rows.length,10);
  const restarted=await authHarness('postgres');assert.equal((await login(restarted)).status,429);
  await postgres.auditLog.updateMany({where:{id:{in:rows.map(r=>r.id)}},data:{createdAt:new Date(Date.now()-300001)}});
  assert.equal((await login(first)).status,200);const session=await first.session.getCurrentSession();assert.equal(session.type,'ADMIN');assert.ok(ids.includes(session.adminAccessId));
  await postgres.adminAccess.update({where:{id:session.adminAccessId},data:{isActive:false}});assert.equal(await first.session.getCurrentSession(),null);
 }finally{postgres.adminAccess.findMany=original;}
});
