import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, "..");
function load(file, dependencies = {}) {
  const loaded = { exports: {} }, localRequire = name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name];
  };
  const compiled = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: localRequire, console,
    process: { argv: [], cwd: () => root }, setTimeout });
  return loaded.exports;
}
const pricing = load("lib/rflDirectPricing.ts");
const tool = load("scripts/verify-rfl-direct-stripe-sandbox.ts", {
  "node:fs": { readFileSync() { throw Error("Tests must never read credentials"); } },
  "node:path": path, stripe: require("stripe"), "../lib/rflDirectPricing": pricing,
});
const key = "sk_test_fixture", runId = "isolated-test", accountId = "acct_isolated";
const quote = method => pricing.priceRflDirectV1({ managementOwedCents: 100000, paymentMethod: method });
const account = () => ({ id: accountId, country: "US", default_currency: "usd", charges_enabled: true,
  payouts_enabled: true, details_submitted: true, controller: { type: "application", is_controller: true,
    ...tool.accountCreateParams(runId).controller }, capabilities: { card_payments: "active", us_bank_account_ach_payments: "active" },
  requirements: { disabled_reason: null, currently_due: [], past_due: [], pending_verification: [], errors: [] },
  metadata: { rflSandboxVerification: "phase35", rflSandboxPlatform: tool.RFL_SANDBOX_PLATFORM, runId } });
const options = { createAccount: true, runId, roundingProbes: false };
function fake({ platform = tool.RFL_SANDBOX_PLATFORM, livemode = false, connectedMode = false, connected = account() } = {}) {
  const writes = [], reads = [], logs = [], samples = new Map(), intents = new Map();
  const stripe = {
    accounts: { retrieve: async id => { reads.push(["account", id]); return id ? connected : { id: platform }; },
      create: async (params, request) => { writes.push(["account", params, request]); return connected; } },
    balance: { retrieve: async (...args) => { reads.push(["balance", ...args]); return { object: "balance", livemode: args.length ? connectedMode : livemode }; } },
    webhookEndpoints: { list: async () => ({ has_more: false, data: [] }) },
    paymentIntents: { create: async (params, request) => {
      assert.equal(request.stripeAccount, accountId); assert.equal(params.transfer_data, undefined);
      const method = params.payment_method_types[0] === "card" ? "CARD" : "ACH";
      const sample = pricing.priceRflDirectV1({ managementOwedCents: Number(params.metadata.managementOwedCents), paymentMethod: method });
      const suffix = `${method}_${sample.managementOwedCents}`; samples.set(suffix, sample);
      const intent = { id: `pi_${suffix}`, livemode: false, currency: "usd", amount: params.amount,
        application_fee_amount: params.application_fee_amount, status: "succeeded", latest_charge: `ch_${suffix}` };
      intents.set(intent.id, intent); writes.push(["intent", params, request]); return intent;
    }, retrieve: async (id, params, request) => { assert.equal(request.stripeAccount, accountId); return intents.get(id); } },
    charges: { retrieve: async (id, params, request) => {
      assert.equal(request.stripeAccount, accountId); const suffix = id.slice(3), p = samples.get(suffix);
      return { id, payment_intent: `pi_${suffix}`, livemode: false, paid: true, status: "succeeded", currency: "usd",
        amount: p.tenantTotalCents, amount_captured: p.tenantTotalCents, application_fee_amount: p.rflApplicationFeeCents,
        balance_transaction: `txn_${suffix}`, application_fee: `fee_${suffix}` };
    } },
    applicationFees: { retrieve: async id => { const suffix = id.slice(4), p = samples.get(suffix); return {
      id, account: accountId, charge: `ch_${suffix}`, livemode: false, currency: "usd", amount: p.rflApplicationFeeCents,
      amount_refunded: 0, balance_transaction: `txn_platform_${suffix}`, originating_transaction: null };
    } },
    balanceTransactions: { retrieve: async (id, params, request) => {
      const platform = id.startsWith("txn_platform_"), suffix = id.slice(platform ? 13 : 4), p = samples.get(suffix);
      if (platform) { assert.equal(request, undefined); return { id, source: `fee_${suffix}`, currency: "usd", amount: p.rflApplicationFeeCents, fee: 0, net: p.rflApplicationFeeCents, fee_details: [] }; }
      assert.equal(request.stripeAccount, accountId);
      return { id, source: `ch_${suffix}`, currency: "usd", amount: p.tenantTotalCents,
        fee: p.expectedStripeProcessingFeeCents + p.rflApplicationFeeCents, net: p.expectedManagementNetCents,
        fee_details: [{ type: "stripe_fee", amount: p.expectedStripeProcessingFeeCents }, { type: "application_fee", amount: p.rflApplicationFeeCents }] };
    } },
    events: { list: async (params, request) => { assert.equal(request.stripeAccount, accountId); return { has_more: false, data: [] }; } },
  };
  return { stripe, writes, reads, logs, log: (label, value) => logs.push({ label, value }) };
}

