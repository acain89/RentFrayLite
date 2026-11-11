import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { harness, postgres } from "./helpers/checkout-harness.mjs";

const backends = postgres ? ["isolated", "postgres"] : ["isolated"];
const attempt = async (h, checkout) => {
  const stored = await h.db.checkoutSession.findUnique({ where: { id: checkout.id } });
  const payment = await h.db.payment.findUnique({ where: { id: stored.paymentId } });
  return { checkout: stored, payment, session: h.live.sessions.get(payment.stripeCheckoutSessionId) };
};
const financial = payment => [payment.id, payment.payerFirstName, payment.payerLastName, payment.payerPhone,
  payment.referenceLabel, payment.billingCycle, payment.subtotalCents, payment.platformFeeCents,
  payment.totalChargedCents, payment.businessProceedsCents, payment.lineItemsSnapshot];

for (const backend of backends) for (const method of ["ACH", "CARD"]) {
  const label = backend + " " + method;
  test(label + ": three identical independent checkouts have distinct durable identities, Stripe keys and unchanged fees", async () => {
    const h = await harness(method, backend), checkouts = [], payments = [];
    for (let n = 0; n < 3; n++) {
      h.cookieJar.clear(); const checkout = await h.prepare(); checkouts.push(checkout);
      assert.equal((await h.start(checkout)).status, 200); payments.push((await attempt(h, checkout)).payment);
    }
    assert.equal(new Set(payments.map(p => p.id)).size, 3);
    assert.deepEqual(payments.map(p => p.checkoutAttemptId), checkouts.map(c => c.id));
    assert.equal(new Set(h.calls.creates.map(c => c.options.idempotencyKey)).size, 3);
    for (const p of payments) {
      assert.equal(p.subtotalCents, 100000); assert.equal(p.businessProceedsCents, 100000);
      assert.equal(p.platformFeeCents, method === "ACH" ? 995 : 4900);
      assert.equal(p.totalChargedCents, p.subtotalCents + p.platformFeeCents);
      assert.equal(p.chargeModel, "LEGACY_DESTINATION");
    }
  });
  for (const status of ["CREATED", "CHECKOUT_STARTED", "PAID", "PENDING", "FAILED", "RETURNED", "DISPUTED", "EXPIRED"]) {
    test(label + ": independent checkout ignores earlier " + status + " transaction", async () => {
      const h = await harness(method, backend), a = await h.original(status);
      const before = await h.db.payment.findUnique({ where: { id: a.payment.id } });
      assert.equal((await h.start(await h.prepare())).status, 200);
      assert.equal((await h.payments()).length, 2); assert.equal(h.calls.creates.length, 2);
      assert.deepEqual(await h.db.payment.findUnique({ where: { id: a.payment.id } }), before);
    });
  }
  test(label + ": different amounts are independent and retain original snapshots", async () => {
    const h = await harness(method, backend), a = await h.original("CHECKOUT_STARTED");
    const before = financial(a.payment), originalCheckout = await h.db.checkoutSession.findUnique({ where: { id: a.checkout.id } });
    h.business.recurringPlans[0].baseAmountCents = 250000;
    if (backend === "postgres") await h.db.recurringPlan.update({ where: { id: a.payment.sourceId }, data: { baseAmountCents: 250000 } });
    const fresh = await h.prepare(); assert.equal((await h.start(fresh)).status, 200);
    assert.equal((await attempt(h, fresh)).payment.subtotalCents, 250000);
    assert.deepEqual(financial(await h.db.payment.findUnique({ where: { id: a.payment.id } })), before);
    assert.deepEqual(await h.db.checkoutSession.findUnique({ where: { id: a.checkout.id } }), originalCheckout);
  });
  test(label + ": fresh checkout never reads or resumes another attempt's Stripe objects", async () => {
    const h = await harness(method, backend); await h.original(); h.live.fail = "session"; h.cookieJar.clear();
    assert.equal((await h.start(await h.prepare())).status, 200); assert.equal(h.calls.reads.length, 0);
    assert.equal((await h.payments()).length, 2);
  });
  test(label + ": concurrent submissions of one checkout create one Payment and one Stripe session", async () => {
    const h = await harness(method, backend), checkout = await h.prepare();
    const responses = await Promise.all(Array.from({ length: 8 }, () => h.start(checkout)));
    assert.ok(responses.some(r => r.status === 200)); assert.ok(responses.every(r => [200, 409].includes(r.status)));
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1); assert.equal(h.live.sessions.size, 1);
    const before = h.calls.creates[0].options.idempotencyKey;
    assert.equal((await h.start(checkout)).status, 200); assert.equal(h.calls.creates.length, 1);
    assert.equal(before, "rfl-payment-" + (await h.payments())[0].id);
  });
  test(label + ": concurrent identical independent checkouts all create their own payments", async () => {
    const h = await harness(method, backend), checkouts = await Promise.all(Array.from({ length: 8 }, () => h.prepare()));
    const responses = await Promise.all(checkouts.map(h.start)); assert.ok(responses.every(r => r.status === 200));
    assert.equal((await h.payments()).length, 8); assert.equal(h.calls.creates.length, 8); assert.equal(h.live.sessions.size, 8);
    assert.equal(new Set(h.calls.creates.map(c => c.options.idempotencyKey)).size, 8);
  });
  test(label + ": timeout after Stripe creation is reported without recreating the same attempt at any age", async () => {
    const h = await harness(method, backend), checkout = await h.prepare(); h.live.createFailure = true;
    assert.equal((await h.start(checkout)).status, 500); assert.equal(h.live.sessions.size, 1);
    const [payment] = await h.payments(); assert.equal(payment.checkoutAttemptId, checkout.id);
    await h.db.payment.update({ where: { id: payment.id }, data: { createdAt: new Date("2020-01-01") } });
    h.live.createFailure = false;
    const response = await h.start(checkout); assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "CHECKOUT_CREATION_UNCONFIRMED"); assert.equal(h.calls.creates.length, 1);
    assert.equal((await h.start(await h.prepare())).status, 200); assert.equal((await h.payments()).length, 2);
  });
  for (const transient of [true, false]) test(label + ": " + (transient ? "transient" : "persistent") + " local persistence failure never repeats Stripe creation", async () => {
    const h = await harness(method, backend), checkout = await h.prepare();
    const lifecycle = h.load("lib/checkoutLifecycle.ts"), original = lifecycle.writeCheckoutLifecycle;
    let writes = 0;
    lifecycle.writeCheckoutLifecycle = async (...args) => {
      if (args[3].kind === "started" && (++writes === 1 || !transient)) throw Error("Injected local persistence failure");
      return original(...args);
    };
    const response = await h.start(checkout); assert.equal(response.status, transient ? 200 : 500);
    assert.equal(writes, 2); assert.equal(h.calls.creates.length, 1); assert.equal(h.live.sessions.size, 1);
    lifecycle.writeCheckoutLifecycle = original;
    assert.equal((await h.start(checkout)).status, transient ? 200 : 409); assert.equal(h.calls.creates.length, 1);
    if (transient) assert.equal((await attempt(h, checkout)).payment.stripeCheckoutSessionId, h.live.sessions.keys().next().value);
  });
  test(label + ": same attempt cannot be recreated after a terminal Stripe expiration", async () => {
    const h = await harness(method, backend), a = await h.original("CHECKOUT_STARTED"); a.session.status = "expired"; a.session.url = null;
    assert.equal((await h.start(a.checkout)).status, 409); assert.equal(h.calls.creates.length, 1);
    assert.equal((await h.start(await h.prepare())).status, 200); assert.equal(h.calls.creates.length, 2);
  });
  test(label + ": atomic persistence recovery rolls back a failure between Payment and Checkout writes", async () => {
    const h = await harness(method, backend), checkout = await h.prepare(), transaction = h.db.$transaction.bind(h.db);
    let injected = false;
    h.db.$transaction = (fn, options) => transaction(tx => fn(new Proxy(tx, { get(target, key) {
      if (key === "checkoutSession") return new Proxy(target.checkoutSession, { get(model, method) {
        if (method === "updateMany") return async args => {
          if (!injected && args.data.status === "CHECKOUT_STARTED") { injected = true; throw Error("Injected failure after Payment update"); }
          return model.updateMany(args);
        };
        return typeof model[method] === "function" ? model[method].bind(model) : model[method];
      } });
      return typeof target[key] === "function" ? target[key].bind(target) : target[key];
    } })), options);
    try { assert.equal((await h.start(checkout)).status, 200); } finally { h.db.$transaction = transaction; }
    assert.equal(injected, true); assert.equal(h.calls.creates.length, 1); assert.equal((await h.payments()).length, 1);
    const a = await attempt(h, checkout); assert.equal(a.payment.status, "CHECKOUT_STARTED"); assert.equal(a.checkout.status, "CHECKOUT_STARTED");
    assert.equal(a.payment.stripeCheckoutSessionId, a.checkout.stripeCheckoutSessionId);
  });
  test(label + ": lost local pointer cannot create a second payment for the durable attempt ID", async () => {
    const h = await harness(method, backend), a = await h.original("CHECKOUT_STARTED");
    await h.db.checkoutSession.update({ where: { id: a.checkout.id }, data: { paymentId: null, stripeCheckoutSessionId: null, status: "REVIEWED" } });
    assert.equal((await h.start(a.checkout)).status, 409); assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
  test(label + ": attempt-level unique constraint rejects every duplicate status while allowing historical NULL identity", async () => {
    const h = await harness(method, backend), a = await h.original();
    const data = { ...a.payment }; delete data.id; delete data.createdAt; delete data.updatedAt;
    data.stripeCheckoutSessionId = null; data.stripePaymentIntentId = null; data.stripeChargeId = null;
    for (const status of ["CREATED", "FAILED", "EXPIRED", "PAID"]) {
      await assert.rejects(h.db.payment.create({ data: { ...data, status } }), e => e.code === "P2002");
    }
    await h.db.payment.create({ data: { ...data, checkoutAttemptId: null } });
    assert.equal((await h.payments()).length, 2);
  });
  test(label + ": historical NULL identity resumes only its original linked checkout without backfill", async () => {
    const h = await harness(method, backend), a = await h.original("CHECKOUT_STARTED");
    await h.db.payment.update({ where: { id: a.payment.id }, data: { checkoutAttemptId: null } });
    assert.equal((await h.start(a.checkout)).status, 200);
    assert.equal((await h.db.payment.findUnique({ where: { id: a.payment.id } })).checkoutAttemptId, null);
    assert.equal((await h.start(await h.prepare())).status, 200); assert.equal((await h.payments()).length, 2);
  });
  test(label + ": failed A, independent B, late A settlement, replay and stale failure all preserve separate financial histories", async () => {
    const h = await harness(method, backend), a = await h.failedAttempt(), before = financial(a.payment);
    const bCheckout = await h.prepare(); assert.equal((await h.start(bCheckout)).status, 200); const b = await attempt(h, bCheckout);
    h.settle(a, a.intent); const eventId = "evt_" + randomUUID();
    await h.webhook(a, a.intent, "payment_intent.succeeded", "PAID", 200, eventId);
    assert.equal((await h.db.payment.findUnique({ where: { id: b.payment.id } })).status, "CHECKOUT_STARTED");
    const bIntent = h.intentFor(b); h.settle(b, bIntent); await h.webhook(b, bIntent);
    await h.webhook(a, a.intent, "payment_intent.succeeded", "PAID", 200, eventId);
    await h.webhook(a, a.intent, "payment_intent.payment_failed", "PAID");
    assert.deepEqual(financial(await h.db.payment.findUnique({ where: { id: a.payment.id } })), before);
    assert.deepEqual((await h.payments()).map(p => p.status), ["PAID", "PAID"]);
    const notices = await h.db.smsReceipt.findMany(); assert.equal(notices.filter(n => [a.payment.id,b.payment.id].includes(n.paymentId)).length, 2);
    assert.equal((await h.db.auditLog.findMany({ where: { targetId: a.payment.id } })).filter(r => r.metadata?.stripeEventId === eventId).length, 1);
  });
  if (backend === "postgres") test(label + ": same-attempt resume waits for webhook Payment lock and observes committed PAID", async () => {
    const h = await harness(method, backend), a = await h.original(); const intent = h.intentFor(a); h.settle(a, intent);
    let entered, release; const held = new Promise(r => entered = r), proceed = new Promise(r => release = r);
    h.mocks["@/lib/prisma"] = { prisma: new Proxy(h.db, { get(target,key) {
      if (key === "$transaction") return (fn,options) => target.$transaction(tx => fn(new Proxy(tx,{get(t,method) {
        if (method === "$queryRaw") return async query => { const result=await t.$queryRaw(query); if (/FROM "Payment".*FOR UPDATE/.test(query.sql)) { entered(); await proceed; } return result; };
        return typeof t[method] === "function" ? t[method].bind(t) : t[method];
      }})),options);
      return typeof target[key] === "function" ? target[key].bind(target) : target[key];
    }}) };
    const webhook = h.webhook(a, intent); await held; const start = h.start(a.checkout);
    try {
      let waiting = false;
      for (let n = 0; n < 100 && !waiting; n++) {
        const [row] = await postgres.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=current_user AND wait_event_type='Lock' AND query LIKE '%FROM \"Payment\" WHERE \"id\"%FOR UPDATE%'");
        waiting = row.n > 0; if (!waiting) await new Promise(r => setTimeout(r, 10));
      }
      assert.ok(waiting);
    } finally { release(); }
    await webhook; assert.equal((await start).status, 409); assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
}
