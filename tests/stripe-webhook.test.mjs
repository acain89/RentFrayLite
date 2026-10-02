import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import Stripe from "stripe";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const enums = require("@prisma/client");
const root = path.resolve(import.meta.dirname, "..");
const secret = "whsec_isolated_webhook_test";
const sdk = new Stripe("sk_test_isolated_no_network");
const clone = (value) => structuredClone(value);
const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);

function harness(method = "ACH", initialStatus = "CHECKOUT_STARTED") {
  const fee = method === "ACH" ? 995 : 4900;
  const metadata = {
    product: "RentFrayLite", paymentId: "payment-test", checkoutSessionId: "checkout-test",
    businessId: "business-test", accountCode: "TEST", billingCycle: "2026-10",
  };
  const payment = {
    id: metadata.paymentId, businessId: metadata.businessId, status: initialStatus, paymentMethod: method,
    stripeCheckoutSessionId: "cs_test", stripePaymentIntentId: "pi_test", stripeChargeId: "ch_test",
    subtotalCents: 100000, platformFeeCents: fee, totalChargedCents: 100000 + fee, businessProceedsCents: 100000,
    payerPhone: "5555551234", itemDescription: "Monthly rent", referenceLabel: "Unit 101",
    lineItemsSnapshot: [{ type: "BASE", label: "Rent", amountCents: 100000 }, { type: "PLATFORM_FEE", label: "Platform service fee", amountCents: fee }],
    pendingAt: null, paidAt: null, failedAt: null, expiredAt: null, returnedAt: null, disputedAt: null,
    failureCode: null, failureMessage: null,
    business: { id: metadata.businessId, name: "Test Storage", accountCode: "TEST", stripeConnection: { stripeAccountId: "acct_test" } },
  };
  const checkout = {
    id: metadata.checkoutSessionId, paymentId: payment.id, businessId: payment.businessId,
    accountCode: "TEST", billingCycle: "2026-10", paymentMethod: method,
    stripeCheckoutSessionId: payment.stripeCheckoutSessionId, status: "CHECKOUT_STARTED",
    totalCents: payment.totalChargedCents, platformFeeCents: fee,
  };
  const state = { payments: new Map([[payment.id, payment]]), checkouts: new Map([[checkout.id, checkout]]), receipts: new Map(), audits: [] };
  const live = {
    session: {
      id: "cs_test", object: "checkout.session", mode: "payment", status: "complete", payment_status: "unpaid",
      payment_intent: "pi_test", client_reference_id: payment.id, metadata: clone(metadata),
      currency: "usd", amount_total: payment.totalChargedCents,
    },
    intent: {
      id: "pi_test", object: "payment_intent", status: "processing", currency: "usd",
      amount: payment.totalChargedCents, amount_received: 0, application_fee_amount: fee, transfer_data: { destination: "acct_test" },
      metadata: clone(metadata), last_payment_error: null,
      latest_charge: {
        id: "ch_test", object: "charge", payment_intent: "pi_test", amount: payment.totalChargedCents,
        currency: "usd", status: "pending", paid: false, disputed: false,
        payment_method_details: { type: method === "ACH" ? "us_bank_account" : "card" },
      },
    },
    disputes: [],
  };
  const calls = { locks: 0, transactions: 0, reads: 0, stripeReads: 0, paymentWrites: 0, checkoutWrites: 0, receiptCreates: 0, smsSends: 0 };
  const faults = { audit: false, checkout: false, cas: false, stripe: false };
  const hooks = { intentRead: null };
  const locks = new Map();
  const find = (rows, where) => clone([...rows.values()].find(row => matches(row, where)) ?? null);
  const prisma = {
    payment: { findUnique: async ({ where, select }) => {
      calls.reads++;
      const row = find(state.payments, where);
      return row && select?.smsReceipt ? { ...row, smsReceipt: clone(state.receipts.get(row.id) ?? null) } : row;
    } },
    checkoutSession: { findUnique: async ({ where }) => { calls.reads++; return find(state.checkouts, where); } },
    smsReceipt: {
      updateMany: async ({ where, data }) => {
        const row = [...state.receipts.values()].find(row => matches(row, where));
        if (!row) return { count: 0 };
        Object.assign(row, clone(data)); return { count: 1 };
      },
      findUnique: async ({ where }) => {
        const row = [...state.receipts.values()].find(row => matches(row, where));
        return row ? { ...clone(row), payment: clone(state.payments.get(row.paymentId)) } : null;
      },
      update: async ({ where, data }) => {
        const row = [...state.receipts.values()].find(row => matches(row, where));
        assert.ok(row); Object.assign(row, clone(data)); return clone(row);
      },
    },
    $transaction: async (callback, options) => {
      calls.transactions++;
      assert.equal(options.isolationLevel, "ReadCommitted");
      let release;
      let draft;
      let lockedId;
      const paymentWrites = new Set(), checkoutWrites = new Set(), receiptWrites = new Set();
      const newAudits = [];
      const ensureLocked = () => assert.ok(draft, "DB status/side-effect access must occur after the row lock");
      const tx = {
        $queryRaw: async (query) => {
          assert.match(query.sql, /SELECT "id" FROM "Payment" WHERE "id" = \? FOR UPDATE/);
          assert.equal(query.values.length, 1);
          lockedId = query.values[0];
          calls.locks++;
          const previous = locks.get(lockedId) ?? Promise.resolve();
          const current = new Promise(resolve => { release = resolve; });
          locks.set(lockedId, current);
          await previous;
          draft = clone(state);
          return state.payments.has(lockedId) ? [{ id: lockedId }] : [];
        },
        payment: {
          findUnique: async ({ where }) => { ensureLocked(); return find(draft.payments, where); },
          updateMany: async ({ where, data }) => {
            ensureLocked();
            if (faults.cas) { faults.cas = false; return { count: 0 }; }
            const row = [...draft.payments.values()].find(row => matches(row, where));
            if (!row) return { count: 0 };
            assert.equal(row.id, lockedId);
            Object.assign(row, clone(data));
            paymentWrites.add(row.id); return { count: 1 };
          },
        },
        checkoutSession: {
          findUnique: async ({ where }) => { ensureLocked(); return find(draft.checkouts, where); },
          updateMany: async ({ where, data }) => {
            ensureLocked();
            if (faults.checkout) { faults.checkout = false; return { count: 0 }; }
            const row = [...draft.checkouts.values()].find(row => matches(row, where));
            if (!row) return { count: 0 };
            Object.assign(row, clone(data)); checkoutWrites.add(row.id); return { count: 1 };
          },
        },
        smsReceipt: {
          upsert: async ({ where, create, update }) => {
            ensureLocked();
            assert.deepEqual(update, {});
            if (!draft.receipts.has(where.paymentId)) {
              draft.receipts.set(where.paymentId, { id: "receipt-test", ...clone(create) }); receiptWrites.add(where.paymentId);
            }
          },
        },
        auditLog: {
          findFirst: async ({ where }) => {
            ensureLocked();
            assert.equal(where.actorType, "STRIPE_WEBHOOK");
            assert.equal(where.targetType, "PAYMENT");
            assert.deepEqual(where.metadata.path, ["stripeEventId"]);
            return clone(draft.audits.find(row => row.targetId === where.targetId && row.metadata.stripeEventId === where.metadata.equals) ?? null);
          },
          create: async ({ data }) => {
            ensureLocked();
            if (faults.audit) { faults.audit = false; throw new Error("Injected audit write failure"); }
            newAudits.push(clone(data)); draft.audits.push(clone(data)); return data;
          },
        },
      };
      try {
        await callback(tx);
        for (const id of paymentWrites) state.payments.set(id, draft.payments.get(id));
        for (const id of checkoutWrites) state.checkouts.set(id, draft.checkouts.get(id));
        for (const id of receiptWrites) state.receipts.set(id, draft.receipts.get(id));
        state.audits.push(...newAudits);
        calls.paymentWrites += paymentWrites.size; calls.checkoutWrites += checkoutWrites.size; calls.receiptCreates += receiptWrites.size;
      } finally { release?.(); }
    },
  };
  const stripeRead = () => { calls.stripeReads++; if (faults.stripe) throw new Error("Injected Stripe read failure"); };
  const stripe = {
    webhooks: sdk.webhooks,
    checkout: { sessions: { retrieve: async id => { stripeRead(); assert.equal(id, live.session.id); return clone(live.session); } } },
    paymentIntents: { retrieve: async id => {
      stripeRead(); assert.equal(id, live.intent.id);
      const snapshot = clone(live.intent);
      await hooks.intentRead?.(snapshot);
      return snapshot;
    } },
    charges: { retrieve: async id => { stripeRead(); assert.equal(id, live.intent.latest_charge.id); return clone(live.intent.latest_charge); } },
    disputes: { list: async ({ charge }) => { stripeRead(); assert.equal(charge, live.intent.latest_charge.id); return { data: clone(live.disputes), has_more: false }; } },
  };
  const jar = new Map(), cache = new Map();
  const mocks = {
    "@prisma/client": enums, "@/lib/prisma": { prisma }, "@/lib/stripe": { getStripeClient: () => stripe },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "next/headers": { cookies: async () => ({ set: (name, value) => jar.set(name, value), get: name => jar.has(name) ? { value: jar.get(name) } : undefined }) },
    twilio: { default: () => ({ messages: { create: async () => { calls.smsSends++; await Promise.resolve(); return { sid: "SM_fixture" }; } } }) },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(root, relative);
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    });
    const loadedModule = { exports: {} }; cache.set(relative, loadedModule.exports);
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/lib/")) return load(name.slice(2) + ".ts");
      if (name === "node:crypto" || name === "react/jsx-runtime") return require(name);
      throw new Error("Unexpected import (external access forbidden): " + name);
    };
    vm.runInThisContext("(function(require,module,exports,process,console){\n" + outputText + "\n})", { filename })(
      localRequire, loadedModule, loadedModule.exports,
      { env: {
        STRIPE_WEBHOOK_SECRET: secret, STRIPE_SECRET_KEY: "sk_test_local_cookie", NODE_ENV: "production",
        TWILIO_ACCOUNT_SID: "AC_fixture", TWILIO_AUTH_TOKEN: "isolated_mock", TWILIO_PHONE_NUMBER: "+15555550000",
      } },
      { warn: () => {}, error: () => {} },
    );
    return loadedModule.exports;
  }
  const route = load("app/api/stripe/webhook/route.ts");
  let sequence = 0;
  function event(type, overrides = {}) {
    const object = type.startsWith("checkout.") ? clone(live.session)
      : type.startsWith("charge.dispute.") ? clone(live.disputes[0])
      : clone(live.intent);
    return { id: "evt_" + ++sequence, object: "event", type, created: 100,
      data: { object }, ...overrides };
  }
  async function send(evt, signature) {
    const payload = JSON.stringify(evt);
    const header = signature ?? sdk.webhooks.generateTestHeaderString({ payload, secret });
    return route.POST(new Request("https://example.test/api/stripe/webhook", {
      method: "POST", body: payload, headers: header ? { "stripe-signature": header } : {},
    }));
  }
  function settle() {
    live.intent.status = "succeeded"; live.intent.last_payment_error = null;
    live.intent.amount_received = payment.totalChargedCents;
    live.intent.latest_charge.status = "succeeded"; live.intent.latest_charge.paid = true;
    live.session.payment_status = "paid";
  }
  function fail() {
    live.intent.status = "requires_payment_method";
    live.intent.amount_received = 0;
    live.intent.last_payment_error = { code: "insufficient_funds", message: "Bank rejected payment" };
    live.intent.latest_charge.status = "failed"; live.intent.latest_charge.paid = false;
  }
  function dispute(reason = "fraudulent", status = "needs_response") {
    settle(); live.intent.latest_charge.disputed = true;
    live.disputes = [{ id: "dp_test", object: "dispute", charge: "ch_test", payment_intent: "pi_test", reason, status }];
  }
  async function render() {
    await load("lib/paymentResultAccess.ts").grantPaymentResultAccess("cs_test", "checkout-test");
    return renderToStaticMarkup(await load("app/payment/success/page.tsx").default({
      searchParams: Promise.resolve({ session_id: "cs_test", accountCode: "TEST", status: "PAID" }),
    }));
  }
  return { state, live, calls, faults, hooks, event, send, settle, fail, dispute, render,
    payment: () => state.payments.get("payment-test"),
    rules: load("lib/paymentStatus.ts"),
    dispatch: receiptId => load("lib/smsReceipts.ts").dispatchSmsReceipt(receiptId),
  };
}

