import { assertCheckoutStartSource, historicalCheckoutSource } from './helpers/checkout-financial-source.mjs';
import { assertCheckoutFinancialSource } from './helpers/checkout-financial-source.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {reportingFixture,postgres} from "./helpers/reporting-harness.mjs";
const pure=await reportingFixture(),calendar=pure.calendar,view=pure.view;
for(const [instant,zone,cycle]of [
 ["2026-11-01T04:59:59.999Z","America/Chicago","2026-10"],["2026-11-01T05:00:00Z","America/Chicago","2026-11"],
 ["2027-01-01T05:59:59.999Z","America/Chicago","2026-12"],["2027-01-01T06:00:00Z","America/Chicago","2027-01"],
 ["2026-11-01T06:59:59Z","America/Los_Angeles","2026-10"],["2026-11-01T07:00:00Z","America/Los_Angeles","2026-11"],
 ["2026-11-01T00:00:00Z",null,"2026-11"]])
 test("property-local cycle "+instant+" "+zone,()=>assert.equal(pure.dashboard.getCurrentBillingCycle(new Date(instant),zone),cycle));
for(const [date,zone,expected]of [
 ["2026-03-08","America/Chicago","2026-03-08T06:00:00.000Z"],["2026-03-09","America/Chicago","2026-03-09T05:00:00.000Z"],
 ["2026-11-01","America/Chicago","2026-11-01T05:00:00.000Z"],["2026-11-02","America/Chicago","2026-11-02T06:00:00.000Z"],
 ["2028-02-29","America/New_York","2028-02-29T05:00:00.000Z"]])
 test("local day start "+date+" "+zone,()=>assert.equal(calendar.reportingDayStart(date,zone).toISOString(),expected));
test("DST report days have actual 23/25-hour lengths, not fixed UTC windows",()=>{for(const [start,end,hours]of [["2026-03-08","2026-03-09",23],["2026-11-01","2026-11-02",25]])assert.equal((calendar.reportingDayStart(end,"America/Chicago")-calendar.reportingDayStart(start,"America/Chicago"))/3600000,hours);});
test("legacy timezone fallback is explicit UTC and invalid/missing values fail closed",()=>{assert.equal(calendar.reportingTimeZone(null),"UTC");for(const value of ["Invalid/Timezone","",undefined])assert.throws(()=>calendar.reportingTimeZone(value));assert.equal(calendar.reportingMonthRange("2026-12","UTC").lt.toISOString(),"2027-01-01T00:00:00.000Z");});
for(const q of ["from=2026-02-30","to=not-a-date","from=2026-11-02&to=2026-11-01","page=0","page=1.2","page=100000","page=1&page=2","status=PAID","status=UNPAID","method=CASH","type=TENANT","businessId=other","unit="+encodeURIComponent("a\nb"),"name="+"x".repeat(101)])
 test("reject invalid report query "+q.slice(0,60),()=>assert.throws(()=>view.parseReportFilters(new URLSearchParams(q))));
for(const [state,category,label]of [["PAID","SUCCESSFUL","Successful"],["PENDING","PENDING","Pending"],["FAILED","FAILED","Failed"],["RETURNED","FAILED","Failed (Returned)"],["DISPUTED","FAILED","Failed (Disputed)"]])
 test("primary category preserves detail: "+state,()=>{assert.equal(view.primaryPaymentStatus(state),category);assert.equal(view.paymentStatusLabel(state),label);});
for(const state of ["CREATED","CHECKOUT_STARTED","EXPIRED"])test("non-transaction state excluded: "+state,()=>assert.equal(view.primaryPaymentStatus(state),null));
for(const raw of ["=SUM(1,1)","+CMD","-CMD","@SUM","  =A1","\t=cmd","\r\n@cmd",String.fromCharCode(0)+"=cmd",String.fromCharCode(0xfeff)+"=cmd",'a,"b"\nc'])
 test("CSV escaping "+JSON.stringify(raw),()=>{const escaped=pure.report.csvEscape(raw);assert.ok(escaped.startsWith('"')&&escaped.endsWith('"'));if(raw!=='a,"b"\nc')assert.equal(escaped[1],"'");else assert.ok(escaped.includes(String.fromCharCode(34,34)));});
