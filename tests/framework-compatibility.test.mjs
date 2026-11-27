import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clientDeltas } from "./helpers/reviewed-framework-compatibility.mjs";
import { restoreSecurityLock, restoreSecurityPackage } from "./helpers/reviewed-security-dependencies.mjs";
const base="9957028aefff5cdc9072ebcb2401013dc8de1b78";
const original=file=>execFileSync("git",["show",base+":"+file],{encoding:"utf8"}).replace(/\r\n/g,"\n");
for(const [file,deltas] of Object.entries(clientDeltas))test("framework correction preserves every unreviewed client byte: "+file,()=>{
 const lines=original(file).split("\n"),output=[];let cursor=0;
 for(const d of deltas){const start=d.count===0?d.start:d.start-1;assert.deepEqual(lines.slice(start,start+d.count),d.removed);output.push(...lines.slice(cursor,start),...d.added);cursor=start+d.count;}
 output.push(...lines.slice(cursor));const expected=output.join("\n"),actual=readFileSync(file,"utf8").replace(/\r\n/g,"\n");assert.equal(actual,expected);assert.throws(()=>assert.equal(actual+"\n// unauthorized financial change",expected));
 if(actual.includes("JSON.stringify"))assert.throws(()=>assert.equal(actual.replace("JSON.stringify","unapprovedPayload"),expected));
});
test("security dependency restoration permits only the exact reviewed lock entries",()=>{const lock=JSON.parse(readFileSync("package-lock.json","utf8"));assert.deepEqual(restoreSecurityLock(lock),JSON.parse(original("package-lock.json")));const changed=structuredClone(lock);changed.packages["node_modules/next"].version="0.0.0";assert.throws(()=>restoreSecurityLock(changed));const unrelated=structuredClone(lock);unrelated.packages["node_modules/react"].version="0.0.0";assert.notDeepEqual(restoreSecurityLock(unrelated),JSON.parse(original("package-lock.json")));});
test("security package change preserves unrelated direct dependencies and commands",()=>assert.deepEqual(restoreSecurityPackage(JSON.parse(readFileSync("package.json","utf8"))),JSON.parse(original("package.json"))));
test("financial, authentication, authorization and schema sources remain byte-equivalent",()=>{const files=execFileSync("git",["ls-tree","-r","--name-only",base,"--","lib","app/api","prisma"],{encoding:"utf8"}).trim().split("\n").filter(f=>f!=="prisma/seed.ts");for(const f of files)assert.equal(readFileSync(f,"utf8").replace(/\r\n/g,"\n"),original(f),f);});
for(const destination of ["/login/manager","/login/manager?source=credential-change"])test("credential navigation replaces the document with exact same-origin destination "+destination,()=>{const locations=[],holder={exports:{}};runInNewContext(ts.transpileModule(readFileSync("lib/sessionDocumentNavigation.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:holder,exports:holder.exports,URL,window:{location:{origin:"https://example.test",assign:url=>locations.push(url)}}});holder.exports.navigateSessionDocument(destination);assert.deepEqual(locations,["https://example.test"+destination]);});
for(const destination of ["//external.invalid/","https://external.invalid/","/\\external.invalid/","relative","javascript:alert(1)"])test("credential navigation rejects invalid destination "+destination,()=>{const holder={exports:{}};runInNewContext(ts.transpileModule(readFileSync("lib/sessionDocumentNavigation.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:holder,exports:holder.exports,URL,window:{location:{origin:"https://example.test",assign(){assert.fail("No navigation permitted");}}}});assert.throws(()=>holder.exports.navigateSessionDocument(destination));});
