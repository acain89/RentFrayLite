import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { managementBillingHarness } from "./helpers/management-billing-harness.mjs";
import { authHarness } from "./helpers/auth-harness.mjs";
import { attachPublicBudgetStorage } from "./helpers/public-budget-storage.mjs";

const address="manager@example.test";
const account = emailFields => ({businessName:"Test Property",ownerName:"Test Manager",password:"Abcdef12",confirmPassword:"Abcdef12",acceptedTerms:true,propertyTimeZone:"America/Chicago",...emailFields});
const valid = [
  ["single address",{email:address}],
  ["normalized single address",{email:"  MANAGER@EXAMPLE.TEST  "}],
  ["matching legacy pair",{contactEmail:address,managerEmail:address}],
  ["normalized matching legacy pair",{contactEmail:" MANAGER@EXAMPLE.TEST ",managerEmail:address}],
  ["all matching aliases",{email:address,contactEmail:" MANAGER@EXAMPLE.TEST ",managerEmail:address}],
  ["single plus contact alias",{email:address,contactEmail:address}],
  ["single plus manager alias",{email:address,managerEmail:address}],
];
for (const [name,fields] of valid) test(`signup maps both existing fields: ${name}`, async () => {
  const h=managementBillingHarness(),schema=h.load("lib/validators.ts").setupAccountSchema;
  const parsed=schema.parse(account(fields));assert.equal(parsed.contactEmail,address);assert.equal(parsed.managerEmail,address);
  const response=await h.load("app/api/setup/route.ts").POST(h.request(account(fields)));
  assert.equal(response.status,201);assert.equal(h.state().businesses[0].contactEmail,address);assert.equal(h.state().managers[0].email,address);
  assert.equal(h.state().businesses[0].propertyTimeZone,"America/Chicago");
  assert.equal(h.state().businesses[0].firstStandardBillingDate.toISOString(),"2026-11-01T00:00:00.000Z");
});
const invalid = [
  ["missing email",{}], ["empty email",{email:""}], ["invalid email",{email:"not-an-email"}],
  ["null email",{email:null}], ["array email",{email:[address]}], ["multiple emails",{email:address+",other@example.test"}],
  ["contact conflict",{email:address,contactEmail:"other@example.test"}],
  ["manager conflict",{email:address,managerEmail:"other@example.test"}],
  ["legacy pair conflict",{contactEmail:"other@example.test",managerEmail:address}],
  ["contact alias alone",{contactEmail:address}], ["manager alias alone",{managerEmail:address}],
  ["invalid contact alias",{email:address,contactEmail:"bad"}],
  ["invalid manager alias",{email:address,managerEmail:null}],
  ["no fallback from invalid primary",{email:"bad",contactEmail:address,managerEmail:address}],
  ["no fallback from empty primary",{email:"",contactEmail:address,managerEmail:address}],
  ["all aliases conflict",{email:address,contactEmail:address,managerEmail:"other@example.test"}],
];
for (const [name,fields] of invalid) test(`invalid/conflicting signup rejects before writes: ${name}`, async () => {
  const h=managementBillingHarness();assert.equal(h.load("lib/validators.ts").setupAccountSchema.safeParse(account(fields)).success,false);
  const response=await h.load("app/api/setup/route.ts").POST(h.request(account(fields)));
  assert.equal(response.status,400);assert.deepEqual(h.writes,[]);assert.equal(h.state().businesses.length,0);assert.equal(h.state().managers.length,0);
});

test("registration presents exactly one Email field and retains calendar/password controls", () => {
  const h=managementBillingHarness(),html=renderToStaticMarkup(h.load("app/setup/SetupAccountClient.tsx").default());
  assert.equal((html.match(/type="email"/g)??[]).length,1);assert.match(html,/<label for="email">Email<\/label>/);
  assert.match(html,/name="email"/);assert.doesNotMatch(html,/name="contactEmail"|name="managerEmail"|Business email|Manager email/);
  assert.match(html,/registration-password-rules/);assert.match(html,/At least 8 characters/);assert.match(html,/America\/Chicago/);
});

const configuration={NODE_ENV:"production",NEXT_PUBLIC_BASE_URL:"https://example.test",STRIPE_SECRET_KEY:"sk_test_registration_fixture",RFL_EMAIL_API_URL:"https://mail.example.test/send",RFL_EMAIL_API_TOKEN:"mock-gateway-key",RFL_EMAIL_FROM:"rfl@example.test"};
async function fullFixture(){const h=await authHarness("isolated",undefined,{},configuration);attachPublicBudgetStorage(h.db);return h;}
const post=(path,body)=>new Request("https://example.test/api/"+path,{method:"POST",headers:{origin:"https://example.test","content-type":"application/json"},body:JSON.stringify(body)});