for(const backend of postgres?["isolated","postgres"]:["isolated"]){
 test(backend+": Standard attribution survives delayed settlement, return and current configuration changes",async()=>{const f=await reportingFixture(backend);const row=await f.seed({createdAt:new Date("2026-10-31T12:00:00Z"),billingCycle:"2026-10",status:"RETURNED",returnedAt:new Date("2026-11-15")});await f.seed({status:"PENDING",paidAt:null});const result=await f.dashboardPage("");assert.equal(result.props.payments.length,1);assert.equal(result.props.payments[0].status,"PENDING");const history=await f.list();const original=history.payments.find(p=>p.id===row.id);assert.equal(original.timestamp,row.createdAt.toISOString());assert.equal(original.statusLabel,"Failed (Returned)");assert.deepEqual(original.lineItemsSnapshot,row.lineItemsSnapshot);});
 test(backend+": Custom local month attribution includes lower boundary and excludes upper boundary",async()=>{const f=await reportingFixture(backend);for(const date of ["2026-11-01T04:59:59.999Z","2026-11-01T05:00:00Z","2026-12-01T05:59:59.999Z","2026-12-01T06:00:00Z"])await f.seed({sourceType:"CUSTOM_PAYMENT",sourceId:null,billingCycle:null,createdAt:new Date(date)});const result=await f.dashboardPage("");assert.equal(result.props.payments.length,2);assert.ok(result.props.payments.every(p=>p.paymentType==="Custom"));});
 test(backend+": date/name/unit/method/status/type filters use database query",async()=>{const f=await reportingFixture(backend);await f.seed({status:"RETURNED",returnedAt:new Date("2026-12-01")});await f.seed({payerFirstName:"Other",referenceLabel:"22",paymentMethod:"CARD",sourceType:"CUSTOM_PAYMENT",sourceId:null,billingCycle:null});const result=await f.list("from=2026-11-15&to=2026-11-15&name=jane+SMITH&unit=12&method=ACH&status=FAILED&type=STANDARD");assert.equal(result.total,1);assert.equal(result.payments[0].status,"RETURNED");assert.equal((await f.list("type=CUSTOM")).total,1);assert.equal((await f.list("name=Other&method=CARD")).total,1);assert.equal((await f.list("from=2026-12-01")).total,0);});
 test(backend+": inclusive local end date handles DST midnight precisely",async()=>{const f=await reportingFixture(backend);await f.seed({createdAt:new Date("2026-11-02T05:59:59.999Z")});await f.seed({createdAt:new Date("2026-11-02T06:00:00Z")});assert.equal((await f.list("from=2026-11-01&to=2026-11-01")).total,1);});
 test(backend+": only recorded transaction states appear, with exactly three primary categories",async()=>{const f=await reportingFixture(backend);for(const status of ["CREATED","CHECKOUT_STARTED","EXPIRED","PENDING","PAID","FAILED","RETURNED","DISPUTED"])await f.seed({status});const r=await f.dashboardPage("");assert.equal(r.props.total,5);assert.deepEqual(new Set(r.props.payments.map(p=>p.status)),new Set(["PENDING","SUCCESSFUL","FAILED"]));assert.equal((await f.list("status=FAILED")).total,3);assert.equal((await f.list("status=RETURNED")).total,1);});
 test(backend+": pagination is stable and complete CSV/print ignore page offset",async()=>{const f=await reportingFixture(backend);const first=await f.seed();const data={...first};delete data.id;await f.db.payment.createMany({data:Array.from({length:100},(_,n)=>({...data,payerFirstName:"Tenant"+n}))});const a=await f.list(""),b=await f.list("page=2"),c=await f.list("page=3");assert.equal(a.total,101);assert.equal(a.payments.length,50);assert.equal(b.payments.length,50);assert.equal(c.payments.length,1);assert.equal(new Set([...a.payments,...b.payments,...c.payments].map(p=>p.id)).size,101);const csv=await f.endpoint("page=2"),print=await f.endpoint("page=2&format=print");assert.equal(csv.status,200);assert.equal(print.status,200);assert.equal((await csv.text()).split("\r\n").length,102);assert.equal((await print.text()).match(/<tbody>([\s\S]*)<\/tbody>/)[1].match(/<tr>/g).length,101);});
 test(backend+": property authorization, revoked sessions and query tampering are enforced",async()=>{const f=await reportingFixture(backend);await f.seed();await f.seed({businessId:f.businesses[1].id,payerFirstName:"FOREIGN_PRIVATE"});assert.equal((await f.list()).total,1);assert.doesNotMatch(await (await f.endpoint("")).text(),/FOREIGN_PRIVATE/);assert.equal((await f.endpoint("businessId="+f.businesses[1].id)).status,400);await f.db.session.deleteMany({where:{managerId:f.managers[0].id}});await assert.rejects(()=>f.endpoint(""),/REDIRECT/);await assert.rejects(()=>f.history(""),/REDIRECT/);await assert.rejects(()=>f.dashboardPage(""),/REDIRECT/);});
 test(backend+": session revoked during report loading prevents response serialization",async()=>{const f=await reportingFixture(backend);await f.seed();const transaction=f.db.$transaction.bind(f.db);f.db.$transaction=async(fn,options)=>{const result=await transaction(fn,options);await f.db.session.deleteMany({where:{managerId:f.managers[0].id}});return result;};await assert.rejects(()=>f.endpoint(""),/REDIRECT/);});
 test(backend+": CSV formula safety, escaped print content and privacy share the same records",async()=>{const f=await reportingFixture(backend);await f.seed({payerFirstName:"=SUM(1,1)",itemDescription:"<script>alert(1)</script>",referenceLabel:"@UNIT"});const response=await f.endpoint("");assert.match(response.headers.get("cache-control"),/no-store/);const csv=await response.text();assert.match(csv,/'=SUM\(1,1\)/);assert.match(csv,/'@UNIT/);assert.doesNotMatch(csv,/5555551234|payerPhone|payerEmail/);const printed=await (await f.endpoint("format=print")).text();assert.doesNotMatch(printed,/<script>/);assert.match(printed,/&lt;script&gt;/);assert.match(printed,/Expected figures and estimated costs are not verified/);});
 test(backend+": estimates remain separate from verified costs and proceeds",async()=>{const f=await reportingFixture(backend);await f.seed({processorFeeCents:130,actualManagementNetCents:10000});let r=(await f.list()).payments[0];assert.equal(r.expectedProcessorFeeCents,119);assert.equal(r.verifiedProcessorFeeCents,null);assert.equal(r.verifiedManagementProceedsCents,null);const record=await f.seed({stripeBalanceTransactionId:"txn_observed",processorFeeCents:130,actualManagementNetCents:10001});r=(await f.list()).payments.find(p=>p.id===record.id);assert.equal(r.verifiedProcessorFeeCents,130);assert.equal(r.verifiedManagementProceedsCents,10001);assert.equal(r.expectedManagementProceedsCents,10000);});
 test(backend+": UTC legacy display compatibility never assigns a timezone",async()=>{const f=await reportingFixture(backend);await f.db.business.update({where:{id:f.business.id},data:{propertyTimeZone:null,firstStandardBillingDate:null}});await f.seed();const page=await f.history("");assert.equal(page.props.timeZone,"UTC");assert.equal(page.props.legacyTimeZone,true);assert.equal((await f.db.business.findUnique({where:{id:f.business.id}})).propertyTimeZone,null);});
}
test("oversize exports reject instead of silently truncating, with the same limit for print",async()=>{const f=await reportingFixture();f.db.payment.count=async()=>10001;f.db.payment.findMany=async()=>{throw Error("Oversized report must not load");};for(const q of ["","format=print"]){const response=await f.endpoint(q);assert.equal(response.status,413);assert.match(await response.text(),/Narrow/);}});
test("unexpected export options rejected",async()=>{const f=await reportingFixture();for(const q of ["format=pdf","format=csv&format=print","page=0"])assert.equal((await f.endpoint(q)).status,400);});

