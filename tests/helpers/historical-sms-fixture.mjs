import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const base='5949a40a5ff67ba36df970406cb886b5682419f5';
const permitted=new Set(['lib/smsConsent.ts','lib/smsNotifications.ts','lib/smsDelivery.ts']);
/** Archived SMS behavior only. Never imported by production or evidence of current delivery. */
export function historicalSmsFixture(h){
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file);
  if(!permitted.has(file))throw Error('Historical SMS fixture source denied');
  const source=execFileSync('git',['show',base+':'+file],{encoding:'utf8',windowsHide:true});
  const text=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  vm.runInThisContext('(function(require,module,exports){'+text+'})',{filename:'historical-fixture/'+file})(name=>{
   if(name==='twilio')return {default:()=>{throw Error('Historical provider construction forbidden');}};
   if(name==='@prisma/client'||name==='node:crypto')return require(name);
   if(name.startsWith('@/lib/')){const dependency=name.slice(2)+'.ts';return permitted.has(dependency)?load(dependency):h.load(dependency);}
   throw Error('Unexpected historical SMS fixture import '+name);
  },mod,mod.exports);
  cache.set(file,mod.exports);return mod.exports;
 }
 return {load};
}
