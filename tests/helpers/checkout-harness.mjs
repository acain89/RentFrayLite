import { attachPublicBudgetStorage } from "./public-budget-storage.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { after, before } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import Stripe from "stripe";

const require = createRequire(import.meta.url);
const enums = require("@prisma/client");
const root = path.resolve(import.meta.dirname, "../..");
const clone = value => structuredClone(value);
const secret = "whsec_b1_isolated";
const sdk = new Stripe("sk_test_b1_no_network");
const compiled = new Map();

// Explicit disposable configuration only; never read the application's DB URL.
// The provisioner independently verifies an empty cluster before writing this.
const postgresConfigPath = process.argv.find(arg => arg.startsWith("--rfl-test-db-config="))?.slice("--rfl-test-db-config=".length);
let postgres;
if (postgresConfigPath) {
  const config = JSON.parse(readFileSync(postgresConfigPath, "utf8"));
  assert.equal(config.isolationVerified, true);
  assert.equal(config.host, "127.0.0.1");
  assert.match(config.role, /^rfl_s5_[a-f0-9]{12}$/);
  assert.equal(config.database, config.role);
  assert.ok(Number.isInteger(config.port) && config.port > 1024 && config.port < 65536);
  assert.match(path.basename(config.data), /^rfl-b1-pg-[a-f0-9]{32}$/);
  assert.equal(path.resolve(config.data), path.resolve(os.tmpdir(), path.basename(config.data)));
  const postgresUrl = `postgresql://${encodeURIComponent(config.role)}:${encodeURIComponent(config.password)}@127.0.0.1:${config.port}/${config.database}`;
  postgres = new enums.PrismaClient({ datasources: { db: { url: postgresUrl } } });
  before(async () => {
    const [identity] = await postgres.$queryRawUnsafe("SELECT current_user AS username, current_database() AS database, current_setting('data_directory') AS directory, host(inet_server_addr()) AS address, inet_server_port() AS port");
    assert.equal(identity.username, config.role);
    assert.equal(identity.database, config.database);
    assert.equal(identity.address, "127.0.0.1");
    assert.equal(identity.port, config.port);
    assert.equal(path.resolve(identity.directory), path.resolve(config.data));
    const indexes = await postgres.$queryRawUnsafe("SELECT indexname,indexdef FROM pg_indexes WHERE indexname IN ('Payment_active_recurring_obligation_unique','Payment_checkoutAttemptId_key')");
    assert.equal(indexes.length, 1);
    assert.equal(indexes[0].indexname, "Payment_checkoutAttemptId_key");
    assert.match(indexes[0].indexdef, /CREATE UNIQUE INDEX/);
  });
  after(() => postgres.$disconnect());
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key,value])=>{
    if(key==="AND")return value.every(w=>matches(row,w));
    if(key==="OR")return value.some(w=>matches(row,w));
    if(key==="paymentId_recipientType_transitionKey")return matches(row,value);
    if(key==="stripePlatformAccountId_stripeAccountId_stripeMode_stripeRefundId")return matches(row,value);
    if(key==="metadata")return (value.path??["stripeEventId"]).reduce((node,key)=>node?.[key],row.metadata)===value.equals;
    if(value&&typeof value==="object"&&!(value instanceof Date)){
      return Object.entries(value).every(([op,v])=>{
        if(op==="mode")return true;
        if(op==="in")return v.includes(row[key]);
        if(op==="lte")return row[key]<=v;
        if(op==="lt")return row[key]<v;
        if(op==="gte")return row[key]>=v;
        if(op==="gt")return row[key]>v;
        if(op==="contains"){const needle=v.replace(/\\([\\%_])/g,"$1");return value.mode==="insensitive"?String(row[key]??"").toLowerCase().includes(needle.toLowerCase()):String(row[key]??"").includes(needle);}
        return row[key]===value;
      });
    }
    return row[key]===value;
  });
}