async function accepted(h, evt) { assert.equal((await h.send(evt)).status, 200); }

for (const initial of ["CREATED", "CHECKOUT_STARTED", "PENDING"]) {
  test("card " + initial + " → PAID through the signed production route", async () => {
    const h = harness("CARD", initial); h.settle();
    await accepted(h, h.event("payment_intent.succeeded"));
    assert.equal(h.payment().status, "PAID");
    assert.equal(h.state.receipts.size, 1);
    assert.equal(h.state.checkouts.get("checkout-test").status, "PAID");
  });
}

test("ACH completed is processing, then settlement confirms PAID and the read-only result page follows", async () => {
  const h = harness();
  await accepted(h, h.event("checkout.session.completed"));
  assert.equal(h.payment().status, "PENDING");
  assert.equal(h.state.receipts.size, 0);
  assert.ok((await h.render()).includes("not yet confirmed as paid"));
  h.settle();
  await accepted(h, h.event("checkout.session.async_payment_succeeded"));
  assert.equal(h.payment().status, "PAID");
  const before = clone(h.state);
  assert.ok((await h.render()).includes("Payment successful"));
  assert.ok((await h.render()).includes("Payment successful"));
  assert.deepEqual(h.state, before);
});

for (const type of ["payment_intent.processing", "payment_intent.succeeded"]) {
  test("duplicate " + type + " is durably skipped without extra writes or Stripe reads", async () => {
    const h = harness();
    if (type.endsWith("succeeded")) h.settle();
    const evt = h.event(type);
    await accepted(h, evt);
    const before = clone(h.state), calls = { ...h.calls };
    await accepted(h, evt);
    assert.deepEqual(h.state, before);
    assert.equal(h.calls.stripeReads, calls.stripeReads);
    assert.equal(h.calls.paymentWrites, calls.paymentWrites);
    assert.equal(h.calls.receiptCreates, type.endsWith("succeeded") ? 1 : 0);
    assert.equal(h.state.audits.length, 1);
  });
}

