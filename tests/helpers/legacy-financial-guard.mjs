import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {historicalCheckoutSource} from './checkout-financial-source.mjs';

// These full-file pins come from the independently verified Stage 6 snapshot,
// not from the source under test. No new non-schema normalization is allowed.
const approved=JSON.parse(readFileSync(new URL('../fixtures/legacy-financial-baseline.json',import.meta.url),'utf8'));
assert.equal(approved.historicalCommit,'223b6f853bf94475f30ca76a73ab85404307fd7c');
export const legacySourceDigest=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
export function assertLegacyFinancialSource(file,current,original){
  if(file==='prisma/schema.prisma'){
    // Existing shared adapter requires both exact, uniquely placed refund
    // additions, including every field, relation, constraint and index.
    assert.equal(historicalCheckoutSource(file,current),original.replaceAll('\r\n','\n'),file);
  }else if(Object.hasOwn(approved.approvedSourceHashes,file)){
    assert.equal(legacySourceDigest(current),approved.approvedSourceHashes[file],file+' approved whole-file baseline');
  }else{
    assert.equal(current.replaceAll('\r\n','\n'),original.replaceAll('\r\n','\n'),file);
  }
}
export function readLegacyMigrationHashes(){
  const result={};
  function visit(dir){
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      assert.ok(!entry.isSymbolicLink(),'Migration history must not follow links');
      if(entry.isDirectory())visit(file);
      else{assert.ok(entry.isFile());result[file.replaceAll('\\','/')]=legacySourceDigest(readFileSync(file,'utf8'));}
    }
  }
  visit('prisma/migrations');return result;
}
export function assertLegacyMigrationHashes(current){
  assert.deepEqual(current,approved.migrationHashes,'Exact approved 24-migration history and lock file');
}