for(const backend of postgres?["isolated","postgres"]:["isolated"]){
 test(backend+": name and unit wildcard characters are literal identifiers",async()=>{
  const f=await reportingFixture(backend);await f.seed({payerFirstName:"Name%",referenceLabel:"A_1"});await f.seed({payerFirstName:"NameX",referenceLabel:"AX1"});
  assert.equal((await f.list("name=Name%25")).total,1);assert.equal((await f.list("unit=A_1")).total,1);
 });
 test(backend+": ACH across months keeps its original cycle and original transaction date through settlement and return",async()=>{
  const f=await reportingFixture(backend),row=await f.seed({billingCycle:"2026-10",createdAt:new Date("2026-10-31T23:00:00Z"),status:"PENDING",paidAt:null});
  for(const patch of [{status:"PENDING"},{status:"PAID",paidAt:new Date("2026-11-02T12:00:00Z")},{status:"RETURNED",returnedAt:new Date("2026-12-03T12:00:00Z")}]){
   await f.db.payment.update({where:{id:row.id},data:patch});assert.equal((await f.dashboardPage("")).props.total,0);
   const original=(await f.list("from=2026-10-31&to=2026-10-31")).payments[0];assert.equal(original.id,row.id);assert.equal(original.billingCycle,"2026-10");assert.equal(original.timestamp,row.createdAt.toISOString());
  }
 });
 test(backend+": dashboard/history/export/print never write payment records",async()=>{
  const f=await reportingFixture(backend);await f.seed();await f.seed({sourceType:"CUSTOM_PAYMENT",sourceId:null,billingCycle:null,status:"DISPUTED"});
  const before=await f.db.payment.findMany({where:{businessId:f.business.id},orderBy:[{id:"asc"}]});
  await f.dashboardPage("");await f.history("");await f.endpoint("");await f.endpoint("format=print");
  const after=await f.db.payment.findMany({where:{businessId:f.business.id},orderBy:[{id:"asc"}]});assert.deepEqual(after,before);
 });
}
if(postgres)test("postgres: changing current tiers/charges does not recalculate historical snapshots",async()=>{
 const f=await reportingFixture("postgres");const plan=await f.db.recurringPlan.create({data:{businessId:f.business.id,name:"Original tier",baseAmountCents:9000,dueDay:1,gracePeriodDays:5,charges:{create:{label:"Original mandatory charge",amountCents:1000}}},include:{charges:true}});
 const row=await f.seed({sourceId:plan.id});await f.db.recurringPlan.update({where:{id:plan.id},data:{name:"Changed tier",baseAmountCents:99999}});await f.db.recurringCharge.update({where:{id:plan.charges[0].id},data:{label:"Changed charge",amountCents:55555}});
 const report=(await f.list()).payments.find(p=>p.id===row.id);assert.equal(report.subtotalCents,10000);assert.deepEqual(report.lineItemsSnapshot,row.lineItemsSnapshot);assert.equal(report.itemDescription,"Original tier");
});
test("Existing Prisma schema and historical migrations remain unchanged; request counters are additive",()=>{
 const baseline="8a8f1c10e9370d0b27fc5d146686f229cd97b5df",normal=s=>s.replaceAll("\r\n","\n");
 const current=normal(historicalCheckoutSource("prisma/schema.prisma",readFileSync("prisma/schema.prisma","utf8")));
 const addition=/^\/\/ Short-lived public API counters, independent of tenant and financial records\.\nmodel PublicRequestBudget \{\n  key       String   @id\n  count     Int\n  expiresAt DateTime\n\n  @@index\(\[expiresAt\]\)\n\}\n\n/m;
 assert.match(current,addition);
 assert.equal(current.replace(addition,""),normal(execFileSync("git",["show",baseline+":prisma/schema.prisma"],{encoding:"utf8",windowsHide:true})));
 const files=execFileSync("git",["ls-tree","-r","--name-only",baseline,"--","prisma/migrations"],{encoding:"utf8",windowsHide:true}).trim().split(/\r?\n/);
 for(const file of files)assert.equal(normal(readFileSync(file,"utf8")),normal(execFileSync("git",["show",baseline+":"+file],{encoding:"utf8",windowsHide:true})),file);
 const sql=readFileSync("prisma/migrations/20261026050000_public_request_budgets/migration.sql","utf8");assert.doesNotMatch(sql,/^\s*(?:UPDATE|DELETE|DROP|ALTER|TRUNCATE)/m);
});
test("active Stripe, SMS, authentication, fees, reconciliation and payout gates remain unchanged",()=>{for(const file of ["lib/auth.ts","lib/session.ts","lib/passwordRecovery.ts","lib/platformFees.ts","lib/rflDirectPricing.ts","lib/directFinancialReconciliation.ts","lib/stripePaymentWebhook.ts","lib/smsDelivery.ts","lib/instantPayoutPolicy.ts","lib/instantPayoutLifecycle.ts","lib/paymentArchitecturePolicy.ts","app/api/public/checkout/session/route.ts"]){if(file==="app/api/public/checkout/session/route.ts"){assertCheckoutFinancialSource("c5e4572220859e49786ef6931d5384f12e2fdfb9");continue;}assert.equal(historicalCheckoutSource(file,readFileSync(file,"utf8")).replaceAll("\r\n","\n"),execFileSync("git",["show","c5e4572220859e49786ef6931d5384f12e2fdfb9:"+file],{encoding:"utf8",windowsHide:true}).replaceAll("\r\n","\n"),file);}for(const file of ["app/manager/dashboard/page.tsx","app/manager/dashboard/ManagerDashboardClient.tsx"])assert.doesNotMatch(readFileSync(file,"utf8"),/InstantPayout|instantPayout|delinquen|outstanding|unpaid|Collected|analytics/);});

