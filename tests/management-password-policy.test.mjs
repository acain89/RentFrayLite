import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import bcrypt from "bcryptjs";
import { authHarness } from "./helpers/auth-harness.mjs";
import { managementBillingHarness } from "./helpers/management-billing-harness.mjs";

const h = await authHarness();
const server = h.load("lib/managementCredential.ts");
const frontendBuild = await build({entryPoints:["lib/managementPasswordPolicy.ts"],bundle:true,write:false,platform:"browser",format:"iife",globalName:"passwordPolicy",target:"es2022"});
const browser = {};
vm.runInNewContext(frontendBuild.outputFiles[0].text, browser);
const policy = browser.passwordPolicy;
const schema = managementBillingHarness().load("lib/validators.ts").setupAccountSchema;
const account = password => ({businessName:"Test Property",ownerName:"Test Manager",contactEmail:"property@example.test",managerEmail:"manager@example.test",password,confirmPassword:password,acceptedTerms:true,propertyTimeZone:"America/Chicago"});
const vectors = [
  ["eight ASCII characters", "Abcdef12", true],
  ["special characters optional", "Abcde1!x", true],
  ["Unicode plus ASCII classes", "Abcdef1é", true],
  ["72 ASCII bytes", "Aa1"+"x".repeat(69), true],
  ["72 multibyte bytes", "Aa1x"+"😀".repeat(17), true],
  ["outer whitespace allowed but not counted", "  Abcdef12  ", true],
  ["seven characters", "Abcde12", false],
  ["missing uppercase", "abcdef12", false],
  ["missing lowercase", "ABCDEF12", false],
  ["missing digit", "Abcdefgh", false],
  ["non-ASCII uppercase does not satisfy A-Z", "Äbcdef12", false],
  ["non-ASCII digit does not satisfy 0-9", "Abcdefg١", false],
  ["outer whitespace cannot pad length", " Abcde1 ", false],
  ["73 ASCII bytes", "Aa1"+"x".repeat(70), false],
  ["multibyte overflow", "Aa1x"+"😀".repeat(18), false],
  ["NUL", "Abcdef1\0", false],
  ["malformed Unicode", "Abcdef1\ud800", false],
  ["non-string", null, false],
];
for (const [name, value, valid] of vectors) test(`browser/server/signup agreement: ${name}`, () => {
  assert.equal(policy.isNewManagementPassword(value), valid);
  assert.equal(server.isNewManagementPassword(value), valid);
  assert.equal(schema.safeParse(account(value)).success, valid);
});

test("8-character creation preserves bcrypt cost and legacy login compatibility", async () => {
  const old = await h.auth.authenticateManager(h.managers[0].email, "old-password");
  assert.ok(old);
  assert.equal(server.isNewManagementPassword("old-password"), false);
  assert.equal(server.isManagementLoginPassword("old-password"), true);
  const hash = await h.load("lib/password.ts").hashPassword("Abcdef12");
  assert.match(hash, /^\$2[ab]\$12\$/);
  assert.equal(await bcrypt.compare("Abcdef12", hash), true);
  assert.equal((await h.db.manager.findUnique({where:{id:h.managers[0].id}})).passwordHash, h.managers[0].passwordHash);
});

for (const flow of ["manager", "admin"]) test(`${flow} accepts eight characters; rejects missing class without credential/session changes`, async () => {
  const f = await authHarness();
  const originalToken = await f.issue();
  if (flow === "admin") await f.issue("ADMIN");
  const before = await f.db.manager.findUnique({where:{id:f.managers[0].id}});
  const invoke = password => flow === "admin" ? f.reset(0,{password,confirmPassword:password}) : f.change({newPassword:password,confirmPassword:password});
  assert.equal((await invoke("abcdefgh")).status, 400);
  assert.equal((await f.db.manager.findUnique({where:{id:before.id}})).passwordHash, before.passwordHash);
  f.use(originalToken); assert.ok(await f.session.getCurrentSession());
  if (flow === "admin") await f.issue("ADMIN");
  assert.equal((await invoke("Abcdef12")).status, 200);
  assert.equal(await bcrypt.compare("Abcdef12", (await f.db.manager.findUnique({where:{id:before.id}})).passwordHash), true);
  f.use(originalToken); assert.equal(await f.session.getCurrentSession(), null);
});