for (const invalid of ["", "sk_live_fixture", "rk_live_fixture", "pk_test_fixture", "not-a-key", "sk_test_", " sk_test_fixture"]) {
  test(`credential ${invalid || "missing"} rejected before reads or writes`, async () => {
    const h = fake(); await assert.rejects(tool.runSandboxVerification(h.stripe, invalid, options, h.log), /STOP:/);
    assert.equal(h.reads.length, 0); assert.equal(h.writes.length, 0);
  });
}
for (const valid of ["sk_test_fixture", "rk_test_fixture"]) test(`${valid.split("_")[0]} test prefix accepted`, () => tool.requireTestKey(valid));
test("wrong platform identity rejected before balance or mutation", async () => {
  const h = fake({ platform: "acct_other" }); await assert.rejects(tool.runSandboxVerification(h.stripe, key, options, h.log), /platform account ID mismatch/);
  assert.equal(h.writes.length, 0); assert.equal(h.reads.length, 1);
});
for (const livemode of [true, undefined, null, "false"]) test(`API livemode=${String(livemode)} rejects mutations`, async () => {
  const h = fake(); h.stripe.balance.retrieve = async () => ({ object: "balance", livemode });
  await assert.rejects(tool.runSandboxVerification(h.stripe, key, options, h.log), /non-live API evidence/); assert.equal(h.writes.length, 0);
});
test("network/auth failure does not create objects", async () => {
  const h = fake(); h.stripe.accounts.retrieve = async () => { throw Error("unavailable"); };
  await assert.rejects(tool.runSandboxVerification(h.stripe, key, options, h.log)); assert.equal(h.writes.length, 0);
});
test("connected-account live balance blocks payments", async () => {
  const h = fake({ connectedMode: true }); await assert.rejects(tool.runSandboxVerification(h.stripe, key, options, h.log), /connected non-live/);
  assert.equal(h.writes.filter(row => row[0] === "intent").length, 0);
});
test("identity/mode reported before first account creation", async () => {
  const h = fake(), create = h.stripe.accounts.create;
  h.stripe.accounts.create = async (...args) => { assert.ok(h.logs.some(log => log.label === "PASS_IDENTITY_AND_NON_LIVE")); return create(...args); };
  assert.equal(await tool.runSandboxVerification(h.stripe, key, options, h.log), true);
  assert.equal(h.writes.filter(row => row[0] === "intent").length, 2);
  assert.ok(!JSON.stringify(h.logs).includes(key));
});
for (const field of ["charges_enabled", "payouts_enabled", "details_submitted"]) test(`${field} disabled blocks test charges`, async () => {
  const connected = account(); connected[field] = false; const h = fake({ connected });
  assert.equal(await tool.runSandboxVerification(h.stripe, key, options, h.log), false);
  assert.equal(h.writes.filter(row => row[0] === "intent").length, 0);
});
for (const mutation of [a => a.controller.fees.payer = "application_express", a => a.controller.losses.payments = "application",
  a => a.controller.requirement_collection = "application", a => a.controller.stripe_dashboard.type = "express",
  a => a.capabilities.card_payments = "pending", a => a.capabilities.us_bank_account_ach_payments = "inactive",
  a => a.requirements.currently_due = ["tos_acceptance.date"], a => a.requirements.pending_verification = ["individual.verification"],
  a => a.requirements = null, a => a.metadata.runId = "other"]) test(`incomplete/incompatible account case ${String(mutation)} blocks charges`, async () => {
  const connected = account(); mutation(connected); const h = fake({ connected });
  assert.equal(await tool.runSandboxVerification(h.stripe, key, options, h.log), false);
  assert.equal(h.writes.filter(row => row[0] === "intent").length, 0);
});
test("create params use target tuple, documented test data and omit TOS attestation", () => {
  const params = tool.accountCreateParams(runId);
  assert.equal(params.type, undefined); assert.equal(params.tos_acceptance, undefined);
  assert.equal(params.controller.fees.payer, "account"); assert.equal(params.controller.losses.payments, "stripe");
  assert.equal(params.controller.requirement_collection, "stripe"); assert.equal(params.controller.stripe_dashboard.type, "full");
  assert.equal(params.individual.id_number, "000000000"); assert.equal(params.external_account.account_number, "000123456789");
  assert.equal(params.business_profile.url, "https://accessible.stripe.com");
  assert.equal(params.business_profile.support_phone, "0000000000");
});
test("RFL .env parser rejects missing/duplicate/live key without environment fallback", () => {
  assert.equal(tool.parseRflKey('STRIPE_SECRET_KEY="sk_test_fixture"\n'), key);
  for (const text of ["NODE_ENV=test", "STRIPE_SECRET_KEY=sk_live_fixture", "STRIPE_SECRET_KEY=sk_test_fixture\nSTRIPE_SECRET_KEY=sk_test_other"]) assert.throws(() => tool.parseRflKey(text), /STOP:/);
});
for (const args of [[], ["--create-account"], ["--create-account", "--account-id", accountId, "--run-id", runId],
  ["--platform-id", "acct_other"], ["--create-account", "--run-id", "../other"], ["--account-id", "invalid", "--run-id", runId]]) {
  test(`CLI refuses ambiguous/unsafe invocation ${JSON.stringify(args)}`, () => assert.throws(() => tool.parseOptions(args), /STOP:/));
}
test("rounding probes exercise below/tie/above cases without changing pricing", async () => {
  const h = fake(); assert.equal(await tool.runSandboxVerification(h.stripe, key, { ...options, roundingProbes: true }, h.log), true);
  assert.equal(h.writes.filter(row => row[0] === "intent").length, 5);
  assert.deepEqual(h.writes.filter(row => row[0] === "intent").slice(2).map(row => row[1].amount), [499, 500, 501]);
});
for (const method of ["CARD", "ACH"]) test(`${method} actual Stripe request uses authoritative pricing and test fixture`, () => {
  const p = quote(method), params = tool.directIntentParams(p, runId);
  assert.equal(params.amount, p.tenantTotalCents); assert.equal(params.application_fee_amount, p.rflApplicationFeeCents);
  assert.equal(params.transfer_data, undefined); assert.equal(params.payment_method, method === "CARD" ? "pm_card_visa" : "pm_usBankAccount_success");
});
test("economic mismatch is reported rather than changing pricing", () => {
  const p = quote("CARD");
  const charge = { id: "ch_test", balance_transaction: "txn_test", application_fee: "fee_test", application_fee_amount: p.rflApplicationFeeCents,
    livemode: false, paid: true, status: "succeeded", currency: "usd", amount: p.tenantTotalCents, amount_captured: p.tenantTotalCents };
  const tx = { id: "txn_test", source: charge.id, currency: "usd", amount: p.tenantTotalCents, fee: p.tenantProcessingFeeCents + 1,
    net: p.managementOwedCents - 1, fee_details: [{ type: "stripe_fee", amount: p.expectedStripeProcessingFeeCents + 1 }, { type: "application_fee", amount: p.rflApplicationFeeCents }] };
  const fee = { id: "fee_test", account: accountId, charge: charge.id, amount: p.rflApplicationFeeCents, amount_refunded: 0,
    currency: "usd", livemode: false, balance_transaction: "txn_platform", originating_transaction: null };
  const platformTx = { id: "txn_platform", source: fee.id, currency: "usd", amount: fee.amount, fee: 0, net: fee.amount };
  const result = tool.compareEconomics(p, charge, tx, fee, platformTx, accountId);
  assert.equal(result.stripeFeeDeltaCents, 1); assert.equal(result.managementNetDeltaCents, -1);
  assert.equal(result.invariants.stripeFeeMatchesPlanning, false); assert.equal(result.reconciliationPlanOnly.applicationFeeRefundCents, 1);
  tx.fee_details.push({ type: "tax", amount: 1 }); assert.equal(tool.compareEconomics(p, charge, tx, fee, platformTx, accountId).invariants.completeFeeBreakdown, false);
});
test("script has no DB/application imports or application mutations", () => {
  const source = readFileSync(path.join(root, "scripts/verify-rfl-direct-stripe-sandbox.ts"), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:prisma|checkout|stripePaymentWebhook)/);
  assert.doesNotMatch(source, /stripe\.(?:payouts|transfers|refunds)\.create|applicationFees\.createRefund|process\.env/);
});