test('checkout start ingress preserves the complete historical financial and authorization handler',()=>assertCheckoutStartSource('c5e4572220859e49786ef6931d5384f12e2fdfb9'));


// S6-IV-01: mutations are strings only; never write altered application files.
// Exercise the same whole-file guard used by the protected reporting contract.
const recoveryGuardFile = "lib/passwordRecovery.ts";
const recoveryGuardCurrent = readFileSync(recoveryGuardFile, "utf8").replaceAll("\r\n", "\n");
const recoveryGuardBaseline = execFileSync("git", ["show", "c5e4572220859e49786ef6931d5384f12e2fdfb9:" + recoveryGuardFile], { encoding: "utf8", windowsHide: true }).replaceAll("\r\n", "\n");
const assertRecoveryGuard = source => assert.equal(historicalCheckoutSource(recoveryGuardFile, source), recoveryGuardBaseline);
function replaceRecoveryOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, "Mutation must target exactly one original statement");
  return source.replace(before, after);
}

test("S6-IV-01 exact approved recovery deltas pass while the entire consume path stays byte-identical", () => {
  assertRecoveryGuard(recoveryGuardCurrent);
  const marker = "export async function consumeManagementPasswordReset";
  assert.equal(recoveryGuardCurrent.slice(recoveryGuardCurrent.indexOf(marker)), recoveryGuardBaseline.slice(recoveryGuardBaseline.indexOf(marker)));
  assertRecoveryGuard(recoveryGuardCurrent.replaceAll("\n", "\r\n"));
});

