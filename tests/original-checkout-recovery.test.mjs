import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { webhookFixture } from "./helpers/connected-webhook-harness.mjs";
import { harness } from "./helpers/checkout-harness.mjs";

async function fixture(model = "LEGACY_DESTINATION", method = "CARD", status = "FAILED") {
  const f = await webhookFixture("isolated", model, method), locks = [];
  let now = new Date();
  const query = f.db.$queryRaw;
  f.db.$queryRaw = async sql => {
    if (/clock_timestamp/.test(sql.sql)) return [{ now }];
    locks.push(sql.sql); return query(sql);
  };
  const admin = await f.db.adminAccess.create({ data: { codeHash: "synthetic-authority", isActive: true } });
  const session = await f.db.session.create({ data: { type: "ADMIN", tokenHash: "synthetic-session-hash", adminAccessId: admin.id, expiresAt: new Date(now.getTime() + 3600000) } });
  const operator = { ...session, adminAccess: admin, manager: null, business: null };
  await f.db.payment.update({ where: { id: f.payment.id }, data: { stripeCheckoutSessionId: null, status,
    failedAt: status === "FAILED" ? new Date() : null, failureMessage: status === "FAILED" ? "Original ambiguous create" : null } });
  await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { stripeCheckoutSessionId: null, status: "REVIEWED" } });
  const originalCreates = f.calls.creates.length, forbidden = () => { throw Error("Unexpected money or creation operation"); };
  f.stripe.checkout.sessions.create = forbidden;
  f.stripe.refunds = f.stripe.transfers = f.stripe.payouts = new Proxy({}, { get: forbidden });
  const retrieve = f.stripe.checkout.sessions.retrieve;
  f.stripe.checkout.sessions.retrieve = async (id, params, options) => {
    assert.equal(options.timeout, 5000); assert.equal(options.maxNetworkRetries, 0);
    assert.equal(options.stripeAccount, model === "DIRECT" ? f.payment.stripeConnectedAccountId : undefined);
    return retrieve(id, params, options);
  };
  const command = { businessId: f.business.id, paymentId: f.payment.id, checkoutAttemptId: f.checkout.id, stripeSessionId: f.session.id };
  const service = f.load("lib/originalCheckoutRecovery.ts");
  const recover = (apply = true, patch = {}, actor = operator, identity = { platformAccountId: "acct_platform", mode: "test" }, mode = "test") =>
    service.recoverOriginalCheckoutSession(f.stripe, { ...command, ...patch }, actor, identity, mode, apply);
  const snapshot = async () => ({ p: await f.current(), c: await f.db.checkoutSession.findUnique({ where: { id: f.checkout.id } }) });
  const checkNoCreation = async () => { assert.equal((await f.payments()).length, 1); assert.equal(f.calls.creates.length, originalCreates); };
  return { ...f, operator, command, service, recover, snapshot, checkNoCreation, locks, expire: () => { now = new Date(now.getTime() + 7200000); } };
}

for (const model of ["LEGACY_DESTINATION", "DIRECT"]) for (const method of ["CARD", "ACH"]) {
  const label = model + " " + method;
  test(label + ": preview is read-only, apply restores original identities without lifecycle/history changes", async () => {
    const f = await fixture(model, method), before = await f.snapshot();
    assert.equal((await f.recover(false)).kind, "VERIFIED_PREVIEW"); assert.deepEqual(await f.snapshot(), before);
    assert.equal((await f.audits()).filter(a => a.action === "ORIGINAL_CHECKOUT_IDENTITY_VERIFIED").length, 0);
    const result = await f.recover(), after = await f.snapshot();
    assert.equal(result.kind, "RESTORED"); assert.equal(result.localPaymentStatus, "FAILED"); assert.equal("url" in result, false);
    assert.deepEqual({ ...after.p, stripeCheckoutSessionId: null }, before.p);
    assert.deepEqual({ ...after.c, stripeCheckoutSessionId: null }, before.c);
    assert.equal(after.p.stripeCheckoutSessionId, f.session.id); assert.equal(after.c.stripeCheckoutSessionId, f.session.id);
    assert.equal(f.state.reads.some(r => r.options.stripeAccount), model === "DIRECT");
    assert.match(f.locks[0], /AdminAccess/); assert.match(f.locks[1], /Session/); assert.match(f.locks[2], /Business/); assert.match(f.locks[3], /Payment/); assert.match(f.locks[4], /CheckoutSession/);
    assert.equal(f.load("lib/paymentArchitecturePolicy.ts").directPaymentCreationEnabled(), false);
    assert.equal(f.load("lib/directFinancialRunnerPolicy.ts").directFinancialExecutionEnabled(), false);
    await f.checkNoCreation();
  });
  test(label + ": concurrent duplicates preserve one binding and one audit", async () => {
    const f = await fixture(model, method), results = await Promise.all(Array.from({ length: 4 }, () => f.recover()));
    assert.equal(results.filter(r => r.kind === "RESTORED").length, 1);
    assert.equal((await f.recover()).kind, "ALREADY_LINKED");
    assert.equal((await f.audits()).filter(a => a.action === "ORIGINAL_CHECKOUT_IDENTITY_VERIFIED").length, 1);
    await f.checkNoCreation();
  });
  for (const providerStatus of ["open", "complete", "expired"]) test(label + ": " + providerStatus + " original session never manufactures settlement or replacement", async () => {
    const f = await fixture(model, method); f.session.status = providerStatus;
    if (providerStatus === "complete") { f.settle(); f.session.payment_status = "paid"; }
    const result = await f.recover(); assert.equal(result.providerStatus, providerStatus);
    assert.equal((await f.current()).status, "FAILED"); assert.equal((await f.current()).paidAt, null);
    await f.checkNoCreation();
  });
}