test("distinct success events create one receipt and preserve timestamps and sent delivery state", async () => {
  const h = harness(); h.settle();
  await accepted(h, h.event("payment_intent.succeeded"));
  const paidAt = h.payment().paidAt;
  h.state.receipts.get("payment-test").status = "SENT";
  await accepted(h, h.event("checkout.session.completed"));
  await accepted(h, h.event("checkout.session.async_payment_succeeded"));
  assert.deepEqual(h.payment().paidAt, paidAt);
  assert.equal(h.calls.receiptCreates, 1);
  assert.equal(h.calls.paymentWrites, 1);
  assert.equal(h.state.receipts.get("payment-test").status, "SENT");
});

test("PAID cannot regress on stale processing or pre-settlement failure snapshots", async () => {
  const h = harness();
  const processing = h.event("payment_intent.processing");
  h.fail(); const failure = h.event("payment_intent.payment_failed");
  h.settle(); await accepted(h, h.event("payment_intent.succeeded"));
  await accepted(h, processing); await accepted(h, failure);
  assert.equal(h.payment().status, "PAID");
  assert.equal(h.payment().returnedAt, null);
  assert.equal(h.calls.receiptCreates, 1);
});

for (const final of ["FAILED", "RETURNED"]) {
  test(final + " cannot reopen on older processing, even if a processing observation is supplied", async () => {
    const h = harness("ACH", final);
    await accepted(h, h.event("payment_intent.processing"));
    assert.equal(h.payment().status, final);
    assert.equal(h.state.receipts.size, 0);
  });
}