test("recovery policy rejects invalid choice without consuming token; valid eight-character reset remains single-use", async () => {
  const configuration={NODE_ENV:"production",NEXT_PUBLIC_BASE_URL:"https://example.test",RFL_EMAIL_API_URL:"https://mail.example.test/send",RFL_EMAIL_API_TOKEN:"mock-gateway-key",RFL_EMAIL_FROM:"rfl@example.test"};
  const f=await authHarness("isolated",undefined,{},configuration),service=f.load("lib/passwordRecovery.ts"),messages=[];
  await service.requestManagementPasswordReset(f.db,f.managers[0].email,{send:async m=>{messages.push(m);return true;}},configuration);
  const token=new URLSearchParams(new URL(messages[0].text.split("\n\n").at(-1)).hash.slice(1)).get("token");
  assert.equal(await service.consumeManagementPasswordReset(f.db,token,"abcdefgh","abcdefgh"),false);
  assert.equal((await f.db.verificationToken.findMany())[0].usedAt,null);
  assert.equal(await service.consumeManagementPasswordReset(f.db,token,"Abcdef12","Abcdef12"),true);
  assert.equal(await service.consumeManagementPasswordReset(f.db,token,"Abcdef12","Abcdef12"),false);
});

test("registration checklist updates live and client/backend agree without external requests", async () => {
  const { chromium, expect } = await import("@playwright/test");
  const f=managementBillingHarness();
  const result=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Client from './app/setup/SetupAccountClient.tsx';createRoot(document.getElementById('root')).render(React.createElement(Client));",resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",jsx:"automatic",plugins:[{name:"local-next-ui",setup(b){
    b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:a.path==="next/link"?"import React from 'react';export default function Link({href,children,...p}){return React.createElement('a',{href,...p},children);}":"export function useRouter(){return {replace:url=>window.__redirect=url,refresh:()=>{}};}",loader:"js",resolveDir:process.cwd()}));
  }}]});
  const instance=await chromium.launch({headless:true});let apiCalls=0;const external=[];
  try {
    const page=await instance.newPage();page.setDefaultTimeout(15000);
    await page.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!=="https://example.test"){external.push(url.origin);return route.abort();}
      if(url.pathname==="/api/setup"){
        apiCalls++;const response=await f.load("app/api/setup/route.ts").POST(f.request(JSON.parse(request.postData())));
        return route.fulfill({status:response.status,contentType:"application/json",body:await response.text()});
      }
      return route.fulfill({contentType:"text/html",body:'<div id="root"></div><script>'+result.outputFiles[0].text.replaceAll("</script","<\\/script")+'</script>'});
    });
    await page.goto("https://example.test/setup");
    const password=page.getByLabel("Password",{exact:true}),rules=page.locator("#registration-password-rules");
    await expect(rules).toHaveAttribute("aria-live","polite");
    assert.equal(await password.evaluate(el=>el.nextElementSibling.id),"registration-password-rules");
    await password.fill("abcdefgh");await expect(rules.locator('[data-met="true"]')).toHaveCount(2);
    await password.fill("Abcdefgh");await expect(rules.locator('[data-met="true"]')).toHaveCount(3);
    await password.fill("Abcdef12");await expect(rules.locator('[data-met="true"]')).toHaveCount(4);
    await expect(rules).toContainText("Special characters are optional");
    await page.getByLabel("Business name",{exact:true}).fill("Test Property");
    await page.getByLabel("Your name",{exact:true}).fill("Test Manager");
    await page.getByLabel("Business email",{exact:true}).fill("property@example.test");
    await page.getByLabel("Manager email",{exact:true}).fill("manager@example.test");
    await page.locator('select[name="propertyTimeZone"]').selectOption("America/Chicago");
    await page.locator('input[name="acceptedTerms"]').check();
    await password.fill("abcdefgh");await page.getByLabel("Confirm password",{exact:true}).fill("abcdefgh");
    await page.getByRole("button",{name:"Continue",exact:true}).click();assert.equal(apiCalls,0);
    await expect(page.getByRole("alert")).toContainText("uppercase");
    assert.equal((await f.load("app/api/setup/route.ts").POST(f.request(account("abcdefgh")))).status,400);
    await password.fill("Abcdef12");await page.getByLabel("Confirm password",{exact:true}).fill("Abcdef12");
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.__redirect)).toBe("/setup/recurring/tiers");
    assert.equal(apiCalls,1);assert.equal(f.state().businesses.length,1);assert.equal(f.state().managers.length,1);assert.deepEqual(external,[]);
    await page.getByRole("checkbox",{name:"Show passwords",exact:true}).check();await expect(password).toHaveAttribute("type","text");
  } finally {await instance.close();}
});

test("all new-password clients use shared checks; existing password fields retain legacy limits", () => {
  for(const file of ["app/setup/SetupAccountClient.tsx","app/login/manager/reset-password/ResetPasswordClient.tsx","app/manager/settings/security/SecuritySettingsClient.tsx","app/admin/AdminDashboardClient.tsx"]){
    const source=readFileSync(file,"utf8");assert.match(source,/isNewManagementPassword/);assert.match(source,/MANAGEMENT_PASSWORD_MIN_LENGTH/);assert.match(source,/ManagementPasswordChecklist/);
  }
  assert.match(readFileSync("app/login/manager/ManagerLoginClient.tsx","utf8"),/minLength=\{6\}/);
  assert.match(readFileSync("lib/password.ts","utf8"),/PASSWORD_SALT_ROUNDS = 12/);
});