for (const model of ["LEGACY_DESTINATION", "DIRECT"]) {
  for (const change of ["business", "attempt", "payment", "unknownSession", "currency", "amount", "method", "metadata", "reference", "architecture", "account", "platform", "mode", "intentCurrency", "intentAmount", "intentMethod", "intentFee", "intentMetadata", "intentDestination", "intentStatus", "receivedAmount", "storedIntent", "storedCharge", "unknownHistory"]) {
    test(model + ": blocks " + change + " without writes or creation", async () => {
      const f = await fixture(model), patch = {};
      if (change === "business") patch.businessId = "other-business";
      if (change === "attempt") patch.checkoutAttemptId = "other-attempt";
      if (change === "payment") patch.paymentId = "other-payment";
      if (change === "unknownSession") patch.stripeSessionId = "cs_unknown";
      if (change === "currency") f.session.currency = "eur";
      if (change === "amount") f.session.amount_total++;
      if (change === "method") f.session.payment_method_types = ["us_bank_account"];
      if (change === "metadata") f.session.metadata = { ...f.session.metadata, businessId: "other-business" };
      if (change === "reference") f.session.client_reference_id = "other-payment";
      if (change === "architecture") await f.db.payment.update({ where: { id: f.payment.id }, data: { chargeModel: model === "DIRECT" ? "LEGACY_DESTINATION" : "DIRECT" } });
      if (change === "account") {
        for (const [table, id] of [["payment", f.payment.id], ["checkoutSession", f.checkout.id]]) await f.db[table].update({ where: { id }, data: { stripeConnectedAccountId: "acct_other" } });
      }
      if (change === "platform") f.state.platformId = "acct_otherplatform";
      if (change === "mode") f.session.livemode = true;
      if (change === "intentCurrency") f.intent.currency = "eur";
      if (change === "intentAmount") f.intent.amount++;
      if (change === "intentMethod") f.intent.payment_method_types = ["us_bank_account"];
      if (change === "intentFee") f.intent.application_fee_amount++;
      if (change === "intentMetadata") f.intent.metadata.paymentId = "other-payment";
      if (change === "intentDestination") f.intent.transfer_data = { destination: "acct_other" };
      if (change === "intentStatus") f.intent.status = "unknown";
      if (change === "receivedAmount") f.intent.amount_received = f.payment.totalChargedCents + 1;
      if (change === "storedIntent") await f.db.payment.update({ where: { id: f.payment.id }, data: { stripePaymentIntentId: "pi_other" } });
      if (change === "storedCharge") await f.db.payment.update({ where: { id: f.payment.id }, data: { stripeChargeId: "ch_other" } });
      if (change === "unknownHistory") for (const [table, id] of [["payment", f.payment.id], ["checkoutSession", f.checkout.id]]) await f.db[table].update({ where: { id }, data: { chargeModel: null, pricingVersion: null, stripeConnectedAccountId: null, stripePlatformAccountId: null, stripeMode: null, expectedStripeProcessingFeeCents: null, rflApplicationFeeCents: null } });
      const before = await f.snapshot(); await assert.rejects(() => f.recover(true, patch), /Original checkout recovery is unverified/);
      assert.deepEqual(await f.snapshot(), before); await f.checkNoCreation();
    });
  }
  test(model + ": no known identity blocks before provider access", async () => {
    const f = await fixture(model), reads = f.state.reads.length, before = await f.snapshot();
    await assert.rejects(() => f.recover(true, { stripeSessionId: "" }));
    assert.equal(f.state.reads.length, reads); assert.deepEqual(await f.snapshot(), before);
  });
  test(model + ": deactivated business permits history-only repair, never collection", async () => {
    const f = await fixture(model); await f.db.business.update({ where: { id: f.business.id }, data: { isActive: false, status: "DISABLED" } });
    assert.equal((await f.recover()).kind, "RESTORED"); assert.equal((await f.current()).status, "FAILED");
    const business = await f.db.business.findUnique({ where: { id: f.business.id } }); assert.equal(business.isActive, false); assert.equal(business.status, "DISABLED");
    await f.checkNoCreation();
  });
  test(model + ": orphan pointer restores only the payment's unique original attempt", async () => {
    const f = await fixture(model); await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { paymentId: null } });
    assert.equal((await f.recover()).kind, "RESTORED"); assert.equal((await f.snapshot()).c.paymentId, f.payment.id); await f.checkNoCreation();
  });
  test(model + ": ACH processing and delayed signed settlement, duplicates/out-of-order events retain one payment", async () => {
    const f = await fixture(model, "ACH", "CREATED"), early = f.event("payment_intent.processing");
    assert.equal((await f.send(early)).status, 500);
    await f.recover(); assert.equal((await f.send(early)).status, 200); assert.equal((await f.current()).status, "PENDING");
    f.settle(); const event = f.event(); assert.equal((await f.send(event)).status, 200); assert.equal((await f.send(event)).status, 200);
    assert.equal((await f.send({ ...early, id: "evt_stale_recovery" })).status, 200); assert.equal((await f.current()).status, "PAID");
    await f.checkNoCreation();
  });
}