test("pending ACH failure is final against stale completed/processing notifications", async () => {
  const h = harness();
  const stale = h.event("checkout.session.completed");
  await accepted(h, h.event("payment_intent.processing"));
  h.fail(); await accepted(h, h.event("payment_intent.payment_failed"));
  await accepted(h, stale);
  assert.equal(h.payment().status, "FAILED");
  assert.ok(h.payment().failedAt);
  assert.equal(h.state.receipts.size, 0);
  assert.ok((await h.render()).includes("Payment unsuccessful"));
});

test("a later real card settlement can recover the same declined intent; a failed snapshot alone cannot", async () => {
  const h = harness("CARD"); h.live.session.status = "open"; h.fail();
  const failure = h.event("payment_intent.payment_failed");
  await accepted(h, failure);
  assert.equal(h.payment().status, "FAILED");
  h.live.session.status = "complete"; h.settle();
  h.live.intent.latest_charge.id = "ch_retry_success";
  await accepted(h, h.event("payment_intent.succeeded"));
  assert.equal(h.payment().status, "PAID"); assert.equal(h.state.receipts.size, 1);
  assert.equal(h.payment().stripeChargeId, "ch_retry_success");
  await accepted(h, { ...failure, id: "evt_late_failed_attempt" });
  assert.equal(h.payment().status, "PAID");
  assert.equal(h.payment().stripeChargeId, "ch_retry_success");
});

