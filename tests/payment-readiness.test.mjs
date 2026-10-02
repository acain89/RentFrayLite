import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const clone = structuredClone;
const plan = () => ({ id: "plan-owner", businessId: "owner", name: "Rent", isActive: true,
  baseAmountCents: 100000, dueDay: 1, gracePeriodDays: 1, initialLateFeeCents: 0,
  dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0, sortOrder: 0, charges: [] });
const business = () => ({ id: "owner", name: "Owner business", status: "ACTIVE", isActive: true,
  accountCode: "AB-1234", accountCodeLockedAt: new Date(), setupStep: "COMPLETE", setupCompletedAt: new Date(),
  stripeConnection: { businessId: "owner", stripeAccountId: "acct_owner", readyForLive: true }, recurringPlans: [plan()] });
const account = (id = "acct_owner") => ({ id, object: "account", country: "US", details_submitted: true,
  charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" },
  requirements: { currently_due: [], past_due: [], disabled_reason: null } });

// Only storage, session, cookies and external services are substituted. Readiness,
// setup validators, code lookup, pricing and checkout routes execute real code.
export function harness({ key = "sk_live_fixture", environment = "production" } = {}) {
  const state = { business: business(), account: account(), platform: account("acct_platform"),
    configuration: { id: "pmc_default", is_default: true, application: null, active: true,
      livemode: key.includes("_live_"), card: { available: true }, us_bank_account: { available: true } },
    session: true, managerBusinessId: "owner", other: { ...business(), id: "other", accountCode: "CD-5678" },
    checkout: null, payment: null, stripeFailure: false };
  const calls = { stripeCreates: [], writes: [], queries: [], resultAccess: [], sync: [] };
  const sessionRow = () => ({ id: "session-owner", tokenHash: "fixture-token", type: "MANAGER",
    managerId: "manager-owner", businessId: "owner", adminAccessId: null,
    expiresAt: new Date(Date.now() + 60000), adminAccess: null,
    manager: { id: "manager-owner", isActive: true, businessId: state.managerBusinessId, business: clone(state.business) },
    business: clone(state.business) });
  const prisma = {
    session: { findUnique: async () => state.session ? sessionRow() : null },
    business: {
      findUnique: async ({ where }) => {
        calls.queries.push(clone(where));
        return clone([state.business, state.other].find(b => where.id ? b.id === where.id : b.accountCode === where.accountCode) ?? null);
      },
      update: async ({ where, data }) => {
        assert.equal(where.id, "owner");
        if (where.accountCodeLockedAt === null) assert.equal(state.business.accountCodeLockedAt, null);
        if (data.accountCode === state.other.accountCode) throw new (require("@prisma/client").Prisma.PrismaClientKnownRequestError)("unique", { code: "P2002", clientVersion: "test" });
        calls.writes.push({ model: "business", data: clone(data) }); Object.assign(state.business, clone(data)); return clone(state.business);
      },
    },
    recurringPlan: {
      findMany: async ({ where }) => {
        assert.equal(where.businessId, "owner");
        return clone(state.business.recurringPlans.filter(p => (!where.isActive || p.isActive) && (!where.id?.in || where.id.in.includes(p.id))));
      },
      updateMany: async ({ where, data }) => {
        assert.equal(where.businessId, "owner");
        for (const p of state.business.recurringPlans) if (!where.id.notIn.includes(p.id)) Object.assign(p, data);
        return { count: 1 };
      },
      create: async ({ data }) => { const p = { ...plan(), ...data }; state.business.recurringPlans.push(p); return clone(p); },
      update: async ({ where, data }) => { const p = state.business.recurringPlans.find(p => p.id === where.id); assert.ok(p); Object.assign(p, clone(data)); return clone(p); },
    },
    stripeConnection: {
      findUnique: async ({ where }) => { assert.equal(where.businessId, "owner"); return clone(state.business.stripeConnection); },
      upsert: async ({ where, update }) => { assert.equal(where.businessId, "owner"); calls.sync.push(clone(update)); Object.assign(state.business.stripeConnection, update); return clone(state.business.stripeConnection); },
    },
    checkoutSession: {
      updateMany: async ({ data }) => { calls.writes.push({ model: "checkout", data: clone(data) }); Object.assign(state.checkout, clone(data)); return { count: 1 }; },
      create: async ({ data }) => { state.checkout = { id: "checkout-owner", paymentId: null, stripeCheckoutSessionId: null, ...clone(data) }; calls.writes.push({ model: "checkout" }); return clone(state.checkout); },
      findUnique: async () => clone(state.checkout),
      update: async ({ data }) => { calls.writes.push({ model: "checkout", data: clone(data) }); Object.assign(state.checkout, clone(data)); return clone(state.checkout); },
    },
    payment: {
      updateMany: async ({ data }) => { Object.assign(state.payment, clone(data)); return { count: 1 }; },
      findUnique: async () => clone(state.payment), findFirst: async () => null, findMany: async () => [],
      create: async ({ data }) => { state.payment = { id: "payment-owner", paidAt: null, stripeCheckoutSessionId: null, ...clone(data) }; calls.writes.push({ model: "payment" }); return clone(state.payment); },
      update: async ({ data }) => { Object.assign(state.payment, clone(data)); return clone(state.payment); },
    },
    auditLog: { create: async ({ data }) => { assert.equal(data.businessId, "owner"); return {}; } },
    $queryRaw: async query => /clock_timestamp/.test(query.sql) ? [{ now: new Date() }] : [],
    $transaction: async operations => typeof operations === "function" ? operations(prisma) : Promise.all(operations),
  };
  const stripe = {
    accounts: { retrieve: async id => { if (state.stripeFailure) throw Error("Unavailable"); return clone(typeof id === "string" ? state.account : state.platform); } },
    paymentMethodConfigurations: { list: async () => ({ has_more: false, data: [clone(state.configuration)] }) },
    checkout: { sessions: {
      create: async (params, options) => { calls.stripeCreates.push({ params: clone(params), options: clone(options) }); return { id: "cs_test_owner", url: "https://example.test/stripe" }; },
    } },
  };
  const mocks = {
    "@prisma/client": require("@prisma/client"), "zod": require("zod"), "node:crypto": require("node:crypto"),
    "bcryptjs": require("bcryptjs"), "react": require("react"), "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: ({ children, ...props }) => require("react").createElement("a", props, children), __esModule: true },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "next/navigation": { redirect: route => { throw Error(`REDIRECT:${route}`); }, notFound: () => { throw Error("NOT_FOUND"); }, useRouter: () => ({ push() {}, refresh() {} }) },
    "@/lib/prisma": { prisma }, "@/lib/stripe": { getStripeClient: () => stripe },
    "@/lib/paymentResultAccess": { grantPaymentResultAccess: async (...args) => calls.resultAccess.push(args) },
    "@/lib/session": { getCurrentSession: async () => state.session ? sessionRow() : null },
  };
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(root, relative);
    const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText;
    const mod = { exports: {} }; cache.set(relative, mod.exports);
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "node:buffer") return require("node:buffer");
      if (name.startsWith("@/lib/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith("@/components/")) return load(`${name.slice(2)}.tsx`);
      if (name.startsWith("./")) return load(path.posix.join(path.posix.dirname(relative), `${name.slice(2)}.tsx`));
      throw Error(`Unexpected service import ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports,process,console){${output}\n})`, { filename })(
      localRequire, mod, mod.exports, { env: { NODE_ENV: environment, STRIPE_SECRET_KEY: key } }, { error() {}, warn() {} });
    cache.set(relative, mod.exports); return mod.exports;
  }
  const readiness = () => load("lib/businessPaymentReadiness.ts").getBusinessPaymentReadiness(clone(state.business));
  const request = (body, method = "POST") => new Request("https://example.test/api", { method, body: JSON.stringify(body) });
  async function prepare(method = "ACH") {
    const response = await load("app/api/public/checkout/session/route.ts").POST(request({ accountCode: "AB-1234", planId: "plan-owner", unitNumber: "101", firstName: "Test", lastName: "Payer", phone: "5555551234", paymentMethod: method }));
    assert.equal(response.status, 201); state.checkout.status = "REVIEWED";
  }
  const start = () => load("app/api/public/checkout/start/route.ts").POST(request({ checkoutSessionId: "checkout-owner" }));
  return { state, calls, load, readiness, request, prepare, start };
}