for (const change of ["manager", "revoked", "expired", "token", "code"]) test("operator " + change + " cannot restore identity", async () => {
  const f = await fixture(), before = await f.snapshot();
  if (change === "manager") f.operator.type = "MANAGER";
  if (change === "revoked") f.state.hook = () => f.db.adminAccess.update({ where: { id: f.operator.adminAccessId }, data: { isActive: false } });
  if (change === "expired") f.state.hook = () => f.expire();
  if (change === "token") f.state.hook = () => f.db.session.update({ where: { id: f.operator.id }, data: { tokenHash: "rotated" } });
  if (change === "code") f.state.hook = () => f.db.adminAccess.update({ where: { id: f.operator.adminAccessId }, data: { codeHash: "rotated" } });
  await assert.rejects(() => f.recover()); assert.deepEqual(await f.snapshot(), before); await f.checkNoCreation();
});

for (const change of ["status", "snapshot", "conflictingSession", "auditFailure", "expiryBeforeCommit"]) test("final lock " + change + " fails closed and preserves history", async () => {
  const f = await fixture();
  if (change === "status") f.state.hook = () => f.db.payment.update({ where: { id: f.payment.id }, data: { status: "RETURNED", returnedAt: new Date() } });
  if (change === "snapshot") f.state.hook = () => f.db.payment.update({ where: { id: f.payment.id }, data: { itemDescription: "Changed concurrently" } });
  if (change === "conflictingSession") f.state.hook = () => f.db.payment.update({ where: { id: f.payment.id }, data: { stripeCheckoutSessionId: "cs_conflict" } });
  if (["auditFailure", "expiryBeforeCommit"].includes(change)) {
    const create = f.db.auditLog.create;
    f.db.auditLog.create = async args => { if (change === "auditFailure") throw Error("private-provider-tenant-marker"); const row = await create(args); f.expire(); return row; };
  }
  await assert.rejects(() => f.recover(), error => !error.message.includes("private-provider-tenant-marker"));
  assert.equal((await f.snapshot()).c.stripeCheckoutSessionId, null);
  assert.equal((await f.current()).stripeCheckoutSessionId, change === "conflictingSession" ? "cs_conflict" : null);
  if (change === "status") assert.equal((await f.current()).status, "RETURNED");
  assert.equal((await f.audits()).filter(a => a.action === "ORIGINAL_CHECKOUT_IDENTITY_VERIFIED").length, 0);
  await f.checkNoCreation();
});

test("audit/result allowlist excludes provider payload, credentials, cookies and payer information", async () => {
  const f = await fixture(); const result = await f.recover(true, { privatePayload: "private-extra-request-marker" }), audit = (await f.audits()).find(a => a.action === "ORIGINAL_CHECKOUT_IDENTITY_VERIFIED");
  const text = JSON.stringify({ result, audit });
  for (const value of [f.operator.tokenHash, f.operator.adminAccess.codeHash, f.payment.payerPhone, f.payment.payerFirstName, "checkout.stripe.com", "lineItemsSnapshot", "client_secret", "private-extra-request-marker"]) assert.ok(!text.includes(value), value);
});

