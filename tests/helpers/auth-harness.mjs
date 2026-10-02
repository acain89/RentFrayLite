import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import bcrypt from 'bcryptjs';
import { postgres } from './checkout-harness.mjs';
const require=createRequire(import.meta.url), root=path.resolve(import.meta.dirname,'../..'), enums=require('@prisma/client');
const compiled=new Map(), initialHash=await bcrypt.hash('old-password',12), adminHash=await bcrypt.hash('isolated-admin-passphrase',12);
const clone=x=>structuredClone(x);
function isolated(){
 let state={manager:[],adminAccess:[],business:[],session:[],auditLog:[]},queue=Promise.resolve();const failures=new Set();
 const matches=(r,w={})=>Object.entries(w).every(([k,v])=>v && typeof v === 'object' && 'gt' in v ? r[k]>v.gt : r[k]===v);
 const defer=fn=>({then:(yes,no)=>Promise.resolve().then(fn).then(yes,no),execute:fn});
 const db={failures,now:new Date(),$queryRaw:async q=>{if(/clock_timestamp/.test(q.sql))return [{now:db.now}];assert.match(q.sql,/FOR (?:NO KEY )?UPDATE|pg_advisory_xact_lock/);return [];}};
 const hydrate=(name,r,include)=>{
  if(!r)return null;const row=clone(r);
  if(name==='manager'&&include?.business)row.business=clone(state.business.find(b=>b.id===r.businessId)??null);
  if(name==='business'&&include?.manager)row.manager=clone(state.manager.find(m=>m.businessId===r.id)??null);
  if(name==='session'&&include){row.manager=hydrate('manager',state.manager.find(m=>m.id===r.managerId),{business:true});row.business=clone(state.business.find(b=>b.id===r.businessId)??null);row.adminAccess=clone(state.adminAccess.find(a=>a.id===r.adminAccessId)??null);}
  return row;
 };
 for(const name of Object.keys(state))db[name]={
  create:({data})=>defer(()=>{if(failures.has(name+'.create'))throw Error('Injected create failure');const row={id:randomUUID(),isActive:true,managerId:null,adminAccessId:null,businessId:null,lastUsedAt:new Date(),createdAt:new Date(),...clone(data)};state[name].push(row);return clone(row);}),
  findUnique:({where,include})=>defer(()=>hydrate(name,state[name].find(r=>matches(r,where)),include)),
  count:({where={}}={})=>defer(()=>state[name].filter(r=>matches(r,where)).length),
  findMany:({where={}}={})=>defer(()=>clone(state[name].filter(r=>matches(r,where)))),
  update:({where,data})=>defer(()=>{if(failures.has(name+'.update'))throw Error('Injected update failure');const r=state[name].find(r=>matches(r,where));if(!r)throw Error('Record not found');Object.assign(r,clone(data));return clone(r);}),
  updateMany:({where,data})=>defer(()=>{let count=0;for(const r of state[name].filter(r=>matches(r,where))){Object.assign(r,clone(data));count++;}return {count};}),
  deleteMany:({where={}}={})=>defer(()=>{if(failures.has(name+'.deleteMany'))throw Error('Injected revoke failure');const rows=state[name].filter(r=>matches(r,where));state[name]=state[name].filter(r=>!matches(r,where));return {count:rows.length};}),
 };
 db.$transaction=async ops=>{const prior=queue;let release;queue=new Promise(r=>release=r);await prior;const saved=clone(state);try{return Array.isArray(ops)?await Promise.all(ops.map(op=>op.execute())):await ops(db);}catch(e){state=saved;throw e;}finally{release();}};
 return db;
}
export async function authHarness(backend='isolated', sharedDb, services={}, environment={NODE_ENV:'production'}){
 const db=sharedDb ?? (backend==='postgres'?postgres:isolated());const suffix=randomUUID();const jar=new Map(),cookieOptions=[];let readonly=false;
 const businesses=[],managers=[],admins=[];
 for(let n=0;n<2;n++){
  const b=await db.business.create({data:{name:'B5 test',ownerName:'Test',contactEmail:`business-${n}-${suffix}@example.test`,status:'ACTIVE',setupCompletedAt:new Date()}});businesses.push(b);
  managers.push(await db.manager.create({data:{businessId:b.id,email:`manager-${n}-${suffix}@example.test`,passwordHash:initialHash}}));
  admins.push(await db.adminAccess.create({data:{codeHash:adminHash}}));
 }
 const mocks={
  'node:buffer':require('node:buffer'),'node:crypto':require('node:crypto'),'@prisma/client':enums,'@/lib/prisma':{prisma:db},'bcryptjs':{__esModule:true,default:bcrypt},'zod':require('zod'),
  'next/headers':{cookies:async()=>({get:k=>jar.has(k)?{value:jar.get(k)}:undefined,set:(k,v,o)=>{if(readonly)throw Error('Cookies can only be modified in a Server Action or Route Handler.');jar.set(k,v);cookieOptions.push(o);}})},
  'next/server':{NextResponse:{json:(body,opts)=>Response.json(body,opts),redirect:url=>new Response(null,{status:307,headers:{location:String(url)}})}},'next/navigation':{redirect:url=>{throw Error('REDIRECT '+url);}},
  'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{__esModule:true,default:()=>null},
  './SecuritySettingsClient':{__esModule:true,default:()=>null},'./AdminDashboardClient':{__esModule:true,default:()=>null},
  '@/lib/adminDashboard':{getAdminDashboardData:async()=>({})},
 };
 Object.assign(mocks,services);
 const cache=new Map();function load(p){if(cache.has(p))return cache.get(p);const file=path.join(root,p);if(!compiled.has(p))compiled.set(p,ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText);
  const mod={exports:{}};vm.runInThisContext('(function(require,module,exports,process){'+compiled.get(p)+'})',{filename:file})(n=>{if(Object.hasOwn(mocks,n))return mocks[n];if(n.startsWith('@/lib/'))return load(n.slice(2)+'.ts');throw Error('Unexpected import '+n);},mod,mod.exports,{env:environment});cache.set(p,mod.exports);return mod.exports;
 }
 const session=load('lib/session.ts'),auth=load('lib/auth.ts');
 const token=()=>jar.get('rfl_session');const use=t=>jar.set('rfl_session',t);const request=body=>new Request('https://example.test/api',{method:'PATCH',body:JSON.stringify(body)});
 async function issue(type='MANAGER',index=0){if(type==='MANAGER'){const m=await db.manager.findUnique({where:{id:managers[index].id}});await session.createManagerSession({managerId:m.id,businessId:m.businessId,passwordHash:m.passwordHash,email:m.email});}else{const a=await db.adminAccess.findUnique({where:{id:admins[index].id}});await session.createAdminSession(a.id,a.codeHash);}return token();}
 const change=body=>load('app/api/manager/security/route.ts').PATCH(request({action:'PASSWORD',currentPassword:'old-password',newPassword:'new-password',confirmPassword:'new-password',...body}));
 const reset=(index=0,body={})=>load('app/api/admin/businesses/[businessId]/credentials/route.ts').PATCH(request({password:'new-password',confirmPassword:'new-password',...body}),{params:Promise.resolve({businessId:businesses[index].id})});
 return {db,jar,cookieOptions,businesses,managers,admins,session,auth,load,token,use,issue,change,reset,readonly:value=>{readonly=value;},request};
}
export {postgres,initialHash};
