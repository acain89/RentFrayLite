import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const base='88d9f1ab0d136961eac7c9258cce1c88bb923a53';
const normal=s=>s.replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
const original=file=>normal(execFileSync('git',['show',base+':'+file],{encoding:'utf8',windowsHide:true}));
export function assertUnchangedAchCore(){
 for(const file of ['lib/accountCode.ts','lib/verifiedLookupIp.ts','lib/publicRequestBudget.ts','proxy.ts','app/api/setup/account-code/route.ts','app/api/setup/account-code/availability/route.ts','lib/auth.ts','lib/session.ts','lib/passwordRecovery.ts','lib/propertyBillingCalendar.ts','lib/financialState.ts','lib/checkoutCalendar.ts','lib/checkoutLifecycle.ts','lib/checkoutRetry.ts','lib/checkoutBusinessLock.ts','lib/stripePaymentContext.ts','lib/customerRefundObservation.ts','lib/directFinancialReconciliation.ts','lib/directFinancialObservation.ts','lib/transactionReporting.ts','lib/transactionReportView.ts','lib/instantPayoutPolicy.ts','lib/instantPayoutLifecycle.ts','lib/paymentArchitecturePolicy.ts','lib/stripeProvisioningAttempt.ts'])assert.equal(normal(readFileSync(file,'utf8')),original(file),file+' remains production-identical');
}
export function assertAdditivePushSchema(){
 const schema=normal(readFileSync('prisma/schema.prisma','utf8'));
 const cutoff=schema.indexOf('// Additive only: historical SMS and CARD records remain untouched.');assert.ok(cutoff>0);
 const existing=schema.slice(0,cutoff).replace(/^  pushSubscriptions ManagerPushSubscription\[\]\n/gm,'').replace(/^  pushEvents PushEvent\[\]\n/gm,'');
 const lines=s=>s.split('\n').map(l=>l.trimEnd()).filter(l=>l.trim()).join('\n');assert.equal(lines(existing),lines(original('prisma/schema.prisma')),'All previous models, columns, enum values and indexes remain intact');
 const visit=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){assert.equal(e.isSymbolicLink(),false);const f=path.join(dir,e.name);if(e.isDirectory())visit(f);else if(!f.includes('20261122010000_manager_web_push'))assert.equal(normal(readFileSync(f,'utf8')),original(f.replaceAll('\\','/')),f);}};visit('prisma/migrations');
 const sql=readFileSync('prisma/migrations/20261122010000_manager_web_push/migration.sql','utf8');assert.equal((sql.match(/CREATE TABLE /g)||[]).length,3);assert.doesNotMatch(sql,/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER TABLE .*DROP)\b/m);
 for(const name of ['Payment','SmsReceipt','SmsNotification','SmsSuppression'])assert.doesNotMatch(sql,new RegExp('^\\s*(?:ALTER TABLE|INSERT INTO) "'+name+'"','m'));
}
export function assertCheckoutMethodBoundary(){
 const file='app/api/public/checkout/start/route.ts',before=original(file);let after=normal(readFileSync(file,'utf8'));
 const gate='  if (checkoutSession.paymentMethod !== PaymentMethod.ACH) return NextResponse.json({ error: "Only ACH bank-account payments are accepted. Please begin a new payment." }, { status: 400 });\n\n';assert.equal(after.split(gate).length,2);after=after.replace(gate,'');
 const methods=before.match(/payment_method_types:\s*checkoutSession.paymentMethod\s*===\s*PaymentMethod.ACH\s*\? \["us_bank_account"\]\s*: \["card"\]/);assert.ok(methods);assert.equal(after.split('payment_method_types: ["us_bank_account"]').length,2);after=after.replace('payment_method_types: ["us_bank_account"]',methods[0]);assert.equal(after,before,'Checkout changes only the ACH-only guard and provider method allowlist');
}
export function assertAchDependencyBoundary(){
 const before=JSON.parse(original('package.json')),after=JSON.parse(readFileSync('package.json','utf8'));
 assert.equal(after.dependencies.twilio,undefined);assert.equal(after.dependencies['web-push'],'4.0.0');assert.ok(after.devDependencies['@types/web-push']);
 delete before.dependencies.twilio;delete after.dependencies['web-push'];delete after.devDependencies['@types/web-push'];assert.deepEqual(after,before,'No unrelated package configuration or dependency versions change');
 const oldLock=JSON.parse(original('package-lock.json')),newLock=JSON.parse(readFileSync('package-lock.json','utf8'));
 const resolve=(packages,owner,name)=>{let parent=owner;for(;;){const key=(parent?parent+'/':'')+'node_modules/'+name;if(packages[key])return key;if(!parent)return null;const slash=parent.lastIndexOf('/');parent=slash<0?'':parent.slice(0,slash);}};
 const seen=new Set();const compare=(oldPath,newPath)=>{const pair=oldPath+'|'+newPath;if(seen.has(pair))return;seen.add(pair);assert.ok(newPath,'Retained dependency resolves: '+oldPath);const old=oldLock.packages[oldPath],next=newLock.packages[newPath];for(const key of ['version','resolved','integrity'])assert.equal(next[key],old[key],oldPath+' '+key+' unchanged');for(const name of Object.keys({...old.dependencies,...old.optionalDependencies})){const a=resolve(oldLock.packages,oldPath,name),b=resolve(newLock.packages,newPath,name);if(a)compare(a,b);}};
 // Npm may re-hoist packages used only by removed Twilio/new Web Push. Compare
 // every retained consumer's actual resolution graph, not a reused folder name.
 for(const name of Object.keys({...before.dependencies,...before.devDependencies}))compare(resolve(oldLock.packages,'',name),resolve(newLock.packages,'',name));
}