const notReadyCases = [
  ["new business", h => Object.assign(h.state.business, { status: "SETUP", accountCode: null, setupCompletedAt: null, recurringPlans: [], stripeConnection: null }), "NO_USABLE_TIER"],
  ["no active tier", h => h.state.business.recurringPlans[0].isActive = false, "NO_USABLE_TIER"],
  ["zero price", h => h.state.business.recurringPlans[0].baseAmountCents = 0, "INVALID_PRICING"],
  ["negative legacy amount", h => h.state.business.recurringPlans[0].baseAmountCents = -1, "INVALID_PRICING"],
  ["unsafe legacy late fee", h => h.state.business.recurringPlans[0].dailyLateFeeCents = Number.MAX_SAFE_INTEGER + 1, "INVALID_BILLING"],
  ["missing billing rules", h => h.state.business.recurringPlans[0].gracePeriodDays = 0, "INVALID_BILLING"],
  ["bad due day", h => h.state.business.recurringPlans[0].dueDay = 32, "INVALID_BILLING"],
  ["bad charge cycle", h => h.state.business.recurringPlans[0].charges.push({ label: "Charge", isActive: true, amountCents: 0, effectiveBillingCycle: "2026-13", endsAfterBillingCycle: null }), "INVALID_CHARGES"],
  ["over payment limit", h => h.state.business.recurringPlans[0].baseAmountCents = 500001, "PRICING_LIMIT"],
  ["Stripe absent", h => h.state.business.stripeConnection = null, "STRIPE_MISSING"],
  ["onboarding incomplete", h => h.state.account.details_submitted = false, "STRIPE_ONBOARDING"],
  ["charges disabled on the charging platform", h => h.state.platform.charges_enabled = false, "STRIPE_CHARGES"],
  ["payouts disabled", h => h.state.account.payouts_enabled = false, "STRIPE_DESTINATION"],
  ["transfers lost", h => h.state.account.capabilities.transfers = "inactive", "STRIPE_DESTINATION"],
  ["restriction", h => h.state.account.requirements.disabled_reason = "rejected.fraud", "STRIPE_RESTRICTED"],
  ["overdue requirements", h => h.state.account.requirements.past_due = ["business_profile.url"], "STRIPE_RESTRICTED"],
  ["platform charges disabled", h => h.state.platform.charges_enabled = false, "STRIPE_CHARGES"],
  ["card unavailable", h => h.state.configuration.card.available = false, "STRIPE_PAYMENT_METHODS"],
  ["ACH unavailable", h => h.state.configuration.us_bank_account.available = false, "STRIPE_PAYMENT_METHODS"],
  ["default method configuration inactive", h => h.state.configuration.active = false, "STRIPE_PAYMENT_METHODS"],
  ["wrong Stripe account returned", h => h.state.account.id = "acct_other", "STRIPE_UNVERIFIED"],
  ["Stripe request fails", h => h.state.stripeFailure = true, "STRIPE_UNVERIFIED"],
  ["deleted Stripe account", h => h.state.account.deleted = true, "STRIPE_UNVERIFIED"],
  ["unsupported destination region", h => h.state.account.country = "FR", "STRIPE_DESTINATION"],
  ["invalid account code", h => h.state.business.accountCode = "INVALID", "ACCOUNT_CODE"],
  ["disabled business", h => h.state.business.status = "DISABLED", "BUSINESS_UNAVAILABLE"],
];
for (const [name, change, code] of notReadyCases) {
  test(`${name}: shared readiness rejects and actual checkout creates no Payment/Stripe resource`, async () => {
    const h = harness(); await h.prepare(); change(h);
    const result = await h.readiness(); assert.equal(result.ready, false); assert.ok(result.reasons.some(r => r.code === code));
    const writes = h.calls.writes.length;
    assert.equal((await h.start()).status, 409);
    assert.equal(h.calls.stripeCreates.length, 0); assert.equal(h.state.payment, null); assert.equal(h.calls.writes.length, writes);
  });
}