for (const reason of ["insufficient_funds", "incorrect_account_details", "bank_cannot_process"]) {
  test("ACH post-settlement bank return: " + reason, async () => {
    const h = harness(); h.settle(); await accepted(h, h.event("payment_intent.succeeded"));
    h.dispute(reason, "lost"); const evt = h.event("charge.dispute.created");
    await accepted(h, evt); await accepted(h, evt);
    await accepted(h, h.event("payment_intent.succeeded"));
    assert.equal(h.payment().status, "RETURNED");
    assert.equal(h.payment().failureCode, reason);
    assert.ok(h.payment().returnedAt); assert.equal(h.calls.receiptCreates, 1);
    assert.ok((await h.render()).includes("Payment returned"));
  });
}

test("card dispute is final against stale success and reopens only on current won resolution", async () => {
  const h = harness("CARD"); h.settle(); await accepted(h, h.event("payment_intent.succeeded"));
  const staleSuccess = h.event("payment_intent.succeeded");
  h.dispute(); const staleDispute = h.event("charge.dispute.created");
  await accepted(h, staleDispute); await accepted(h, staleSuccess);
  assert.equal(h.payment().status, "DISPUTED");
  assert.ok((await h.render()).includes("Payment disputed"));
  h.live.disputes[0].status = "won"; h.live.intent.latest_charge.disputed = false;
  await accepted(h, h.event("charge.dispute.closed"));
  await accepted(h, { ...staleDispute, id: "evt_late_dispute_copy" });
  assert.equal(h.payment().status, "PAID"); assert.equal(h.calls.receiptCreates, 1);
});

test("dispute arriving before any success event is not lost or followed by a false success receipt", async () => {
  const h = harness("CARD"); h.dispute();
  await accepted(h, h.event("charge.dispute.created"));
  await accepted(h, h.event("payment_intent.succeeded"));
  assert.equal(h.payment().status, "DISPUTED"); assert.equal(h.state.receipts.size, 0);
});

test("bank return arriving before success is order safe", async () => {
  const h = harness(); h.dispute("bank_cannot_process", "lost");
  await accepted(h, h.event("charge.dispute.created"));
  await accepted(h, h.event("checkout.session.async_payment_succeeded"));
  assert.equal(h.payment().status, "RETURNED"); assert.equal(h.state.receipts.size, 0);
});

test("Checkout expiry and intent cancellation use current state and cannot downgrade settlement", async () => {
  const h = harness(); h.live.session.status = "expired"; h.live.session.payment_intent = null;
  h.payment().stripePaymentIntentId = null; h.payment().stripeChargeId = null;
  await accepted(h, h.event("checkout.session.expired"));
  assert.equal(h.payment().status, "EXPIRED");
  const canceled = harness(); canceled.live.intent.status = "canceled";
  await accepted(canceled, canceled.event("payment_intent.canceled"));
  assert.equal(canceled.payment().status, "FAILED");
  const paid = harness(); const oldExpired = paid.event("checkout.session.expired");
  paid.settle(); await accepted(paid, oldExpired); assert.equal(paid.payment().status, "PAID");
});