test("no public recovery caller, no provider creation/settlement API, unchanged source gates", () => {
  const source = readFileSync("lib/originalCheckoutRecovery.ts", "utf8");
  assert.doesNotMatch(source, /\.sessions\.create|\.confirm\(|\.capture\(|\.cancel\(|createRefund|grantPaymentResultAccess|processStripePaymentEvent/);
  assert.ok(readFileSync("scripts/recover-original-checkout.ts", "utf8").includes("let apply = false"));
  const inspect = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.[jt]sx?$/.test(file)) assert.doesNotMatch(readFileSync(file, "utf8"), /originalCheckoutRecovery|recoverOriginalCheckoutSession|recover-original-checkout/, file);
  } };
  inspect("app");
});

for (const mode of ["unknown", "live"]) test("unverified credential mode " + mode + " blocks before provider access", async () => {
  const f = await fixture(), reads = f.state.reads.length;
  await assert.rejects(() => f.recover(true, {}, f.operator, { platformAccountId: "acct_platform", mode: "test" }, mode));
  assert.equal(f.state.reads.length, reads); assert.equal((await f.current()).stripeCheckoutSessionId, null);
});

test("old prepared direct attempt recovers after rollback without cookies, repricing or current-connection substitution", async () => {
  const f = await fixture("DIRECT", "ACH", "CREATED"); f.cookieJar.clear();
  await f.db.payment.update({ where: { id: f.payment.id }, data: { createdAt: new Date("2020-01-01") } });
  await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { expiresAt: new Date("2020-01-02") } });
  await f.db.stripeConnection.upsert({ where: { businessId: f.business.id }, update: { stripeAccountId: "acct_currentchanged" }, create: {} });
  const before = await f.snapshot(); assert.equal((await f.recover()).kind, "RESTORED");
  assert.deepEqual({ ...(await f.current()), stripeCheckoutSessionId: null }, before.p);
  for (const gate of ["directQuoteIssuanceEnabled", "directReservationEnabled", "directPaymentCreationEnabled", "directFinancialExecutionEnabled"]) assert.equal(f.load("lib/paymentArchitecturePolicy.ts")[gate](), false);
  await f.checkNoCreation();
});

for (const model of ["LEGACY_DESTINATION", "DIRECT"]) {
  test(model + ": original session without an Intent repairs identity only", async () => {
    const f = await fixture(model); f.session.payment_intent = null; f.session.status = "expired";
    const before = await f.snapshot(), result = await f.recover();
    assert.equal(result.providerIntentObserved, false);
    assert.deepEqual({ ...(await f.current()), stripeCheckoutSessionId: null }, before.p);
    await f.checkNoCreation();
  });
  test(model + ": foreign original checkout pointer cannot be repaired", async () => {
    const f = await fixture(model); await f.db.checkoutSession.update({ where: { id: f.checkout.id }, data: { paymentId: "foreign-payment" } });
    const before = await f.snapshot(); await assert.rejects(() => f.recover()); assert.deepEqual(await f.snapshot(), before);
  });
  for (const kind of ["platform", "balance", "session", "intent", "charge"]) test(model + ": " + kind + " provider read failure remains unconfirmed", async () => {
    const f = await fixture(model); f.settle(); f.state.fault = kind;
    const before = await f.snapshot(); await assert.rejects(() => f.recover()); assert.deepEqual(await f.snapshot(), before); await f.checkNoCreation();
  });
  test(model + ": wrong charge parent/amount is not recovery proof", async () => {
    const f = await fixture(model); f.settle(); f.intent.latest_charge.payment_intent = "pi_other";
    const before = await f.snapshot(); await assert.rejects(() => f.recover()); assert.deepEqual(await f.snapshot(), before);
  });
}

test("legacy card failure resumes the original browser-authorized session after repair", async () => {
  const f = await fixture(); f.session.status = "open"; f.intent.status = "requires_payment_method"; f.intent.amount_received = 0;
  await f.recover();
  // The webhook fixture exposes minimal account identity objects. Restore the
  // normal ready-account shape for the existing public readiness checks.
  f.stripe.accounts.retrieve = async id => ({ id: typeof id === "string" ? id : "acct_platform", country: "US", details_submitted: true,
    charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" }, requirements: {} });
  // Existing legacy resumption reads under its own transaction. Use the base
  // retry reader contract here; the webhook reader forbids that scheduling.
  f.stripe.checkout.sessions.retrieve = async id => { assert.ok(f.live.sessions.has(id)); return structuredClone(f.live.sessions.get(id)); };
  f.stripe.paymentIntents.retrieve = async id => { assert.ok(f.live.intents.has(id)); return structuredClone(f.live.intents.get(id)); };
  const response = await f.start(f.checkout); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).paymentId, f.payment.id); await f.checkNoCreation();
});

