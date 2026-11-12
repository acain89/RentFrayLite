import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { authHarness } from "./helpers/auth-harness.mjs";

const configuration = { NODE_ENV: "production", NEXT_PUBLIC_BASE_URL: "https://example.test",
  RFL_EMAIL_API_URL: "https://mail.example.test/send", RFL_EMAIL_API_TOKEN: "SYNTHETIC_PRIVATE_GATEWAY_KEY",
  RFL_EMAIL_FROM: "recovery@example.test" };
const privateMarkers = [configuration.RFL_EMAIL_API_TOKEN, configuration.RFL_EMAIL_API_URL, configuration.RFL_EMAIL_FROM, "SYNTHETIC_PRIVATE_EXCEPTION", "SYNTHETIC_PRIVATE_PASSWORD"];
const noPrivate = data => { for (const marker of privateMarkers) assert.ok(!JSON.stringify(data).includes(marker), marker); };
const newPassword = "A new secure recovery passphrase1";
async function fixture(env = configuration) {
  const h = await authHarness("isolated", undefined, {}, env), messages = [];
  const email = h.load("lib/passwordResetEmail.ts"), sender = { send: async message => { messages.push(message); return true; } };
  h.mocks["@/lib/passwordResetEmail"] = { ...email, passwordResetEmailSender: () => sender };
  const service = h.load("lib/passwordRecovery.ts");
  return { ...h, email, service, sender, messages,
    issueReset: () => service.requestManagementPasswordReset(h.db, h.managers[0].email, sender, env),
    tokens: () => h.db.verificationToken.findMany({ where: { businessId: h.businesses[0].id } }),
    request: (address = h.managers[0].email, origin = configuration.NEXT_PUBLIC_BASE_URL) => new Request(configuration.NEXT_PUBLIC_BASE_URL + "/api/auth/forgot-password", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: address }),
    }),
  };
}
const first = await fixture();

test("complete configuration is structurally ready without proving provider acceptance or inbox delivery", () => {
  assert.equal(first.email.passwordRecoveryReady(configuration), true);
  assert.match(first.service.RESET_REQUEST_CONFIRMATION, /may be sent/);
  assert.match(first.service.RESET_REQUEST_CONFIRMATION, /Delivery is not confirmed/);
  assert.equal(first.messages.length, 0);
});

for (const key of ["NEXT_PUBLIC_BASE_URL", "RFL_EMAIL_API_URL", "RFL_EMAIL_API_TOKEN", "RFL_EMAIL_FROM"]) {
  test("missing " + key + " is unavailable before any account lookup, token or transport", async () => {
    const env = { ...configuration }; delete env[key];
    assert.equal(first.email.passwordRecoveryReady(env), false);
    const forbidden = new Proxy({}, { get() { throw Error("Database access before readiness"); } });
    await first.service.requestManagementPasswordReset(forbidden, "private@example.test", first.sender, env);
    let calls = 0;
    const adapter = first.email.passwordResetEmailSender(env, async () => { calls++; throw Error("Forbidden provider call"); });
    assert.equal(await adapter.send({ to: "private@example.test" }), false);
    assert.equal(calls, 0); assert.equal(first.messages.length, 0);
  });
}

const malformed = [
  ["RFL_EMAIL_API_URL", "http://mail.example.test/send"],
  ["RFL_EMAIL_API_URL", "https://user:password@mail.example.test/send"],
  ["RFL_EMAIL_API_URL", "https://mail.example.test/send?key=private"],
  ["RFL_EMAIL_API_URL", "https://mail.example.test/send#fragment"],
  ["RFL_EMAIL_API_URL", "https://mail.example.test/send?"],
  ["RFL_EMAIL_API_URL", "https://localhost./send"],
  ["RFL_EMAIL_API_URL", "https://child.localhost/send"],
  ["RFL_EMAIL_API_URL", "https://127.1/send"],
  ["RFL_EMAIL_API_URL", "https://127.0.0.2/send"],
  ["RFL_EMAIL_API_URL", "https://[::1]/send"],
  ["RFL_EMAIL_API_URL", "not-a-url"],
  ["RFL_EMAIL_API_URL", "https://mail.example.test/sen\nd"],
  ["RFL_EMAIL_API_URL", "https://mail.example.test/send path"],
  ["RFL_EMAIL_API_URL", " https://mail.example.test/send"],
  ["RFL_EMAIL_API_TOKEN", "   "],
  ["RFL_EMAIL_API_TOKEN", "private\r\ninjected"],
  ["RFL_EMAIL_API_TOKEN", "token with spaces"],
  ["RFL_EMAIL_FROM", "Display Name <recovery@example.test>"],
  ["RFL_EMAIL_FROM", "recovery@invalid"],
  ["RFL_EMAIL_FROM", "recovery@example..test"],
  ["RFL_EMAIL_FROM", "recovery@-example.test"],
  ["RFL_EMAIL_FROM", "recovery@example_test.test"],
  ["RFL_EMAIL_FROM", "two..dots@example.test"],
  ["RFL_EMAIL_FROM", "private\u0000@example.test"],
  ["NEXT_PUBLIC_BASE_URL", "http://example.test"],
  ["NEXT_PUBLIC_BASE_URL", "https://exa\nmple.test"],
  ["NEXT_PUBLIC_BASE_URL", " https://example.test"],
  ["NEXT_PUBLIC_BASE_URL", "https://example.test/path"],
  ["NEXT_PUBLIC_BASE_URL", "https://user:password@example.test"],
  ["NEXT_PUBLIC_BASE_URL", "https://localhost."],
  ["NEXT_PUBLIC_BASE_URL", "https://127.0.0.2"],
];
for (const [index, [key, value]] of malformed.entries()) test("malformed configuration " + index + " fails closed without token or transport", async () => {
  const env = { ...configuration, [key]: value }; assert.equal(first.email.passwordRecoveryReady(env), false);
  const forbidden = new Proxy({}, { get() { throw Error("Readiness must precede storage"); } });
  await first.service.requestManagementPasswordReset(forbidden, "private@example.test", first.sender, env);
  let calls = 0;
  assert.equal(await first.email.passwordResetEmailSender(env, async () => { calls++; throw Error("Forbidden send"); }).send({}), false);
  assert.equal(calls, 0); assert.equal(first.messages.length, 0);
});