for (const method of ["ACH", "CARD"]) test(`${method}: real manager tier/billing/review → code → lookup → checkout reconciles`, async () => {
  const h = harness(); Object.assign(h.state.business, { status: "SETUP", setupStep: "CONFIGURE_RECURRING_TIERS", accountCode: null, accountCodeLockedAt: null, setupCompletedAt: null, recurringPlans: [] });
  assert.equal((await h.load("app/api/setup/recurring/tiers/route.ts").PUT(h.request({ tiers: [{ id: null, clientKey: "new", name: "Rent", amountCents: 100000 }], advance: true }, "PUT"))).status, 200);
  assert.equal((await h.readiness()).configurationReady, false);
  assert.equal((await h.load("app/api/setup/recurring/billing/route.ts").PUT(h.request({ sameRulesForAll: true, advance: true, rules: [{ recurringPlanId: "plan-owner", dueDay: 1, gracePeriodDays: 1, initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0 }] }, "PUT"))).status, 200);
  assert.equal((await h.load("app/api/setup/recurring/review/route.ts").POST()).status, 200);
  assert.equal((await h.readiness()).canChooseAccountCode, true);
  assert.equal((await h.load("app/api/setup/account-code/route.ts").POST(h.request({ accountCode: "AB-1234", businessId: "other" }))).status, 200);
  assert.equal((await h.readiness()).readyForLive, true);
  assert.equal((await h.load("lib/publicCheckout.ts").getPublicCheckoutBusiness("ab1234")).id, "owner");
  await h.prepare(method); assert.equal((await h.start()).status, 200);
  const params = h.calls.stripeCreates[0].params;
  const total = params.line_items.reduce((n, item) => n + item.quantity * item.price_data.unit_amount, 0);
  assert.equal(total, h.state.checkout.totalCents); assert.equal(total, h.state.payment.totalChargedCents);
  assert.equal(total, method === "ACH" ? 100995 : 104900);
  assert.equal(params.payment_intent_data.application_fee_amount, method === "ACH" ? 995 : 4900);
  assert.equal(total - params.payment_intent_data.application_fee_amount, 100000);
  assert.equal(params.payment_intent_data.transfer_data.destination, "acct_owner");
  assert.equal(h.calls.stripeCreates[0].options.idempotencyKey, "rfl-payment-payment-owner");
  assert.deepEqual(h.calls.resultAccess, [["cs_test_owner", "checkout-owner"]]);
});

