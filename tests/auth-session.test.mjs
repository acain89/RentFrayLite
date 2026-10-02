import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import {authHarness,postgres,initialHash} from './helpers/auth-harness.mjs';
for(const backend of [...(postgres?['postgres']:[]),'isolated']){
 const label=backend+' B5';
 for(const type of ['MANAGER','ADMIN']){
  const table=type==='MANAGER'?'manager':'adminAccess';
  test(`${label}: active ${type}, protected API/page and fresh login tokens`,async()=>{
   const h=await authHarness(backend);const first=await h.issue(type),second=await h.issue(type);assert.notEqual(first,second);assert.ok(await h.session.getCurrentSession());
   assert.equal((await h.load('app/api/auth/session/route.ts').GET()).status,200);
   if(type==='MANAGER'){assert.equal((await h.auth.requireManager()).manager.id,h.managers[0].id);await h.load('app/manager/settings/security/page.tsx').default();}else{assert.equal((await h.load('app/api/admin/session/route.ts').GET()).status,200);assert.ok((await h.load('lib/adminApi.ts').requireAdminApi()).session);await h.load('app/admin/page.tsx').default();}
   assert.equal(h.cookieOptions[0].httpOnly,true);assert.equal(h.cookieOptions[0].secure,true);assert.equal(h.cookieOptions[0].sameSite,'lax');
  });
  test(`${label}: inactive ${type} immediately denied by protected API and read-only page`,async()=>{
   const h=await authHarness(backend);const t=await h.issue(type);await h.db[table].update({where:{id:type==='MANAGER'?h.managers[0].id:h.admins[0].id},data:{isActive:false}});
   h.readonly(true);await assert.rejects(()=>h.load(type==='MANAGER'?'app/manager/settings/security/page.tsx':'app/admin/page.tsx').default(),/REDIRECT \/login/);
   h.readonly(false);h.use(t);assert.equal((await h.load(type==='MANAGER'?'app/api/manager/security/route.ts':'app/api/admin/session/route.ts')[type==='MANAGER'?'PATCH':'GET'](h.request({}))).status,401);assert.equal(h.token(),'');
  });
  test(`${label}: expired ${type}, forged cookie, logout and copied token rejected`,async()=>{
   const h=await authHarness(backend);const t=await h.issue(type);await h.db.session.updateMany({where:{tokenHash:h.session.hashSessionToken(t)},data:{expiresAt:new Date(0)}});assert.equal(await h.session.getCurrentSession(),null);
   h.use(t+'forged');assert.equal(await h.session.getCurrentSession(),null);const fresh=await h.issue(type);assert.equal((await h.load('app/api/auth/logout/route.ts').POST()).status,200);h.use(fresh);assert.equal(await h.session.getCurrentSession(),null);
  });
  test(`${label}: deleted ${type} cannot authorize`,async()=>{
   const h=await authHarness(backend);const t=await h.issue(type);await h.db[table].deleteMany({where:{id:type==='MANAGER'?h.managers[0].id:h.admins[0].id}});h.use(t);assert.equal(await h.session.getCurrentSession(),null);
  });
  test(`${label}: deactivation between authentication and issuance cannot issue ${type} session`,async()=>{
   const h=await authHarness(backend);const p=type==='MANAGER'?h.managers[0]:h.admins[0];await h.db[table].update({where:{id:p.id},data:{isActive:false}});
   await assert.rejects(()=>type==='MANAGER'?h.session.createManagerSession({managerId:p.id,businessId:p.businessId,passwordHash:p.passwordHash,email:p.email}):h.session.createAdminSession(p.id,p.codeHash),/authentication changed/);
   assert.equal((await h.db.session.findMany({where:type==='MANAGER'?{managerId:p.id}:{adminAccessId:p.id}})).length,0);
  });
 }
 for(const action of ['PASSWORD','EMAIL'])test(`${label}: manager ${action} revokes both browsers and copied cookies, other principals survive`,async()=>{
  const h=await authHarness(backend),other=await h.issue('MANAGER',1),admin=await h.issue('ADMIN');const a=await h.issue(),b=await h.issue();h.use(a);
  const response=await h.change(action==='EMAIL'?{action,newEmail:'changed-'+h.managers[0].id+'@example.test'}:{});assert.equal(response.status,200);assert.equal((await response.json()).requiresLogin,true);assert.equal(h.token(),'');
  for(const t of [a,b]){h.use(t);assert.equal(await h.session.getCurrentSession(),null);}
  h.use(other);assert.ok(await h.session.getCurrentSession());h.use(admin);assert.ok(await h.session.getCurrentSession());
  if(action==='PASSWORD'){const m=await h.db.manager.findUnique({where:{id:h.managers[0].id}});assert.equal(await bcrypt.compare('new-password',m.passwordHash),true);assert.equal(await bcrypt.compare('old-password',m.passwordHash),false);}
  const fresh=await h.issue();assert.notEqual(fresh,a);assert.ok(await h.session.getCurrentSession());
 });
 for(const kind of ['password','email'])test(`${label}: admin ${kind} reset revokes only target manager`,async()=>{
  const h=await authHarness(backend),a=await h.issue(),b=await h.issue(),other=await h.issue('MANAGER',1),admin=await h.issue('ADMIN');
  assert.equal((await h.reset(0,kind==='email'?{password:'',confirmPassword:'',email:'reset-'+h.managers[0].id+'@example.test'}:{})).status,200);
  for(const t of [a,b]){h.use(t);assert.equal(await h.session.getCurrentSession(),null);}h.use(other);assert.ok(await h.session.getCurrentSession());h.use(admin);assert.ok(await h.session.getCurrentSession());
  assert.equal((await h.db.session.findMany({where:{managerId:h.managers[0].id}})).length,0);
 });
 test(`${label}: wrong business association never grants manager authorization`,async()=>{
  const h=await authHarness(backend);const t=await h.issue();await h.db.session.updateMany({where:{tokenHash:h.session.hashSessionToken(t)},data:{businessId:h.businesses[1].id}});assert.equal(await h.session.getCurrentSession(),null);
 });
 test(`${label}: old authenticated manager snapshot cannot create a token after reset`,async()=>{
  const h=await authHarness(backend);const m=await h.auth.authenticateManager(h.managers[0].email,'old-password');assert.ok(m);await h.issue('ADMIN');assert.equal((await h.reset()).status,200);
  await assert.rejects(()=>h.session.createManagerSession({managerId:m.id,businessId:m.businessId,passwordHash:m.passwordHash,email:m.email}),/authentication changed/);
 });
 test(`${label}: actual login rotates attacker-controlled cookie`,async()=>{
  const h=await authHarness(backend);h.use('attacker-chosen-token');const response=await h.load('app/api/auth/login/route.ts').POST(h.request({type:'MANAGER',email:h.managers[0].email,password:'old-password'}));assert.equal(response.status,200);assert.notEqual(h.token(),'attacker-chosen-token');assert.ok(await h.session.getCurrentSession());
 });
 test(`${label}: administrator login also rotates a supplied cookie`,async()=>{
  const h=await authHarness(backend);h.use('attacker-admin-token');const response=await h.load('app/api/auth/login/route.ts').POST(h.request({type:'ADMIN',code:'isolated-admin-passphrase'}));
  assert.equal(response.status,200);assert.notEqual(h.token(),'attacker-admin-token');assert.equal((await h.session.getCurrentSession()).type,'ADMIN');
 });
 if(backend==='postgres')test(`${label}: real principal row lock prevents issuance across a reset commit`,async()=>{
  const h=await authHarness(backend);const old=h.managers[0];const token=await h.issue();const newHash=await bcrypt.hash('new-password',12);
  let entered,release;const arrived=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
  const reset=h.db.$transaction(async tx=>{await tx.manager.update({where:{id:old.id},data:{passwordHash:newHash}});await tx.session.deleteMany({where:{managerId:old.id}});entered();await barrier;},{timeout:10000});
  await arrived;const rejected=assert.rejects(()=>h.session.createManagerSession({managerId:old.id,businessId:old.businessId,passwordHash:old.passwordHash,email:old.email}),/authentication changed/);
  try{
   let blocked=false;for(let n=0;n<30&&!blocked;n++){const rows=await h.db.$queryRawUnsafe(`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%Manager%FOR UPDATE%'`);blocked=rows.length>0;if(!blocked)await new Promise(r=>setTimeout(r,20));}
   assert.equal(blocked,true,'issuance must wait for the credential writer');
  }finally{release();}
  await reset;await rejected;h.use(token);assert.equal(await h.session.getCurrentSession(),null);assert.equal((await h.db.session.findMany({where:{managerId:old.id}})).length,0);
 });
 test(`${label}: disabled business rejects existing manager token, other business unaffected`,async()=>{
  const h=await authHarness(backend);const a=await h.issue(),b=await h.issue('MANAGER',1);await h.db.business.update({where:{id:h.businesses[0].id},data:{status:'DISABLED'}});h.use(a);assert.equal(await h.session.getCurrentSession(),null);h.use(b);assert.ok(await h.session.getCurrentSession());
 });
 test(`${label}: administrator replacement rejects two old tokens and preserves another administrator`,async()=>{
  const h=await authHarness(backend);const a=await h.issue('ADMIN'),b=await h.issue('ADMIN'),other=await h.issue('ADMIN',1);
  await h.db.adminAccess.deleteMany({where:{id:h.admins[0].id}});
  for(const t of [a,b]){h.use(t);assert.equal(await h.session.getCurrentSession(),null);}h.use(other);assert.ok(await h.session.getCurrentSession());
  await assert.rejects(()=>h.session.createAdminSession(h.admins[0].id,h.admins[0].codeHash),/authentication changed/);
 });
 test(`${label}: stale password-change writer cannot overwrite administrator reset`,async()=>{
  const h=await authHarness(backend);await h.issue();const passwords=h.load('lib/password.ts');const hash=passwords.hashPassword;
  let entered,release;const arrived=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
  passwords.hashPassword=async value=>{entered();await barrier;return hash(value);};
  const stale=h.change({newPassword:'stale-password',confirmPassword:'stale-password'});
  await arrived;await h.issue('ADMIN');assert.equal((await h.reset()).status,200);release();assert.equal((await stale).status,401);
  const m=await h.db.manager.findUnique({where:{id:h.managers[0].id}});assert.equal(await bcrypt.compare('new-password',m.passwordHash),true);assert.equal(await bcrypt.compare('stale-password',m.passwordHash),false);
 });
 if(backend==='postgres')for(const failure of ['manager.update','session.deleteMany','auditLog.create'])for(const actor of ['manager','admin'])test(`${label}: real transaction rolls back ${actor} ${failure}`,async()=>{
  const h=await authHarness(backend);const a=await h.issue(),b=await h.issue();if(actor==='admin')await h.issue('ADMIN');
  const [model,method]=failure.split('.');const original=h.db[model][method],transaction=h.db.$transaction;
  const inject=(tx,args)=>failure==='manager.update'?tx[model][method]({...args,where:{id:'missing-'+h.managers[0].id}}):failure==='session.deleteMany'?
    tx.session.create({data:{tokenHash:h.session.hashSessionToken(a),type:'MANAGER',managerId:h.managers[0].id,businessId:h.businesses[0].id,expiresAt:new Date(Date.now()+10000)}}):
    tx[model][method]({...args,data:{...args.data,businessId:'missing-'+h.businesses[0].id}});
  if(actor==='manager')h.db.$transaction=(fn,options)=>transaction.call(h.db,async tx=>fn(new Proxy(tx,{get(target,key){
    if(key===model)return new Proxy(target[key],{get(delegate,op){return op===method?args=>inject(tx,args):typeof delegate[op]==='function'?delegate[op].bind(delegate):delegate[op];}});
    return typeof target[key]==='function'?target[key].bind(target):target[key];
  }})),options);
  else h.db[model][method]=args=>inject({...h.db,[model]:{...h.db[model],[method]:original.bind(h.db[model])}},args);
  try{await assert.rejects(()=>actor==='admin'?h.reset():h.change());}finally{h.db[model][method]=original;h.db.$transaction=transaction;}
  assert.equal((await h.db.manager.findUnique({where:{id:h.managers[0].id}})).passwordHash,initialHash);
  for(const t of [a,b]){h.use(t);assert.ok(await h.session.getCurrentSession());}
 });
 if(backend==='isolated')for(const failure of ['manager.update','session.deleteMany','auditLog.create'])for(const actor of ['manager','admin'])test(`${label}: ${actor} ${failure} rolls back credential update and revocation together`,async()=>{
  const h=await authHarness();const a=await h.issue(),b=await h.issue();if(actor==='admin')await h.issue('ADMIN');h.db.failures.add(failure);await assert.rejects(()=>actor==='admin'?h.reset():h.change(),/Injected/);h.db.failures.clear();
  assert.equal((await h.db.manager.findUnique({where:{id:h.managers[0].id}})).passwordHash,initialHash);for(const t of [a,b]){h.use(t);assert.ok(await h.session.getCurrentSession());}
 });
}
