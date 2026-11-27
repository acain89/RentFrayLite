import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { runInThisContext } from "node:vm";
import ts from "typescript";
﻿import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tsImport } from "tsx/esm/api";
import { postgres } from "./helpers/checkout-harness.mjs";
const { loadDisposableConfig, verifyDisposableIdentity } = await tsImport("../lib/disposableDatabase.ts",import.meta.url);
// Execute the actual transpiled seed with actual dependencies. This avoids tsx's
// namespaced CJS extensionless-resolution limitation in this MJS test harness.
const require=createRequire(import.meta.url),holder={exports:{}};
const seedDependencies={"bcryptjs":require("bcryptjs"),"../lib/adminCredential":await tsImport("../lib/adminCredential.ts",import.meta.url),"../lib/disposableDatabase":await tsImport("../lib/disposableDatabase.ts",import.meta.url)};
runInThisContext('(function(require,module,exports,process,console){'+ts.transpileModule(readFileSync("prisma/seed.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText+'})')(name=>{assert.ok(Object.hasOwn(seedDependencies,name),"Unexpected seed dependency");return seedDependencies[name];},holder,holder.exports,process,console);
const {seedDisposableAdministrator}=holder.exports;
test("administrator seed CLI fails closed without proof and never prints the credential",()=>{const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>["PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TEMP","TMP","USERPROFILE","APPDATA","LOCALAPPDATA"].includes(key.toUpperCase())));const result=spawnSync(process.execPath,["--import","tsx","prisma/seed.ts","--scope=seed-admin"],{encoding:"utf8",env:{...clean,SEED_ADMIN_CODE:"000123"},windowsHide:true});assert.equal(result.status,1);assert.match(result.stderr,/seed rejected/);assert.doesNotMatch(result.stdout+result.stderr,/000123|postgresql:\/\//);});
if(postgres)test("PostgreSQL disposable seed is dry-run by default, scoped and preserves unrelated administrator sessions",async()=>{
 const config=loadDisposableConfig(),unrelated="unrelated-fixture-"+randomUUID(),owned="rfl-fixture-admin-"+config.nonce;
 const administrator=await postgres.adminAccess.create({data:{id:unrelated,codeHash:"synthetic-existing-hash"}});
 const session=await postgres.session.create({data:{tokenHash:randomUUID(),type:"ADMIN",adminAccessId:unrelated,expiresAt:new Date(Date.now()+60000)}});
 try {
  assert.equal((await seedDisposableAdministrator(config,"000123")).applied,false);
  assert.equal(await postgres.adminAccess.count({where:{id:owned}}),0);
  await seedDisposableAdministrator(config,"000123",true);await seedDisposableAdministrator(config,"000123",true);
  assert.equal(await postgres.adminAccess.count({where:{id:owned}}),1);
  assert.deepEqual(await postgres.adminAccess.findUnique({where:{id:unrelated}}),administrator);
  assert.deepEqual(await postgres.session.findUnique({where:{id:session.id}}),session);
  await assert.rejects(()=>seedDisposableAdministrator({...config,host:"production.invalid"},"000123",true),/PROOF_REJECTED/);
  assert.deepEqual(await postgres.session.findUnique({where:{id:session.id}}),session);
 }finally{
  await verifyDisposableIdentity(postgres,config,"seed-admin");
  await postgres.session.deleteMany({where:{id:session.id,adminAccessId:unrelated}});
  await postgres.adminAccess.deleteMany({where:{id:{in:[owned,unrelated]}}});
 }
});