test("one normalized email registers, signs in, recovers and supplies Connect contact data", async () => {
  const h=await fullFixture(),email="unified@example.test";
  const existingManagers=await h.db.manager.findMany(),existingBusinesses=await h.db.business.findMany();
  assert.equal((await h.load("app/api/setup/route.ts").POST(post("setup",account({email:" UNIFIED@EXAMPLE.TEST "})))).status,201);
  const manager=await h.db.manager.findUnique({where:{email}}),business=await h.db.business.findUnique({where:{id:manager.businessId}});
  assert.equal(business.contactEmail,email);
  for (const row of existingManagers) assert.deepEqual(await h.db.manager.findUnique({where:{id:row.id}}),row);
  for (const row of existingBusinesses) assert.deepEqual(await h.db.business.findUnique({where:{id:row.id}}),row);
  const hash=manager.passwordHash;
  const login=await h.load("app/api/auth/login/route.ts").POST(post("auth/login",{type:"MANAGER",email:" UNIFIED@EXAMPLE.TEST ",password:"Abcdef12"}));
  assert.equal(login.status,200);assert.equal((await h.session.getCurrentSession()).manager.email,email);
  const messages=[],mail=h.load("lib/passwordResetEmail.ts");
  h.mocks["@/lib/passwordResetEmail"]={...mail,passwordResetEmailSender:()=>({send:async m=>{messages.push(m);return true;}})};
  const forgot=await h.load("app/api/auth/forgot-password/route.ts").POST(post("auth/forgot-password",{email:" UNIFIED@EXAMPLE.TEST "}));
  assert.equal(forgot.status,200);assert.equal(messages.length,1);assert.equal(messages[0].to,email);
  assert.equal((await h.db.manager.findUnique({where:{email}})).passwordHash,hash);
  const parameters=h.load("lib/stripeAccountProvisioning.ts").accountProvisioningParameters("LEGACY_DESTINATION",{businessId:business.id,provisioningId:"synthetic-provision",email:business.contactEmail,name:business.name});
  assert.equal(parameters.email,email);assert.equal(parameters.type,"express");assert.equal(parameters.capabilities.transfers.requested,true);
});

test("normalized duplicates reject without a second business/manager", async () => {
  const h=await fullFixture(),route=h.load("app/api/setup/route.ts");
  assert.equal((await route.POST(post("setup",account({email:address})))).status,201);
  const businesses=await h.db.business.count(),managers=await h.db.manager.count();
  const duplicate=await route.POST(post("setup",account({contactEmail:" MANAGER@EXAMPLE.TEST ",managerEmail:address})));
  assert.equal(duplicate.status,409);assert.doesNotMatch(await duplicate.text(),/already exists|registered/);
  assert.equal(await h.db.business.count(),businesses);assert.equal(await h.db.manager.count(),managers);
});

test("existing accounts retain distinct business and login emails", async () => {
  const h=await fullFixture(),manager=h.managers[0],business=h.businesses[0];
  await h.db.business.update({where:{id:business.id},data:{contactEmail:"legacy-business@example.test"}});
  assert.ok(await h.auth.authenticateManager(manager.email,"old-password"));
  const messages=[],service=h.load("lib/passwordRecovery.ts");
  await service.requestManagementPasswordReset(h.db,manager.email,{send:async m=>{messages.push(m);return true;}},configuration);
  assert.equal(messages.length,1);assert.equal(messages[0].to,manager.email);
  assert.equal((await h.db.business.findUnique({where:{id:business.id}})).contactEmail,"legacy-business@example.test");
  assert.equal((await h.db.manager.findUnique({where:{id:manager.id}})).email,manager.email);
});

test("registration only changes the UI/schema adapter, not existing persistence columns", () => {
  assert.match(readFileSync("app/api/setup/route.ts","utf8"),/contactEmail: parsed.data.contactEmail/);
  assert.match(readFileSync("app/api/setup/route.ts","utf8"),/email: parsed.data.managerEmail/);
  assert.match(readFileSync("lib/stripeAccountProvisioning.ts","utf8"),/email: business.contactEmail/);
});