test("unavailable HTTP behavior stays account-independent and private with no reset issuance", async () => {
  const env = { ...configuration, RFL_EMAIL_API_TOKEN: "" }, f = await fixture(env);
  const api = f.load("app/api/auth/forgot-password/route.ts");
  const known = await api.POST(f.request()), unknown = await api.POST(f.request("unknown@example.invalid"));
  assert.equal(known.status, 200); assert.equal(unknown.status, 200);
  const a = await known.json(), b = await unknown.json(); assert.deepEqual(a, b);
  assert.equal(a.message, f.email.RECOVERY_UNAVAILABLE_MESSAGE);
  assert.match(a.message, /currently unavailable/);
  assert.equal((await f.tokens()).length, 0); assert.equal(f.messages.length, 0);
  assert.match(known.headers.get("cache-control"), /no-store/); assert.equal(known.headers.get("referrer-policy"), "no-referrer");
  const reservations = await f.db.auditLog.findMany({ where: { action: "MANAGEMENT_RESET_REQUEST_RESERVED" } });
  assert.equal(reservations.length, 2); noPrivate(a);
});

test("configured HTTP behavior stays generic for known and unknown accounts without claiming delivery", async () => {
  const f = await fixture(), api = f.load("app/api/auth/forgot-password/route.ts");
  const a = await api.POST(f.request()), b = await api.POST(f.request("unknown@example.invalid"));
  assert.equal(a.status, 200); assert.equal(b.status, 200); const publicBody = await a.json(); assert.deepEqual(publicBody, await b.json()); noPrivate(publicBody);
  assert.ok(!JSON.stringify(publicBody).includes(f.managers[0].email));
  assert.equal((await f.tokens()).length, 1); assert.equal(f.messages.length, 1);
  const raw = new URLSearchParams(new URL(f.messages[0].text.split("\n\n").at(-1)).hash.slice(1)).get("token");
  assert.equal((await f.tokens())[0].tokenHash, createHash("sha256").update(raw).digest("hex"));
  assert.ok(!JSON.stringify(publicBody).includes(raw));
});

for (const mode of ["accepted", "rejected", "timeout", "redirect"]) test("mock adapter " + mode + " is acceptance-only, bounded and does not leak", async () => {
  const f = await fixture(); let calls = 0, signal;
  const logs = [], originalError = console.error;
  try {
    console.error = (...args) => logs.push(args);
    const adapter = f.email.passwordResetEmailSender(configuration, async (endpoint, options) => {
      calls++; assert.equal(endpoint.href, configuration.RFL_EMAIL_API_URL);
      assert.equal(options.redirect, "error"); signal = options.signal; assert.ok(signal);
      assert.equal(options.headers.authorization, "Bearer " + configuration.RFL_EMAIL_API_TOKEN);
      const body = JSON.parse(options.body); assert.equal(body.from, configuration.RFL_EMAIL_FROM);
      if (mode === "timeout" || mode === "redirect") throw new Error(privateMarkers.join(" "));
      return new Response(null, { status: mode === "accepted" ? 202 : 401 });
    });
    await f.service.requestManagementPasswordReset(f.db, f.managers[0].email, adapter, configuration);
    assert.equal(calls, 1);
    const tokens = await f.tokens(); assert.equal(tokens.length, 1);
    assert.equal(tokens[0].usedAt === null, mode === "accepted");
    const failures = await f.db.auditLog.findMany({ where: { action: "PASSWORD_RESET_EMAIL_UNAVAILABLE" } });
    assert.equal(failures.length, mode === "accepted" ? 0 : 1);
    noPrivate(logs);
  } finally { console.error = originalError; }
});