test("same-second events and every ACH lifecycle delivery permutation converge to current PAID", async () => {
  const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for (const order of permutations) {
    const h = harness();
    const processing = h.event("payment_intent.processing");
    const completed = h.event("checkout.session.completed");
    h.settle(); const success = h.event("payment_intent.succeeded");
    for (const index of order) await accepted(h, [processing, completed, success][index]);
    assert.equal(h.payment().status, "PAID");
    assert.equal(h.calls.receiptCreates, 1);
  }
});

test("concurrent duplicate and different events serialize on the same payment and queue one receipt", async () => {
  const h = harness();
  const processing = h.event("payment_intent.processing");
  h.settle(); const success = h.event("payment_intent.succeeded");
  const responses = await Promise.all(Array.from({ length: 24 }, (_, i) => h.send(i % 2 ? processing : success)));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(h.payment().status, "PAID");
  assert.equal(h.state.audits.length, 2);
  assert.equal(h.calls.paymentWrites, 1); assert.equal(h.calls.receiptCreates, 1);
  assert.equal(h.calls.locks, 24);
});

for (const type of ["checkout.session.completed", "payment_intent.succeeded"]) {
  test("unknown Stripe object: " + type, async () => {
    const h = harness(); const evt = h.event(type);
    evt.data.object.id = type.startsWith("checkout") ? "cs_unknown" : "pi_unknown";
    evt.data.object.metadata = {};
    if (!type.startsWith("checkout")) evt.data.object.latest_charge = null;
    if (type.startsWith("checkout")) evt.data.object.payment_intent = null;
    const before = clone(h.state); await accepted(h, evt);
    assert.deepEqual(h.state, before); assert.equal(h.calls.stripeReads, 0);
  });
}

test("first PaymentIntent binding requires its independently stored Stripe Checkout parent", async () => {
  const h = harness(); h.payment().stripePaymentIntentId = null; h.payment().stripeChargeId = null;
  await accepted(h, h.event("payment_intent.processing"));
  assert.equal(h.payment().stripePaymentIntentId, "pi_test");
  const wrong = harness(); wrong.payment().stripePaymentIntentId = null; wrong.payment().stripeChargeId = null;
  const evt = wrong.event("payment_intent.processing"); evt.data.object.id = "pi_unrelated";
  const before = clone(wrong.state); await accepted(wrong, evt); assert.deepEqual(wrong.state, before);
});

for (const attack of ["metadataBusiness","metadataPayment","metadataCheckout","metadataAccount","destination","storedIntent","storedBusiness","checkoutBusiness","checkoutPayment","liveAmount","eventCheckout","eventCharge","method","connectedAccount"]) {
  test("reject conflicting object/business relationship: " + attack, async () => {
    const h = harness(); h.settle(); const evt = h.event("payment_intent.succeeded");
    if (attack === "metadataBusiness") evt.data.object.metadata.businessId = "other-business";
    if (attack === "metadataPayment") evt.data.object.metadata.paymentId = "other-payment";
    if (attack === "metadataCheckout") evt.data.object.metadata.checkoutSessionId = "other-checkout";
    if (attack === "metadataAccount") evt.data.object.metadata.accountCode = "OTHER";
    if (attack === "destination") h.live.intent.transfer_data.destination = "acct_other";
    if (attack === "storedIntent") h.payment().stripePaymentIntentId = "pi_other";
    if (attack === "storedBusiness") h.payment().business.id = "other";
    if (attack === "checkoutBusiness") h.state.checkouts.get("checkout-test").businessId = "other";
    if (attack === "checkoutPayment") h.state.checkouts.get("checkout-test").paymentId = "other";
    if (attack === "liveAmount") h.live.intent.amount++;
    if (attack === "method") h.live.intent.latest_charge.payment_method_details.type = "card";
    if (attack === "connectedAccount") evt.account = "acct_other";
    if (attack === "eventCheckout") {
      evt.type = "checkout.session.completed"; evt.data.object = clone(h.live.session); evt.data.object.id = "cs_unrelated";
    }
    if (attack === "eventCharge") {
      h.state.payments.set("decoy", {
        ...clone(h.payment()), id: "decoy", businessId: "other-business",
        stripeCheckoutSessionId: "cs_other", stripePaymentIntentId: "pi_other", stripeChargeId: "ch_other",
        business: { id: "other-business", name: "Other Storage", accountCode: "OTHER", stripeConnection: { stripeAccountId: "acct_other" } },
      });
      evt.data.object.latest_charge = "ch_other";
    }
    const before = clone(h.state); await accepted(h, evt);
    assert.deepEqual(h.state, before); assert.equal(h.calls.receiptCreates, 0);
  });
}