test("production test key is never ready/live; development test remains usable", async () => {
  const prod = harness({ key: "sk_test_fixture" }); await prod.prepare().then(() => assert.fail("production test accepted"), error => assert.match(error.message, /404/));
  assert.equal((await prod.readiness()).ready, false); assert.equal((await prod.readiness()).readyForLive, false);
  const live = harness(); await live.prepare(); prod.state.checkout = clone(live.state.checkout);
  assert.equal((await prod.start()).status, 409); assert.equal(prod.state.payment, null); assert.equal(prod.calls.stripeCreates.length, 0);
  for (const key of ["sk_test_fixture", "rk_test_fixture"]) {
    const h = harness({ key, environment: "development" }); const r = await h.readiness();
    assert.equal(r.ready, true); assert.equal(r.readyForLive, false); assert.equal(r.title, "Ready for test payments");
    await h.prepare(); assert.equal((await h.start()).status, 200);
  }
});
test("unknown/missing key and wrong method-configuration mode fail closed", async () => {
  for (const key of ["", "invalid"]) assert.equal((await harness({ key }).readiness()).ready, false);
  const h = harness(); h.state.configuration.livemode = false; assert.equal((await h.readiness()).ready, false);
});
test("Stripe synchronization changes only Stripe facts, keeps code and completed setup, and restriction reduces readiness", async () => {
  const h = harness(); assert.equal((await h.readiness()).ready, true);
  const saved = clone(h.state.business); delete saved.stripeConnection;
  const sync = h.load("lib/stripeConnection.ts").syncStripeConnection;
  await sync("owner", "acct_owner"); h.state.account.capabilities.transfers = "inactive"; await sync("owner", "acct_owner");
  assert.equal((await h.readiness()).ready, false); assert.equal(h.state.business.stripeConnection.readyForLive, false);
  const after = clone(h.state.business); delete after.stripeConnection;
  assert.deepEqual(after, saved); assert.equal(h.calls.writes.length, 0);
  assert.deepEqual(await (await h.load("app/api/setup/account-code/route.ts").GET()).json(), { accountCode: "AB-1234", locked: true });
});
test("code lookup cannot truncate extra digits, decode malformed inputs or expose an unready business", async () => {
  const h = harness(); const lookup = h.load("lib/publicCheckout.ts").getPublicCheckoutBusiness;
  for (const code of ["AB-12345", "%ZZ", "AB-1234-extra", "ZZ-9999"]) assert.equal(await lookup(code), null);
  assert.equal((await lookup("CD-5678")).id, "other");
  h.state.account.capabilities.transfers = "inactive"; assert.equal(await lookup("AB-1234"), null);
});
test("account-code uniqueness conflict leaves existing code and setup untouched", async () => {
  const h = harness(); Object.assign(h.state.business, { accountCode: null, accountCodeLockedAt: null, status: "SETUP", setupCompletedAt: null });
  assert.equal((await h.load("app/api/setup/account-code/route.ts").POST(h.request({ accountCode: "CD-5678" }))).status, 409);
  assert.equal(h.state.business.accountCode, null); assert.equal(h.state.business.setupCompletedAt, null);
});
test("manager session ownership mismatch and unauthenticated callers cannot read or change code/configuration", async () => {
  for (const mismatch of [true, false]) {
    const h = harness(); if (mismatch) h.state.managerBusinessId = "other"; else h.state.session = false;
    const codes = h.load("app/api/setup/account-code/route.ts");
    assert.equal((await codes.GET()).status, 401); assert.equal((await codes.POST(h.request({ accountCode: "CD-5678" }))).status, 401);
    for (const route of ["tiers", "billing", "charges"]) assert.equal((await h.load(`app/api/setup/recurring/${route}/route.ts`).PUT(h.request({}, "PUT"))).status, 401);
    assert.equal((await h.load("app/api/setup/recurring/review/route.ts").POST()).status, 401);
    assert.equal(h.calls.queries.length, 0); assert.equal(h.calls.writes.length, 0);
  }
});
test("stale checkout tier cannot authorize a new Stripe session", async () => {
  const h = harness(); await h.prepare(); h.state.checkout.planId = "plan-other";
  assert.equal((await h.start()).status, 409); assert.equal(h.state.payment, null); assert.equal(h.calls.stripeCreates.length, 0);
});
test("financial guard still rejects duplicate fee before readiness Stripe reads or Payment writes", async () => {
  const h = harness(); await h.prepare(); h.state.checkout.lineItems.push(clone(h.state.checkout.lineItems.at(-1)));
  h.state.stripeFailure = true;
  assert.equal((await h.start()).status, 500); assert.equal(h.state.payment, null); assert.equal(h.calls.stripeCreates.length, 0);
});