test("valid existing reset remains usable while new issuance is unavailable; single use still holds", async () => {
  const f = await fixture(); await f.issueReset(); await f.issue("MANAGER");
  const raw = new URLSearchParams(new URL(f.messages[0].text.split("\n\n").at(-1)).hash.slice(1)).get("token");
  await f.service.requestManagementPasswordReset(f.db, f.managers[0].email, f.sender, { ...configuration, RFL_EMAIL_FROM: "" });
  assert.equal((await f.tokens()).length, 1);
  assert.equal(await f.service.consumeManagementPasswordReset(f.db, raw, newPassword, newPassword), true);
  assert.equal(await f.session.getCurrentSession(), null);
  assert.equal(await f.service.consumeManagementPasswordReset(f.db, raw, newPassword, newPassword), false);
});

test("origin and body protections remain fail-closed even while recovery is unavailable", async () => {
  const f = await fixture({ ...configuration, RFL_EMAIL_API_TOKEN: "" }), api = f.load("app/api/auth/forgot-password/route.ts");
  assert.equal((await api.POST(f.request(undefined, "https://attacker.test"))).status, 403);
  const bad = new Request(configuration.NEXT_PUBLIC_BASE_URL + "/api/auth/forgot-password", {
    method: "POST", headers: { origin: configuration.NEXT_PUBLIC_BASE_URL, "content-type": "application/json" }, body: "{" });
  const r = await api.POST(bad); assert.equal(r.status, 200); assert.equal((await f.tokens()).length, 0); noPrivate(await r.json());
});

for (const ready of [true, false]) test("server pages expose only readiness and gate recovery form/link: " + ready, async () => {
  const f = await fixture({ ...configuration, ...(ready ? {} : { RFL_EMAIL_API_TOKEN: "" }) });
  f.mocks.react = React;
  f.mocks["next/link"] = { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) };
  f.mocks["next/navigation"].useRouter = () => ({ replace() {}, refresh() {} });
  const Client = f.load("app/login/manager/ManagerLoginClient.tsx").default;
  f.mocks["./ManagerLoginClient"] = { __esModule: true, default: Client };
  const login = f.load("app/login/manager/page.tsx");
  const html = renderToStaticMarkup(login.default()); assert.equal(login.dynamic, "force-dynamic");
  assert.ok(html.includes('type="password"')); assert.ok(html.includes('minLength="6"'));
  assert.equal(html.includes('href="/login/manager/forgot-password"'), ready); noPrivate(html);
  f.mocks["./ForgotPasswordClient"] = { __esModule: true, default: () => React.createElement("form", { "data-recovery-form": "true" }) };
  const forgot = f.load("app/login/manager/forgot-password/page.tsx");
  const body = renderToStaticMarkup(forgot.default()); assert.equal(forgot.dynamic, "force-dynamic");
  assert.equal(body.includes("data-recovery-form"), ready);
  if (!ready) { assert.ok(body.includes(f.email.RECOVERY_UNAVAILABLE_MESSAGE)); assert.ok(!body.includes('type="email"')); }
  noPrivate(body); assert.equal((await f.tokens()).length, 0); assert.equal(f.messages.length, 0);
});

test("readiness gates issuance and introduces no provider probes", () => {
  const source = readFileSync("lib/passwordRecovery.ts", "utf8");
  assert.match(source, /if\(!passwordRecoveryReady\(env\)\)return;/);
  const readiness = readFileSync("lib/passwordResetEmail.ts", "utf8").split("export function passwordRecoveryReady")[1].split("/**")[0];
  assert.doesNotMatch(readiness, /fetch|send\(|transport\(/);
});

test("provider failure keeps known/unknown HTTP responses generic and private and revokes the new token", async () => {
  const f = await fixture(), logs = [], originalError = console.error;
  f.sender.send = async () => { throw new Error(privateMarkers.join(" ") + " " + f.managers[0].email); };
  try {
    console.error = (...args) => logs.push(args);
    const api = f.load("app/api/auth/forgot-password/route.ts");
    const a = await api.POST(f.request()), b = await api.POST(f.request("unknown@example.invalid"));
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const body = await a.json(); assert.deepEqual(body, await b.json()); noPrivate(body); noPrivate(logs);
    assert.ok(!JSON.stringify(body).includes(f.managers[0].email));
    assert.match(body.message, /Delivery is not confirmed/);
    const tokens = await f.tokens(); assert.equal(tokens.length, 1); assert.ok(tokens[0].usedAt);
    assert.equal(f.messages.length, 0);
  } finally { console.error = originalError; }
});