const recoveryMutations = [
  ["single-use consumption", 'if(consumed.count!==1)return false;', 'if(false)return false;'],
  ["credential binding", 'if(!token||token.type!=="PASSWORD_RESET"||token.usedAt||!token.credentialFingerprint)return false;', 'if(!token||token.type!=="PASSWORD_RESET"||token.usedAt)return false;'],
  ["credential fingerprint equality", 'managementCredentialFingerprint(manager)!==token.credentialFingerprint', 'false'],
  ["session revocation", 'await tx.session.deleteMany({where:{managerId:current.id}});', '// unauthorized removal of session revocation'],
  ["token expiry", 'if(token.expiresAt<=observedClock.now)return false;', 'if(false)return false;'],
  ["token lifetime", 'RESET_TOKEN_LIFETIME_MS=30*60*1000;', 'RESET_TOKEN_LIFETIME_MS=300*60*1000;'],
  ["reset-token hashing", 'createHash("sha256").update(token).digest("hex")', 'token'],
  ["outstanding-token revocation", 'await invalidateManagementResetTokens(tx,current.businessId,clock.now);', '// unauthorized removal of outstanding token revocation'],
  ["readiness removed", '  if(!passwordRecoveryReady(env))return;\n', ''],
  ["readiness weakened", 'if(!passwordRecoveryReady(env))return;', 'if(false)return;'],
  ["readiness duplicated", '  if(!passwordRecoveryReady(env))return;\n', '  if(!passwordRecoveryReady(env))return;\n  if(!passwordRecoveryReady(env))return;\n'],
  ["unapproved public wording", 'Delivery is not confirmed.', 'Delivery is guaranteed.'],
  ["unapproved readiness import", 'passwordResetEmail,passwordRecoveryReady,type', 'passwordResetEmail,type'],
  ["new issuance side effect", '  const raw=randomBytes(32)', '  unauthorizedSideEffect();\n  const raw=randomBytes(32)'],
];
for (const [name, before, after] of recoveryMutations) test("S6-IV-01 rejects " + name, () => {
  const mutated = replaceRecoveryOnce(recoveryGuardCurrent, before, after);
  assert.throws(() => assertRecoveryGuard(mutated), { code: "ERR_ASSERTION" });
});