test("an existing open Stripe checkout cannot be reopened after readiness is lost", async () => {
  const h = harness(); await h.prepare();
  h.state.checkout.paymentId = "payment-owner";
  h.state.payment = { id: "payment-owner", stripeCheckoutSessionId: "cs_test_owner", status: "CHECKOUT_STARTED" };
  h.state.account.capabilities.transfers = "inactive";
  assert.equal((await h.start()).status, 409); assert.equal(h.calls.stripeCreates.length, 0);
});

test("completed manager edits and repeated review preserve completion history", async () => {
  const h = harness(); const saved = clone(h.state.business);
  assert.equal((await h.load("app/api/setup/recurring/tiers/route.ts").PUT(h.request({ tiers: [{ id: "plan-owner", clientKey: "existing", name: "Rent", amountCents: 100000 }], advance: true }, "PUT"))).status, 200);
  assert.equal((await h.load("app/api/setup/recurring/billing/route.ts").PUT(h.request({ sameRulesForAll: true, advance: true, rules: [{ recurringPlanId: "plan-owner", dueDay: 1, gracePeriodDays: 1, initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0 }] }, "PUT"))).status, 200);
  assert.equal((await h.load("app/api/setup/recurring/review/route.ts").POST()).status, 200);
  assert.equal(h.state.business.setupStep, "COMPLETE"); assert.deepEqual(h.state.business.setupCompletedAt, saved.setupCompletedAt);
  assert.equal(h.state.business.accountCode, saved.accountCode);
});