test("real mocked lost legacy create response restores the original session, never replays creation", async () => {
  const h = await harness("CARD", "isolated"), checkout = await h.prepare();
  h.live.createFailure = true; assert.equal((await h.start(checkout)).status, 500);
  const [p] = await h.payments(), [session] = h.live.sessions.values();
  assert.equal(p.status, "FAILED"); assert.equal(p.stripeCheckoutSessionId, null); assert.ok(session);
  const query = h.db.$queryRaw;
  h.db.$queryRaw = sql => /clock_timestamp/.test(sql.sql) ? [{ now: new Date() }] : query(sql);
  const admin = await h.db.adminAccess.create({ data: { codeHash: "synthetic-admin", isActive: true } });
  const actor = await h.db.session.create({ data: { type: "ADMIN", adminAccessId: admin.id, tokenHash: "synthetic-hash", expiresAt: new Date(Date.now() + 3600000) } });
  h.stripe.accounts.retrieve = async () => ({ id: "acct_platform" }); h.stripe.balance.retrieve = async () => ({ livemode: false });
  h.stripe.checkout.sessions.create = () => { throw Error("Creation replay prohibited"); };
  const result = await h.load("lib/originalCheckoutRecovery.ts").recoverOriginalCheckoutSession(h.stripe, {
    businessId: p.businessId, paymentId: p.id, checkoutAttemptId: checkout.id, stripeSessionId: session.id,
  }, { ...actor, adminAccess: admin, manager: null, business: null }, { platformAccountId: "acct_platform", mode: "test" }, "test", true);
  assert.equal(result.kind, "RESTORED"); assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  assert.equal((await h.db.payment.findUnique({ where: { id: p.id } })).status, "FAILED");
});

for (const scenario of ["preview", "apply", "duplicateFlag", "unknownFlag", "missingFlag", "providerError", "cleanupError"]) test("operator command " + scenario + " is bounded and sanitized", async () => {
  const output = ts.transpileModule(readFileSync("scripts/recover-original-checkout.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const args = ["--admin-session", "internal-session", "--business", "business", "--payment", "payment", "--attempt", "attempt", "--session", "cs_original", "--platform", "acct_platform", "--mode", "test"];
  if (scenario === "apply") args.push("--apply");
  if (scenario === "duplicateFlag") args.push("--business", "other");
  if (scenario === "unknownFlag") args.push("--force");
  if (scenario === "missingFlag") args.splice(0, 2);
  const calls = [], logs = [], processMock = { argv: ["node", "script", ...args], env: { STRIPE_SECRET_KEY: "synthetic-not-a-real-key" }, exitCode: 0 };
  let done; const finished = new Promise(resolve => { done = resolve; });
  const mocks = {
    "../lib/prisma": { prisma: { session: { findUnique: async () => ({ id: "internal-session" }) }, $disconnect: async () => { done(); if (scenario === "cleanupError") throw Error("private-tenant-secret"); } } },
    "../lib/stripe": { getStripeClient: () => ({}) },
    "../lib/stripePaymentContext": { classifyStripeCredentialMode: () => "test" },
    "../lib/originalCheckoutRecovery": { recoverOriginalCheckoutSession: async (...values) => { calls.push(values); if (scenario === "providerError") throw Error("private-tenant-secret"); return { kind: "VERIFIED_PREVIEW" }; } },
  };
  vm.runInThisContext("(function(require,exports,process,console){" + output + "\n})")(name => { assert.ok(mocks[name], name); return mocks[name]; }, {}, processMock, { log: value => logs.push(value), error: value => logs.push(value) });
  await finished;
  await new Promise(resolve => setImmediate(resolve));
  const valid = ["preview", "apply", "providerError", "cleanupError"].includes(scenario);
  assert.equal(calls.length, valid ? 1 : 0);
  if (valid) assert.equal(calls[0][5], scenario === "apply");
  assert.equal(processMock.exitCode, ["preview", "apply"].includes(scenario) ? 0 : 1);
  assert.ok(!logs.join("").includes("private-tenant-secret"));
  assert.ok(!logs.join("").includes(processMock.env.STRIPE_SECRET_KEY));
});