// The ordinary suite models persistence, not pricing or retry decisions. The
// optional PostgreSQL run repeats the same actual routes with real Prisma.
function isolatedDatabase(business) {
  let state = { refunds: [], notifications: [], suppressions: [], reconciliations: [], payments: [], checkouts: [], audits: [], receipts: [], sessions: [], admins: [], managers: [] };
  let deleted = false;
  let queue = Promise.resolve();
  const knownError = () => new enums.Prisma.PrismaClientKnownRequestError("checkout attempt identity", { code: "P2002", clientVersion: "isolated" });
  const unique = row => {
    if (row.checkoutAttemptId && state.payments.some(other => other.id !== row.id && other.checkoutAttemptId === row.checkoutAttemptId)) throw knownError();
  };
  function model(table) {
    return {
      findUnique: async ({ where, include, select }) => {
        const row = state[table].find(row => matches(row, where));
        return row ? { ...clone(row), ...(include?.business || select?.business ? { business: clone(business) } : {}),
          ...(select?.smsReceipt ? { smsReceipt: clone(state.receipts.find(receipt => receipt.paymentId === row.id) ?? null) } : {}),
          ...(include?.adminAccess ? { adminAccess: clone(state.admins.find(a => a.id === row.adminAccessId) ?? null) } : {}),
          ...(include?.manager ? { manager: clone(state.managers.find(m => m.id === row.managerId) ?? null) } : {}) } : null;
      },
      findUniqueOrThrow: async ({where}) => {const row=state[table].find(row=>matches(row,where));assert.ok(row);return clone(row);},
      findFirst: async ({ where }) => clone(state[table].find(row => matches(row, where)) ?? null),
      deleteMany: async ({ where }) => {
        const rows = state[table].filter(row => matches(row, where));
        state[table] = state[table].filter(row => !matches(row, where));
        return { count: rows.length };
      },
      count: async ({where={}}={})=>state[table].filter(row=>matches(row,where)).length,
      findMany: async ({ where = {}, orderBy, skip=0, take, select } = {}) => {
        const rows=state[table].filter(row=>matches(row,where)).sort((a,b)=>{
          for(const order of orderBy?(Array.isArray(orderBy)?orderBy:[orderBy]):[{id:"asc"}])for(const [key,dir]of Object.entries(order)){
            const sign=a[key]<b[key]?-1:a[key]>b[key]?1:0;if(sign)return dir==="desc"?-sign:sign;
          }return 0;
        }).slice(skip,take===undefined?undefined:skip+take);
        return clone(select?rows.map(row=>Object.fromEntries(Object.entries(select).filter(([,v])=>v===true).map(([k])=>[k,row[k]]))):rows);
      },
      create: async ({ data }) => {
        const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), lastUsedAt: new Date(), isActive: true,
          managerId: null, adminAccessId: null, businessId: null, paidAt: null, stripeCheckoutSessionId: null,
          stripePaymentIntentId: null, stripeChargeId: null, paymentId: null, checkoutAttemptId: null, sourceType: "RECURRING_PLAN", ...clone(data) };
        if (table === "payments") unique(row);
        state[table].push(row); return clone(row);
      },
      update: async ({ where, data }) => {
        const row = state[table].find(row => matches(row, where)); assert.ok(row);
        if (table === "payments") unique({ ...row, ...data });
        for(const [key,value] of Object.entries(data)) row[key]=value&&typeof value==="object"&&"increment" in value?(row[key]??0)+value.increment:clone(value); return clone(row);
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of state[table].filter(row => matches(row, where))) {
          if (table === "payments") unique({ ...row, ...data });
          for(const [key,value] of Object.entries(data)) row[key]=value&&typeof value==="object"&&"increment" in value?(row[key]??0)+value.increment:clone(value); count++;
        }
        return { count };
      },
      upsert: async ({ where, create, update }) => {
        const row = state[table].find(row => matches(row, where));
        if (row) { Object.assign(row, clone(update)); return clone(row); }
        const fresh = { id: randomUUID(), ...(table === "notifications" ? {attempts:0,nextAttemptAt:new Date(),claimedAt:null,providerMessageId:null,sentAt:null,deliveredAt:null,createdAt:new Date(),updatedAt:new Date()} : {}), ...(table === "reconciliations" ? {createdAt:new Date(),updatedAt:new Date(),status:"WAITING_DATA",reasonCode:null,refreshRequested:false,initialObservation:null,latestObservation:null,applicationFeeId:null,actualProcessorFeeCents:null,observedManagementNetCents:null,correctionCents:0,confirmedCorrectionCents:0,unresolvedShortfallCents:null,idempotencyKey:null,reservedAt:null,stripeRefundId:null,leaseToken:null,leaseUntil:null} : {}), ...clone(create) }; state[table].push(fresh); return clone(fresh);
      },
    };
  }
  const db = {
    business: {
      findUniqueOrThrow: async()=>{assert.ok(!deleted);return clone(business);},
      findUnique: async ({ where } = {}) => deleted || (where?.accountCode && where.accountCode !== business.accountCode) || (where?.id && where.id !== business.id) ? null : clone(business),
      update: async ({ data }) => { Object.assign(business, clone(data)); return clone(business); },
      delete: async () => {
        assert.equal(state.payments.length, 0, "financial foreign key must prevent deletion");
        for (const audit of state.audits) audit.businessId = null;
        state.sessions = state.sessions.filter(row => row.businessId !== business.id);
        state.managers = []; deleted = true; return clone(business);
      },
    },
    recurringPlan: {
      findFirst: async ({ where }) => {
        const plan = business.recurringPlans.find(plan => plan.id === where.id && business.id === where.businessId && plan.isActive === where.isActive);
        return plan ? clone({ ...plan, charges: plan.charges.filter(charge => charge.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) }) : null;
      },
    },
    adminAccess: model("admins"), session: model("sessions"), manager: model("managers"),
    stripeConnection: { upsert: async ({ update }) => { Object.assign(business.stripeConnection, clone(update)); return clone(business.stripeConnection); } },
    smsNotification: model("notifications"), smsSuppression: model("suppressions"),
    customerRefundObservation: model("refunds"), directFinancialReconciliation: model("reconciliations"), payment: model("payments"), checkoutSession: model("checkouts"), auditLog: model("audits"), smsReceipt: model("receipts"),
    $queryRaw: async query => {
      assert.ok(/pg_advisory_xact_lock|FOR (?:NO KEY )?UPDATE/.test(query.sql), "production decision must acquire database locks");
      return [];
    },
    $transaction: async (operations, options) => {
      if (Array.isArray(operations)) return Promise.all(operations);
      const reportRead = options?.isolationLevel === "RepeatableRead";
      if (options && !reportRead) assert.equal(options.isolationLevel, "ReadCommitted");
      const previous = queue;
      let release; queue = new Promise(resolve => { release = resolve; });
      await previous;
      const saved = clone(state);
      const savedBusiness = clone(business), savedDeleted = deleted;
      try { return await operations(reportRead ? {payment:{count:db.payment.count,findMany:db.payment.findMany}} : db); } catch (error) {
        state = saved; Object.assign(business, savedBusiness); deleted = savedDeleted; throw error;
      } finally { release(); }
    },
  };
  attachPublicBudgetStorage(db);
  return db;
}

