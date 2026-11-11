import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);
  const source=ts.transpileModule(readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:file})(name=>{
    if(name==='@/lib/publicMetadata'||name==='./lib/publicMetadata')return load('lib/publicMetadata.ts');
    throw Error('Unexpected metadata dependency '+name);
  },mod,mod.exports);cache.set(file,mod.exports);return mod.exports;
}
const {PUBLIC_MARKETING_PATHS,RFL_PUBLIC_ORIGIN}=load('lib/publicMetadata.ts');
const sitemap=load('app/(marketing)/sitemap.ts').default,robots=load('app/robots.ts').default;
const expected=['/','/contact','/support','/security','/privacy','/terms'];

test('sitemap uses the product-owner-confirmed HTTPS origin and only existing public pages',()=>{
  assert.equal(RFL_PUBLIC_ORIGIN,'https://rentfraylite.com');assert.deepEqual(PUBLIC_MARKETING_PATHS,expected);
  const entries=sitemap();assert.equal(entries.length,6);assert.equal(new Set(entries.map(row=>row.url)).size,6);
  for(const [index,row]of entries.entries()){
    const url=new URL(row.url);assert.equal(url.origin,RFL_PUBLIC_ORIGIN);assert.equal(url.pathname,expected[index]);assert.equal(url.search,'');assert.equal(url.hash,'');
    readFileSync(path.join(root,'app',url.pathname,'page.tsx'));
  }
});
test('robots uses correct metadata conventions and references the canonical sitemap',()=>{
  const result=robots();assert.equal(result.host,RFL_PUBLIC_ORIGIN);assert.equal(result.sitemap,RFL_PUBLIC_ORIGIN+'/sitemap.xml');
  assert.equal(result.rules.userAgent,'*');assert.equal(result.rules.disallow,'/');
  assert.deepEqual(result.rules.allow,[...expected.map(p=>p+'$'),'/sitemap.xml$','/robots.txt$','/_next/static/']);
});
const privatePaths=['/AB-1234','/AB-1234/review','/checkout','/checkout/','/login','/login/manager','/login/admin','/login/manager/reset-password','/setup','/setup/verify-email','/setup/recurring/tiers','/manager','/manager/dashboard','/admin','/api/public/checkout/session','/api/public/checkout/start','/api/internal/sms/process','/internal','/payment','/payment/success','/download','/contact-preview'];
for(const url of privatePaths)test('robots and sitemap exclude '+url,()=>{
  const rules=robots().rules;
  const allowed=rules.allow.some(pattern=>new RegExp('^'+pattern.replace(/[.*+?^{}()|[\]\\]/g,'\\$&').replace(/\\\$$/,'$')).test(url));
  assert.equal(allowed,false);assert.equal(sitemap().some(entry=>new URL(entry.url).pathname===url),false);
});
test('metadata ignores local/test environment and contains no build-time fake modification dates',()=>{
  for(const file of ['lib/publicMetadata.ts','app/robots.ts','app/(marketing)/sitemap.ts'])assert.doesNotMatch(readFileSync(path.join(root,file),'utf8'),/process\.env|request\.headers|new Date\(/);
});
test('public metadata base uses the canonical origin',()=>{
  const source=readFileSync(path.join(root,'app/layout.tsx'),'utf8');assert.match(source,/metadataBase: new URL\(RFL_PUBLIC_ORIGIN\)/);assert.doesNotMatch(source,/localhost|NEXT_PUBLIC_BASE_URL/);
});
test('nonmarketing responses default to noindex without changing credential privacy headers',async()=>{
  const config=load('next.config.ts').default,headers=await config.headers();
  const broad=headers.find(rule=>rule.source.startsWith('/:path('));assert.ok(broad);
  const {pathToRegexp}=require('next/dist/compiled/path-to-regexp');const matches=pathToRegexp(broad.source);
  for(const route of privatePaths)assert.equal(matches.test(route),true,route);
  assert.equal(matches.test('/_next/static/chunks/app.js'),true);
  for(const route of expected)assert.equal(matches.test(route),false,route);
  assert.deepEqual(broad.headers,[{key:'X-Robots-Tag',value:'noindex, nofollow'}]);
  for(const route of ['/login/manager/forgot-password','/login/manager/reset-password','/api/auth/forgot-password','/api/auth/reset-password']){
    const rule=headers.find(row=>row.source===route);assert.ok(rule);assert.ok(rule.headers.some(h=>h.key==='Cache-Control'&&h.value==='no-store, max-age=0'));assert.ok(rule.headers.some(h=>h.key==='Referrer-Policy'&&h.value==='no-referrer'));
  }
});

const copyScript=path.join(root,'scripts/copy-standalone-assets.mjs');
test('production startup uses only the packaged standalone assets and dependencies are unchanged',()=>{
  const current=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  const prior=JSON.parse(execFileSync('git',['show','223b6f853bf94475f30ca76a73ab85404307fd7c:package.json'],{cwd:root,encoding:'utf8',windowsHide:true}));
  assert.equal(current.scripts.start,'node .next/standalone/server.js');
  assert.equal(current.scripts.build,'node scripts/copy-standalone-assets.mjs --check-release-inputs && next build --webpack && node scripts/copy-standalone-assets.mjs');
  assert.deepEqual(current,{...prior,scripts:{...prior.scripts,start:current.scripts.start,build:current.scripts.build}});
  assert.equal(readFileSync(path.join(root,'package-lock.json'),'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','223b6f853bf94475f30ca76a73ab85404307fd7c:package-lock.json'],{cwd:root,encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n'));
});
async function fixture(t){
  const parent=path.resolve(os.tmpdir()),dir=await mkdtemp(path.join(parent,'rfl-metadata-package-'));
  t.after(async()=>{
    const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('rfl-metadata-package-'));
    await rm(resolved,{recursive:true,force:true});
  });
  await mkdir(path.join(dir,'public'),{recursive:true});await mkdir(path.join(dir,'.next/static/chunks'),{recursive:true});
  await writeFile(path.join(dir,'public/app-release-signed.apk'),'immutable dummy historical artifact');await writeFile(path.join(dir,'public/approved.txt'),'approved asset');await writeFile(path.join(dir,'.next/static/chunks/app.js'),'approved generated code');
  return dir;
}
test('standalone copying omits only the legacy APK, preserves source bytes, and removes stale output',async t=>{
  const dir=await fixture(t),source=path.join(dir,'public/app-release-signed.apk'),before=await readFile(source);
  const out=path.join(dir,'.next/standalone/public');await mkdir(out,{recursive:true});await cp(source,path.join(out,'app-release-signed.apk'));
  for(let i=0;i<2;i++){
    execFileSync(process.execPath,[copyScript],{cwd:dir,windowsHide:true});
    await assert.rejects(access(path.join(out,'app-release-signed.apk')),error=>error.code==='ENOENT');
    assert.equal(await readFile(path.join(out,'approved.txt'),'utf8'),'approved asset');assert.equal(await readFile(path.join(dir,'.next/standalone/.next/static/chunks/app.js'),'utf8'),'approved generated code');
    assert.deepEqual(await readFile(source),before);
  }
});
test('production preflight refuses conflicting historical metadata without touching it or build output',async t=>{
  const dir=await fixture(t),artifact=path.join(dir,'app/sitemap.ts');await mkdir(path.dirname(artifact),{recursive:true});await writeFile(artifact,'preserved historical metadata');
  const before=await readFile(artifact);
  const result=spawnSync(process.execPath,[copyScript,'--check-release-inputs'],{cwd:dir,encoding:'utf8',windowsHide:true});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Refusing production build: preserved app\/sitemap.ts/);
  assert.deepEqual(await readFile(artifact),before);await assert.rejects(access(path.join(dir,'.next/standalone')),error=>error.code==='ENOENT');
});
test('production preflight accepts clean release inputs without generating assets',async t=>{
  const dir=await fixture(t);execFileSync(process.execPath,[copyScript,'--check-release-inputs'],{cwd:dir,windowsHide:true});
  await assert.rejects(access(path.join(dir,'.next/standalone')),error=>error.code==='ENOENT');
});
test('asset copying fails closed if output points to historical source assets',async t=>{
  const dir=await fixture(t),source=path.join(dir,'public/app-release-signed.apk'),before=await readFile(source),standalone=path.join(dir,'.next/standalone');
  await mkdir(standalone,{recursive:true});await symlink(path.join(dir,'public'),path.join(standalone,'public'),'junction');
  const result=spawnSync(process.execPath,[copyScript],{cwd:dir,encoding:'utf8',windowsHide:true});assert.notEqual(result.status,0);assert.match(result.stderr,/Public asset output must stay inside standalone output/);assert.deepEqual(await readFile(source),before);
});
test('the historical APK remains byte-identical to the committed baseline',()=>{
  const file='public/app-release-signed.apk',original=execFileSync('git',['show','223b6f853bf94475f30ca76a73ab85404307fd7c:'+file],{cwd:root,maxBuffer:5_000_000,windowsHide:true});
  const digest=data=>createHash('sha256').update(data).digest('hex');assert.equal(digest(readFileSync(path.join(root,file))),digest(original));
});