for (const destination of ["account lookup", "token generation", "consume opening"]) test("S6-IV-01 rejects readiness moved to " + destination, () => {
  const guard = "  if(!passwordRecoveryReady(env))return;\n";
  let mutated = replaceRecoveryOnce(recoveryGuardCurrent, guard, "");
  const anchor = destination === "account lookup"
    ? "  const manager=await db.manager.findUnique({where:{email},include:{business:true}});if(!eligible(manager)||!manager)return;\n"
    : destination === "token generation"
      ? '  const raw=randomBytes(32).toString("base64url"),tokenHash=resetTokenHash(raw);\n'
      : "export async function consumeManagementPasswordReset(db:PrismaClient,raw:unknown,password:unknown,confirm:unknown){\n";
  mutated = replaceRecoveryOnce(mutated, anchor, anchor + guard);
  assert.throws(() => assertRecoveryGuard(mutated), { code: "ERR_ASSERTION" });
});

test("S6-IV-01 rejects unexpected additions outside approved contextual differences", () => {
  assert.throws(() => assertRecoveryGuard(recoveryGuardCurrent + "\nexport const unauthorizedSecurityChange = true;\n"), { code: "ERR_ASSERTION" });
  assert.throws(() => assertRecoveryGuard("// unexpected change\n" + recoveryGuardCurrent), { code: "ERR_ASSERTION" });
});

test("S6-IV-01 keeps the unchanged whole-file comparison for other protected modules", () => {
  const file = "lib/platformFees.ts", source = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  assert.equal(historicalCheckoutSource(file, source), source);
  const changed = source + "\nexport const unauthorizedPricingChange = true;\n";
  assert.notEqual(historicalCheckoutSource(file, changed), source);
});