async function harness(method, backend, clock) {
  const suffix = randomUUID().replaceAll("-", "");
  const accountCode = `RT-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
  let business = {
    id: `business-${suffix}`, name: "B1 fixture", ownerName: "Test", contactEmail: "b1@example.test",
    accountCode, status: "ACTIVE", isActive: true, setupCompletedAt: new Date(),
    propertyTimeZone: null, firstStandardBillingDate: null,
    stripeConnection: { stripeAccountId: `acct_${suffix}`, readyForLive: true },
    recurringPlans: [{ id: `plan-${suffix}`, name: "Rent", baseAmountCents: 100000, dueDay: 1, gracePeriodDays: 1,
      initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0, isActive: true, charges: [] }],
  };
  if (backend === "postgres") {
    // Repeated disposable runs can collide in the finite production account-code
    // space. Retry ONLY that fixture constraint, never financial/test failures.
    let accountSuffix = suffix;
    for (let collision = 0; ; collision++) {
    try {
    business = await postgres.business.create({
      data: {
        id: business.id, name: business.name, ownerName: business.ownerName, contactEmail: business.contactEmail,
        // Unique across repeated disposable test runs, without changing test data elsewhere.
        accountCode: `${String.fromCharCode(65 + parseInt(accountSuffix.slice(0, 2), 16) % 26)}${String.fromCharCode(65 + parseInt(accountSuffix.slice(2, 4), 16) % 26)}-${(parseInt(accountSuffix.slice(4, 10), 16) % 10000).toString().padStart(4, "0")}`,
        status: "ACTIVE", setupCompletedAt: business.setupCompletedAt,
        stripeConnection: { create: business.stripeConnection },
        recurringPlans: { create: { ...business.recurringPlans[0], charges: undefined } },
      }, include: { stripeConnection: true, recurringPlans: { include: { charges: true } } },
    });
    break;
    } catch (error) {
      if (collision >= 4 || error.code !== "P2002" || !error.meta?.target?.includes("accountCode")) throw error;
      accountSuffix = randomUUID().replaceAll("-", "");
    }
    }
  }
  const db = backend === "postgres" ? postgres : isolatedDatabase(business);
  const cookieJar = new Map();
  const calls = { creates: [], access: [], cookieOptions: new Map(), errors: [], reads: [] };
  const live = { sessions: new Map(), intents: new Map(), disputes: [], keys: new Map(), fail: null, createFailure: false, onCreate: null, onRead: null, onIntentRead: null, onBeforeReserve: null };
  const stripe = {
    webhooks: sdk.webhooks,
    balance: { retrieve: async () => ({ livemode: false }) },
    accounts: { retrieve: async id => ({ id: typeof id === "string" ? id : "acct_platform", country: "US", details_submitted: true,
      charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" }, requirements: {} }) },
    paymentMethodConfigurations: { list: async () => ({ has_more: false, data: [{ is_default: true, application: null,
      active: true, livemode: false, card: { available: true }, us_bank_account: { available: true } }] }) },
    checkout: { sessions: {
      retrieve: async id => {
        calls.reads.push(id); if (live.fail === "session") throw Error("Injected Stripe lookup failure");
        const row = live.sessions.get(id); assert.ok(row, `unknown Checkout ${id}`);
        await live.onRead?.(id); return clone(row);
      },
      create: async (params, options) => {
        calls.creates.push({ params: clone(params), options: clone(options) });
        assert.equal(options.idempotencyKey, `rfl-payment-${params.client_reference_id}`);
        if (live.keys.has(options.idempotencyKey)) return clone(live.sessions.get(live.keys.get(options.idempotencyKey)));
        const row = { id: `cs_${randomUUID().replaceAll("-", "")}`, livemode: false, mode: "payment", object: "checkout.session", status: "open", payment_status: "unpaid",
          url: "https://checkout.stripe.com/c/pay/isolated-checkout", payment_method_types: clone(params.payment_method_types), currency: "usd", payment_intent: null,
          amount_total: params.line_items.reduce((sum, item) => sum + item.quantity * item.price_data.unit_amount, 0),
          metadata: clone(params.metadata), client_reference_id: params.client_reference_id, after_expiration: null };
        live.sessions.set(row.id, row); live.keys.set(options.idempotencyKey, row.id);
        await live.onCreate?.(row, params, options);
        if (live.createFailure) throw Error("Ambiguous Stripe create/network failure");
        return clone(row);
      },
    } },
    paymentIntents: { retrieve: async id => {
      calls.reads.push(id); if (live.fail === "intent") throw Error("Injected intent read failure");
      assert.ok(live.intents.has(id)); await live.onIntentRead?.(id); return clone(live.intents.get(id));
    } },
    disputes: { list: async () => ({ data: clone(live.disputes).map(d=>({livemode:false,...d})), has_more: false }) },
  };
  const mocks = {
    "@prisma/client": enums, "@/lib/prisma": { prisma: db }, "@/lib/stripe": { getStripeClient: () => stripe },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": {__esModule:true,default:()=>null},
    "next/navigation": { notFound: () => { throw Error("NOT_FOUND"); } },
    "./ReviewPaymentClient": { __esModule: true, default: () => null },
    "@/lib/publicCheckout": { getPublicCheckoutBusiness: async () => clone(business), isRecurringCheckoutBusiness: () => true },
    "node:crypto": require("node:crypto"),
    "node:buffer": require("node:buffer"),
    "node:util": require("node:util"),
    "next/headers": { cookies: async () => ({
      get: name => cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
      set: (name, value, options) => { cookieJar.set(name, value); calls.cookieOptions.set(name, options); },
    }) },
  };
  const cache = new Map();
  class ClockDate extends Date {
    constructor(...args) { return new Date(...(args.length ? args : [clock.now])); }
    static now() { return new Date(clock.now).getTime(); }
    static [Symbol.hasInstance](value) { return value instanceof Date; }
  }
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(root, relative);
    if (!compiled.has(relative)) compiled.set(relative, ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText);
    const mod = { exports: {} };
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/lib/")) return load(`${name.slice(2)}.ts`);
      throw Error(`Unexpected service import: ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports,process,console,Date){${compiled.get(relative)}\n})`, { filename })(
      localRequire, mod, mod.exports, { env: { NODE_ENV: "test", NEXT_PUBLIC_BASE_URL: "https://example.test", STRIPE_SECRET_KEY: "sk_test_b1_fixture", STRIPE_WEBHOOK_SECRET: secret, STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_b1_connected_isolated" } },
      { error: (...args) => calls.errors.push(args), warn: (...args) => calls.errors.push(args) }, clock ? ClockDate : Date);
    if (relative === "lib/checkoutRetry.ts") {
      const reserve = mod.exports.reserveCheckoutAttempt;
      // Scheduling hook only: all reconciliation, locking and return values
      // still come from the production authority.
      mod.exports.reserveCheckoutAttempt = async (...args) => { await live.onBeforeReserve?.(); return reserve(...args); };
    }
    if (relative === "lib/paymentResultAccess.ts") {
      const grant = mod.exports.grantPaymentResultAccess;
      mod.exports.grantPaymentResultAccess = async (...args) => { calls.access.push(args); return grant(...args); };
    }
    cache.set(relative, mod.exports); return mod.exports;
  }
  const request = body => new Request("https://example.test/api", { method: "POST", headers: {"content-type":"application/json",origin:"https://example.test"}, body: JSON.stringify(body) });
  async function prepare(overrides = {}) {
    const response = await load("app/api/public/checkout/session/route.ts").POST(request({
      accountCode: business.accountCode, planId: business.recurringPlans[0].id, unitNumber: "101",
      firstName: "Test", lastName: "Payer", phone: "5555551234", paymentMethod: method, ...overrides,
    }));
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const payload = await response.json();
    return db.checkoutSession.update({ where: { id: payload.checkoutSession.id }, data: { status: "REVIEWED" } });
  }
  const start = checkout => load("app/api/public/checkout/start/route.ts").POST(request({ checkoutSessionId: checkout.id }));
  const payments = () => db.payment.findMany({ where: { businessId: business.id } });
  async function original(status = "FAILED") {
    const checkout = await prepare();
    assert.equal((await start(checkout)).status, 200);
    const [payment] = await payments();
    await db.payment.update({ where: { id: payment.id }, data: { status, failedAt: status === "FAILED" ? new Date() : null } });
    return { payment: await db.payment.findUnique({ where: { id: payment.id } }), checkout, session: live.sessions.get(payment.stripeCheckoutSessionId) };
  }
  // Unlike original(status), which builds deliberately synthetic historical
  // states for B1 edge cases, this fixture is a genuine combined webhook state.
  async function failedAttempt() {
    const attempt = await original("CHECKOUT_STARTED");
    const intent = intentFor(attempt);
    await webhook(attempt, intent, "payment_intent.payment_failed", "FAILED");
    return { ...attempt, intent,
      payment: await db.payment.findUnique({ where: { id: attempt.payment.id } }),
      checkout: await db.checkoutSession.findUnique({ where: { id: attempt.checkout.id } }),
    };
  }
  function intentFor(attempt, status = "requires_payment_method") {
    const p = attempt.payment;
    const intent = { id: `pi_${randomUUID()}`, object: "payment_intent", livemode: false, status, currency: "usd", amount: p.totalChargedCents,
      amount_received: 0, application_fee_amount: p.platformFeeCents, transfer_data: { destination: business.stripeConnection.stripeAccountId },
      metadata: clone(attempt.session.metadata), latest_charge: null, last_payment_error: { code: "card_declined", message: "Declined" } };
    live.intents.set(intent.id, intent); attempt.session.payment_intent = intent.id; return intent;
  }
  async function webhook(attempt, intent, type = "payment_intent.succeeded", expected = "PAID", httpStatus = 200, eventId = `evt_${randomUUID()}`) {
    const event = { id: eventId, object: "event", livemode: false, type, data: { object: clone(intent) } };
    const payload = JSON.stringify(event);
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret });
    const response = await load("app/api/stripe/webhook/route.ts").POST(new Request("https://example.test/api/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": signature }, body: payload,
    }));
    assert.equal(response.status, httpStatus, JSON.stringify(calls.errors));
    const payment = await db.payment.findUnique({ where: { id: attempt.payment.id } });
    assert.equal(payment.status, expected);
    if (expected !== "PAID") return payment;
    assert.ok(payment.paidAt);
    const expectedIntentId = type.startsWith("checkout.") || type.startsWith("charge.dispute.")
      ? typeof intent.payment_intent === "string" ? intent.payment_intent : intent.payment_intent?.id
      : intent.id;
    assert.equal(payment.stripePaymentIntentId, expectedIntentId);
    assert.equal((await db.checkoutSession.findUnique({ where: { id: attempt.checkout.id } })).status, "PAID");
    assert.ok(await db.smsReceipt.findUnique({ where: { paymentId: payment.id } }));
    return payment;
  }
  function settle(attempt, intent) {
    intent.status = "succeeded"; intent.amount_received = attempt.payment.totalChargedCents; intent.last_payment_error = null;
    intent.latest_charge = { id: `ch_${randomUUID()}`, object: "charge", livemode: false, status: "succeeded", paid: true, disputed: false,
      payment_intent: intent.id, currency: "usd", amount: intent.amount,
      payment_method_details: { type: method === "ACH" ? "us_bank_account" : "card" } };
    attempt.session.status = "complete"; attempt.session.payment_status = "paid";
  }
  return { cookieJar, db, calls, live, business, prepare, start, payments, original, failedAttempt, intentFor, webhook, settle, load, stripe, mocks };
}


export { harness, postgres };
