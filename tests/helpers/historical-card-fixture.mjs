import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';
const require=createRequire(import.meta.url),base='88d9f1ab0d136961eac7c9258cce1c88bb923a53';
// Test-only, immutable historical records. Never used to issue a current quote.
// Only these three pure/preparation files may be read from production history;
// current webhook, refund and reconciliation code remain under test.
const permitted=new Set(['lib/platformFees.ts','lib/rflDirectPricing.ts','lib/directPaymentFoundation.ts']);
function historical(file,h,cache=new Map()){
 if(cache.has(file))return cache.get(file);if(!permitted.has(file))throw Error('Historical fixture source denied');
 const source=execFileSync('git',['show',base+':'+file],{encoding:'utf8',windowsHide:true});const text=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const mod={exports:{}};
 vm.runInThisContext('(function(require,module,exports){'+text+'})',{filename:'historical-fixture/'+file})(name=>{
  if(name==='@/lib/rflDirectPricing')return historical('lib/rflDirectPricing.ts',h,cache);
  if(name.startsWith('@/lib/')&&h)return h.load(name.slice(2)+'.ts');
  if(name==='@prisma/client'||name==='node:util')return require(name);
  throw Error('Unexpected historical fixture import '+name);
 },mod,mod.exports);cache.set(file,mod.exports);return mod.exports;
}
export const historicalCardFee=cents=>historical('lib/platformFees.ts').getCardPlatformFeeCents(cents);
export const historicalCardFoundation=h=>historical('lib/directPaymentFoundation.ts',h);