test("a dispute for a stale charge cannot change the current settled payment", async () => {
  const h = harness(); h.settle(); await accepted(h, h.event("payment_intent.succeeded"));
  h.dispute(); const evt = h.event("charge.dispute.created"); evt.data.object.charge = "ch_old";
  const before = clone(h.state); await accepted(h, evt); assert.deepEqual(h.state, before);
});

test("missing persisted checkout linkage asks Stripe to retry rather than claiming metadata is ownership", async () => {
  const h = harness(); h.payment().stripeCheckoutSessionId = null;
  const evt = h.event("payment_intent.processing");
  const before = clone(h.state); assert.equal((await h.send(evt)).status, 500);
  assert.deepEqual(h.state, before);
});

for (const fault of ["audit","checkout","cas","stripe"]) {
  test("transaction failure rolls back payment/receipt/ledger and replay succeeds: " + fault, async () => {
    const h = harness(); h.settle(); h.faults[fault] = true;
    const evt = h.event("payment_intent.succeeded"), before = clone(h.state);
    assert.equal((await h.send(evt)).status, 500);
    assert.deepEqual(h.state, before);
    h.faults[fault] = false; await accepted(h, evt);
    assert.equal(h.payment().status, "PAID"); assert.equal(h.calls.receiptCreates, 1);
    assert.equal(h.state.audits.length, 1);
  });
}

test("real Stripe SDK signature verification rejects unsigned, forged and altered payloads before DB access", async () => {
  const h = harness(), evt = h.event("payment_intent.succeeded"), before = clone(h.state);
  assert.equal((await h.send(evt, "")).status, 400);
  assert.equal((await h.send(evt, "t=1,v1=invalid")).status, 400);
  const payload = JSON.stringify(evt);
  const signature = sdk.webhooks.generateTestHeaderString({ payload, secret });
  evt.data.object.metadata.businessId = "tampered";
  assert.equal((await h.send(evt, signature)).status, 400);
  assert.deepEqual(h.state, before); assert.equal(h.calls.reads, 0); assert.equal(h.calls.transactions, 0);
});

test("central transition authority blocks all earlier lifecycle regressions and requires settlement evidence", () => {
  const { rules } = harness();
  for (const from of ["PAID","FAILED","EXPIRED","RETURNED","DISPUTED"]) {
    assert.equal(rules.canApplyStripePaymentState(from, "PENDING", { settled: false, disputeResolved: false }), false);
  }
  for (const from of ["PAID","DISPUTED","RETURNED"]) {
    assert.equal(rules.canApplyStripePaymentState(from, "FAILED", { settled: false, disputeResolved: false }), false);
  }
  assert.equal(rules.canApplyStripePaymentState("DISPUTED","PAID",{settled:true,disputeResolved:false}),false);
  assert.equal(rules.canApplyStripePaymentState("RETURNED","PAID",{settled:true,disputeResolved:false}),false);
  assert.equal(rules.canApplyStripePaymentState("FAILED","PAID",{settled:false,disputeResolved:false}),false);
  assert.equal(rules.canTransitionPaymentStatus("FAILED","PAID"),false);
});

test("a paid Checkout event snapshot cannot declare a still-processing bank payment settled", async () => {
  const h = harness(); const evt = h.event("checkout.session.completed");
  evt.data.object.payment_status = "paid";
  await accepted(h, evt);
  assert.equal(h.payment().status, "PENDING"); assert.equal(h.state.receipts.size, 0);
});

