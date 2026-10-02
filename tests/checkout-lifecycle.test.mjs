import assert from "node:assert/strict";
import test from "node:test";
import { harness, postgres } from "./helpers/checkout-harness.mjs";

const backends = postgres ? ["isolated", "postgres"] : ["isolated"];
for (const backend of backends) for (const method of ["ACH", "CARD"]) {
  const label = `${backend} ${method}`;
  const records = async (h, checkout) => ({
    payment: (await h.payments())[0], checkout: await h.db.checkoutSession.findUnique({ where: { id: checkout.id } }),
  });
  const persist = (h, p, checkout, action) => h.load("lib/checkoutLifecycle.ts").writeCheckoutLifecycle(h.db, p.id, checkout.id, action);

  async function advance(h, checkout, session, status) {
    const [payment] = await h.payments();
    // Represents the other in-flight writer establishing the SAME Stripe
    // ownership before the delayed request returns from its external await.
    const result = await persist(h, payment, checkout, { kind: "started", stripeCheckoutId: session.id });
    assert.equal(result.kind, "started");
    const a = { payment: result.payment, checkout, session };
    const intent = h.intentFor(a, status === "PENDING" ? "processing" : "requires_payment_method");
    if (status === "PENDING") { intent.last_payment_error = null; session.status = "complete"; session.url = null; }
    if (["PAID", "RETURNED", "DISPUTED"].includes(status)) {
      h.settle(a, intent); await h.webhook(a, intent);
      if (status !== "PAID") {
        intent.latest_charge.disputed = true;
        h.live.disputes = [{ id: "dp_b2_fixture", charge: intent.latest_charge.id, payment_intent: intent.id,
          status: "lost", reason: status === "RETURNED" ? "insufficient_funds" : "fraudulent" }];
        await h.webhook(a, intent, "payment_intent.succeeded", status);
      }
    } else if (status === "EXPIRED") {
      session.status = "expired"; intent.status = "canceled";
      await h.webhook(a, intent, "payment_intent.canceled", "EXPIRED");
    } else {
      await h.webhook(a, intent, status === "PENDING" ? "payment_intent.processing" : "payment_intent.payment_failed", status);
    }
    return records(h, checkout);
  }

  test(`${label}: normal CREATED → CHECKOUT_STARTED is atomic and persistence is idempotent`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare();
    assert.equal((await h.start(checkout)).status, 200);
    const before = await records(h, checkout);
    assert.equal(before.payment.status, "CHECKOUT_STARTED"); assert.equal(before.checkout.status, "CHECKOUT_STARTED");
    assert.equal(before.checkout.stripeCheckoutSessionId, before.payment.stripeCheckoutSessionId);
    assert.ok(before.payment.checkoutStartedAt);
    assert.equal((await persist(h, before.payment, checkout, { kind: "started", stripeCheckoutId: before.payment.stripeCheckoutSessionId })).kind, "started");
    assert.deepEqual(await records(h, checkout), before);
    assert.equal(h.calls.creates[0].options.idempotencyKey, `rfl-payment-${before.payment.id}`);
  });

  for (const status of ["PAID", "PENDING", "FAILED", "EXPIRED", "DISPUTED", ...(method === "ACH" ? ["RETURNED"] : [])]) {
    for (const failure of [false, true]) test(`${label}: ${status} survives delayed ${failure ? "Stripe failure" : "checkout persistence"}`, async () => {
      const h = await harness(method, backend); const checkout = await h.prepare(); let confirmed;
      h.live.onCreate = async session => { confirmed = await advance(h, checkout, session, status); };
      h.live.createFailure = failure;
      const response = await h.start(checkout); assert.equal(response.status, 409);
      assert.equal((await response.json()).paymentStatus, status);
      assert.deepEqual(await records(h, checkout), confirmed, "all identifiers, statuses, timestamps, and failure details must survive");
      assert.equal(h.calls.creates.length, 1); assert.equal(h.live.sessions.size, 1);
      assert.equal((await h.payments()).length, 1);
      if (status === "PAID") assert.ok(confirmed.payment.paidAt);
      if (failure) assert.ok(h.calls.errors.some(args => args[0] === "Unable to create Stripe Checkout Session:"));
    });
  }

  test(`${label}: genuine creation failure changes only the current unstarted reservation`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare(); h.live.createFailure = true;
    assert.equal((await h.start(checkout)).status, 500);
    const state = await records(h, checkout); assert.equal(state.payment.status, "FAILED"); assert.ok(state.payment.failedAt);
    assert.match(state.payment.failureMessage, /Stripe create/);
    assert.equal(state.checkout.status, "REVIEWED"); assert.equal(state.payment.stripeCheckoutSessionId, null);
    assert.equal((await h.start(await h.prepare())).status, 409); assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: a missing URL cannot hide already-committed PAID or regress ownership`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare(); let confirmed;
    h.live.onCreate = async session => { confirmed = await advance(h, checkout, session, "PAID"); session.url = null; };
    const response = await h.start(checkout); assert.equal(response.status, 409);
    assert.equal((await response.json()).paymentStatus, "PAID");
    assert.deepEqual(await records(h, checkout), confirmed); assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: missing URL still persists ownership so a later legitimate settlement can be recorded`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare();
    h.live.onCreate = async session => { session.url = null; };
    assert.equal((await h.start(checkout)).status, 500);
    const state = await records(h, checkout); assert.equal(state.payment.status, "CHECKOUT_STARTED");
    const session = h.live.sessions.get(state.payment.stripeCheckoutSessionId); assert.ok(session);
    assert.equal(state.checkout.stripeCheckoutSessionId, session.id);
    const a = { payment: state.payment, checkout, session }, intent = h.intentFor(a);
    h.settle(a, intent); await h.webhook(a, intent); assert.equal((await h.payments()).length, 1);
  });
  test(`${label}: webhook before ownership retries safely; durable PAID event cannot be regressed or require duplicate repair`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare(); let a, intent;
    const eventId = `evt_b2_early_${checkout.id}`;
    h.live.onCreate = async session => {
      a = { payment: (await h.payments())[0], checkout, session }; intent = h.intentFor(a); h.settle(a, intent);
      await h.webhook(a, intent, "payment_intent.succeeded", "CREATED", 500, eventId);
      assert.equal(await h.db.smsReceipt.findUnique({ where: { paymentId: a.payment.id } }), null);
    };
    assert.equal((await h.start(checkout)).status, 200);
    await h.webhook(a, intent, "payment_intent.succeeded", "PAID", 200, eventId);
    const confirmed = await records(h, checkout);
    const attempts = await Promise.all([
      persist(h, a.payment, checkout, { kind: "started", stripeCheckoutId: a.session.id }),
      persist(h, a.payment, checkout, { kind: "failed", message: "Stale failure after durable settlement" }),
    ]);
    assert.ok(attempts.every(result => result.kind === "advanced"));
    await h.webhook(a, intent, "payment_intent.succeeded", "PAID", 200, eventId);
    assert.deepEqual(await records(h, checkout), confirmed);
    assert.equal(h.calls.creates.length, 1); assert.equal(h.live.sessions.size, 1);
  });
  test(`${label}: a late API failure is not evidence that an owned CHECKOUT_STARTED payment failed`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare(); let owned;
    h.live.onCreate = async session => {
      const [payment] = await h.payments(); await persist(h, payment, checkout, { kind: "started", stripeCheckoutId: session.id });
      owned = await records(h, checkout);
    };
    h.live.createFailure = true;
    assert.equal((await h.start(checkout)).status, 500);
    assert.deepEqual(await records(h, checkout), owned);
    assert.equal(owned.payment.status, "CHECKOUT_STARTED");
  });

  test(`${label}: stale local expiry after signed PAID leaves both records unchanged`, async () => {
    const h = await harness(method, backend); const a = await h.original("CHECKOUT_STARTED");
    await h.db.checkoutSession.update({ where: { id: a.checkout.id }, data: { expiresAt: new Date("2020-01-01") } });
    const intent = h.intentFor(a); h.settle(a, intent);
    const originalRead = h.db.business.findUnique;
    let confirmed;
    h.db.business.findUnique = async (...args) => {
      h.db.business.findUnique = originalRead;
      await h.webhook(a, intent); confirmed = await records(h, a.checkout);
      return originalRead(...args);
    };
    try { assert.equal((await h.start(a.checkout)).status, 409); } finally { h.db.business.findUnique = originalRead; }
    assert.deepEqual(await records(h, a.checkout), confirmed);
    assert.equal(confirmed.payment.status, "PAID"); assert.equal(confirmed.checkout.status, "PAID");
  });

  for (const expired of [false, true]) test(`${label}: stale review ${expired ? "expiration" : "review transition"} cannot replace PAID Checkout`, async () => {
    const h = await harness(method, backend); const a = await h.original("CHECKOUT_STARTED"); const intent = h.intentFor(a);
    if (expired) await h.db.checkoutSession.update({ where: { id: a.checkout.id }, data: { expiresAt: new Date("2020-01-01") } });
    h.settle(a, intent); await h.webhook(a, intent); const confirmed = await records(h, a.checkout);
    const get = h.db.checkoutSession.findUnique;
    h.db.checkoutSession.findUnique = async args => args.where.id === a.checkout.id
      ? { ...a.checkout, status: "CREATED", paymentId: null, stripeCheckoutSessionId: null,
        expiresAt: expired ? new Date("2020-01-01") : new Date(Date.now() + 3600000) } : get(args);
    try {
      await h.load("app/[accountCode]/review/page.tsx").default({
        params: Promise.resolve({ accountCode: h.business.accountCode }), searchParams: Promise.resolve({ session: a.checkout.id }),
      });
    } finally { h.db.checkoutSession.findUnique = get; }
    assert.deepEqual(await records(h, a.checkout), confirmed);
  });

  test(`${label}: overlapping starts + ownership + signed settlement + delayed return cannot regress PAID`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare(); let confirmed;
    h.live.onCreate = async session => { confirmed = await advance(h, checkout, session, "PAID"); };
    const responses = await Promise.all(Array.from({ length: 8 }, () => h.start(checkout)));
    assert.ok(responses.every(response => response.status === 409));
    assert.deepEqual(await records(h, checkout), confirmed);
    assert.equal(h.calls.creates.length, 1); assert.equal(h.live.sessions.size, 1); assert.equal((await h.payments()).length, 1);
  });

  test(`${label}: started ownership cannot be transferred to a different Stripe Session`, async () => {
    const h = await harness(method, backend); const a = await h.original("CHECKOUT_STARTED"); const before = await records(h, a.checkout);
    await assert.rejects(persist(h, a.payment, a.checkout, { kind: "started", stripeCheckoutId: "cs_unrelated" }), /cannot be replaced/);
    assert.deepEqual(await records(h, a.checkout), before);
  });
  test(`${label}: unlinked review expiry still works without changing any Payment`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare();
    await h.db.checkoutSession.update({ where: { id: checkout.id }, data: { expiresAt: new Date("2020-01-01") } });
    assert.equal((await h.start(checkout)).status, 409);
    assert.equal((await h.db.checkoutSession.findUnique({ where: { id: checkout.id } })).status, "EXPIRED");
    assert.equal((await h.payments()).length, 0); assert.equal(h.calls.creates.length, 0);
  });
  if (backend === "postgres") for (const kind of ["started", "failed"]) test(`${label}: ${kind} writer waits for webhook row lock and rereads committed PAID`, async () => {
    const h = await harness(method, backend); const a = await h.original("CHECKOUT_STARTED"); const intent = h.intentFor(a);
    h.settle(a, intent); let entered, release;
    const acquired = new Promise(resolve => { entered = resolve; });
    const barrier = new Promise(resolve => { release = resolve; });
    h.live.onIntentRead = async () => { entered(); await barrier; };
    const webhook = h.webhook(a, intent); await acquired;
    const writer = persist(h, a.payment, a.checkout, kind === "started"
      ? { kind, stripeCheckoutId: a.session.id } : { kind, message: "Late network failure" });
    try {
      let waiting = false;
      for (let n = 0; n < 100 && !waiting; n++) {
        const [row] = await postgres.$queryRawUnsafe(`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE usename = 'rfl_b1' AND wait_event_type = 'Lock' AND query LIKE '%FROM "Payment" WHERE "id"%FOR UPDATE%'`);
        waiting = row.count > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(waiting, "final writer must wait for the actual webhook transaction");
    } finally { release(); }
    await webhook; const confirmed = await records(h, a.checkout);
    assert.equal((await writer).kind, "advanced"); assert.deepEqual(await records(h, a.checkout), confirmed);
    assert.equal(confirmed.payment.status, "PAID"); assert.equal(confirmed.checkout.status, "PAID");
  });
}