test("actual manager dashboard and Stripe setup render the same readiness reasons as checkout", async () => {
  for (const kind of ["incomplete", "stripe-incomplete", "ready", "test", "restricted"]) {
    const h = harness(kind === "test" ? { key: "sk_test_fixture", environment: "development" } : {});
    if (kind === "incomplete") h.state.business.recurringPlans = [];
    if (kind === "stripe-incomplete") h.state.account.details_submitted = false;
    if (kind === "restricted") h.state.account.requirements.disabled_reason = "rejected.fraud";
    const readiness = await h.readiness();
    const dashboard = renderToStaticMarkup(await h.load("app/manager/dashboard/page.tsx").default());
    const bank = renderToStaticMarkup(await h.load("app/setup/stripe/page.tsx").default({ searchParams: Promise.resolve({}) }));
    for (const markup of [dashboard, bank]) {
      assert.ok(markup.includes(readiness.title));
      for (const reason of readiness.reasons) assert.ok(markup.includes(reason.message), reason.message);
      if (!readiness.readyForLive) assert.ok(!markup.includes("Ready for live payments"));
    }
    assert.equal(h.calls.stripeCreates.length, 0);
  }
});

test("new manager resumes setup and invalid configuration cannot unlock the account-code page", async () => {
  const h = harness(); Object.assign(h.state.business, { setupStep: "CONNECT_STRIPE", setupCompletedAt: null, accountCode: null, accountCodeLockedAt: null });
  h.state.business.recurringPlans = [];
  await assert.rejects(h.load("app/manager/dashboard/page.tsx").default(), /REDIRECT:\/setup\/continue/);
  const resume = renderToStaticMarkup(await h.load("app/setup/continue/page.tsx").default());
  assert.ok(resume.includes('href="/setup/recurring/tiers"'));
  await assert.rejects(h.load("app/setup/account-code/page.tsx").default(), /REDIRECT:\/setup\/recurring\/tiers/);
});

test("manager pages reject mismatched owner before any readiness or business read", async () => {
  const h = harness(); h.state.managerBusinessId = "other";
  for (const page of ["app/manager/dashboard/page.tsx", "app/setup/account-code/page.tsx", "app/setup/stripe/page.tsx"]) {
    await assert.rejects(h.load(page).default({ searchParams: Promise.resolve({}) }), /REDIRECT:\/login\/manager/);
  }
  assert.equal(h.calls.queries.length, 0); assert.equal(h.calls.sync.length, 0);
});

test("actual customer payment page renders only the correct ready business", async () => {
  const h = harness(); const page = h.load("app/[accountCode]/page.tsx").default;
  const markup = renderToStaticMarkup(await page({ params: Promise.resolve({ accountCode: "AB-1234" }) }));
  assert.ok(markup.includes("Owner business")); assert.ok(markup.includes("AB-1234")); assert.ok(!markup.includes("CD-5678"));
  h.state.account.capabilities.transfers = "inactive";
  await assert.rejects(page({ params: Promise.resolve({ accountCode: "AB-1234" }) }), /NOT_FOUND/);
});

test("a transfers-only recipient need not process platform-owned ACH/card charges", async () => {
  for (const method of ["ACH", "CARD"]) {
    const h = harness(); h.state.account.charges_enabled = false;
    assert.equal((await h.readiness()).readyForLive, true);
    await h.prepare(method); assert.equal((await h.start()).status, 200);
    assert.equal(h.calls.stripeCreates[0].params.payment_intent_data.transfer_data.destination, "acct_owner");
  }
});