test("actual SMS dispatch claims once under concurrent workers and webhook/page replays never resend", async () => {
  const h = harness(); h.settle(); const evt = h.event("payment_intent.succeeded");
  await accepted(h, evt);
  const results = await Promise.all(Array.from({ length: 16 }, () => h.dispatch("receipt-test")));
  assert.equal(results.filter(result => result.status === "SENT").length, 1);
  assert.equal(results.filter(result => result.status === "SKIPPED").length, 15);
  assert.equal(h.calls.smsSends, 1);
  await accepted(h, evt); await accepted(h, h.event("checkout.session.completed"));
  await h.render(); await h.render();
  assert.equal((await h.dispatch("receipt-test")).status, "SKIPPED");
  assert.equal(h.calls.smsSends, 1);
  assert.equal(h.state.receipts.get("payment-test").status, "SENT");
});

test("a queued receipt is not sent once the stored payment has been returned", async () => {
  const h = harness(); h.settle(); await accepted(h, h.event("payment_intent.succeeded"));
  h.dispute("insufficient_funds", "lost"); await accepted(h, h.event("charge.dispute.created"));
  assert.equal((await h.dispatch("receipt-test")).status, "FAILED");
  assert.equal(h.calls.smsSends, 0); assert.equal(h.payment().status, "RETURNED");
});

test("another business's valid metadata cannot override the stored PaymentIntent owner", async () => {
  const h = harness(); h.settle();
  h.state.payments.set("other-payment", {
    ...clone(h.payment()), id: "other-payment", businessId: "other-business",
    stripeCheckoutSessionId: "cs_other", stripePaymentIntentId: "pi_other", stripeChargeId: "ch_other",
    business: { id: "other-business", name: "Other Storage", accountCode: "OTHER", stripeConnection: { stripeAccountId: "acct_other" } },
  });
  h.state.checkouts.set("other-checkout", {
    ...clone(h.state.checkouts.get("checkout-test")), id: "other-checkout",
    paymentId: "other-payment", businessId: "other-business", accountCode: "OTHER", stripeCheckoutSessionId: "cs_other",
  });
  const evt = h.event("payment_intent.succeeded");
  Object.assign(evt.data.object.metadata, { paymentId: "other-payment", businessId: "other-business", checkoutSessionId: "other-checkout", accountCode: "OTHER" });
  const before = clone(h.state); await accepted(h, evt); assert.deepEqual(h.state, before);
});

test("a waiting success handler rereads PENDING only after the earlier transaction commits", async () => {
  const h = harness();
  let signalRead, releaseRead;
  const firstRead = new Promise(resolve => { signalRead = resolve; });
  const gate = new Promise(resolve => { releaseRead = resolve; });
  let first = true;
  h.hooks.intentRead = async () => {
    if (!first) return;
    first = false; signalRead(); await gate;
  };
  const processing = h.send(h.event("payment_intent.processing"));
  await firstRead;
  h.settle();
  const success = h.send(h.event("payment_intent.succeeded"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.locks, 2);
  releaseRead();
  assert.equal((await processing).status, 200); assert.equal((await success).status, 200);
  assert.equal(h.payment().status, "PAID");
  assert.ok(h.payment().pendingAt); assert.ok(h.payment().paidAt);
  assert.equal(h.calls.paymentWrites, 2); assert.equal(h.calls.receiptCreates, 1);
});

test("signed but expired delivery signatures are rejected before any record access", async () => {
  const h = harness(), evt = h.event("payment_intent.processing");
  const signature = sdk.webhooks.generateTestHeaderString({
    payload: JSON.stringify(evt), secret, timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  assert.equal((await h.send(evt, signature)).status, 400);
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.transactions, 0);
});

test("refund notifications remain intentionally outside the current status model", async () => {
  const h = harness(); h.settle(); await accepted(h, h.event("payment_intent.succeeded"));
  const before = clone(h.state), calls = { ...h.calls };
  await accepted(h, h.event("charge.refunded"));
  assert.deepEqual(h.state, before);
  assert.equal(h.calls.stripeReads, calls.stripeReads);
  assert.equal(h.calls.transactions, calls.transactions);
});

test("a partially received intent cannot claim PAID for the full RFL customer total", async () => {
  const h = harness("CARD"); h.settle(); h.live.intent.amount_received--;
  const evt = h.event("payment_intent.succeeded"), before = clone(h.state);
  await accepted(h, evt); assert.deepEqual(h.state, before);
  assert.equal(h.state.receipts.size, 0);
});
