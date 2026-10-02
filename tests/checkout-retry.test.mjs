import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { harness, postgres, active } from "./helpers/checkout-harness.mjs";
const clone = value => structuredClone(value);

const backends = postgres ? ["isolated", "postgres"] : ["isolated"];
for (const backend of backends) for (const method of ["ACH", "CARD"]) {
  const label = `${backend} ${method}`;
  test(`${label}: FAILED + open declined Checkout resumes original; late signed settlement is represented`, async () => {
    const h = await harness(method, backend); const a = await h.original("CHECKOUT_STARTED"); const intent = h.intentFor(a);
    a.payment = await h.webhook(a, intent, "payment_intent.payment_failed", "FAILED");
    const before = clone(a.payment); const retry = await h.prepare(); const response = await h.start(retry);
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.paymentId, a.payment.id); assert.equal(body.checkoutUrl, a.session.url);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
    assert.deepEqual(await h.db.payment.findUnique({ where: { id: a.payment.id } }), before);
    assert.equal((await h.db.checkoutSession.findUnique({ where: { id: retry.id } })).paymentId, null);
    assert.deepEqual(h.calls.access.at(-1), [a.session.id, a.checkout.id]);
    h.settle(a, intent); const paid = await h.webhook(a, intent);
    assert.equal(paid.totalChargedCents, method === "ACH" ? 100995 : 104900);
    assert.equal(paid.platformFeeCents, method === "ACH" ? 995 : 4900);
    const params = h.calls.creates[0].params;
    assert.equal(params.line_items.reduce((sum, row) => sum + row.quantity * row.price_data.unit_amount, 0), paid.totalChargedCents);
    assert.equal(params.payment_intent_data.application_fee_amount, paid.platformFeeCents);
    assert.equal(paid.totalChargedCents - paid.platformFeeCents, 100000);
    assert.equal((await h.start(await h.prepare())).status, 409); assert.equal((await h.payments()).length, 1);
  });

  test(`${label}: closed processing attempt blocks replacement, then late success records PAID`, async () => {
    const h = await harness(method, backend); const a = await h.original(); const intent = h.intentFor(a, "processing");
    a.session.status = "complete";
    assert.equal((await h.start(await h.prepare())).status, 409);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
    h.settle(a, intent); await h.webhook(a, intent);
  });
  test(`${label}: local EXPIRED with still-open Stripe checkout resumes and records late PAID`, async () => {
    const h = await harness(method, backend); const a = await h.original("EXPIRED"); const intent = h.intentFor(a);
    const response = await h.start(await h.prepare()); assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentId, a.payment.id);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
    h.settle(a, intent); await h.webhook(a, intent);
  });
  test(`${label}: signed processing → failure → delayed processing → late settlement keeps one obligation`, async () => {
    const h = await harness(method, backend); const a = await h.original("CHECKOUT_STARTED");
    const intent = h.intentFor(a, "processing"); a.session.status = "complete"; intent.last_payment_error = null;
    await h.webhook(a, intent, "payment_intent.processing", "PENDING");
    assert.equal((await h.start(await h.prepare())).status, 409);
    intent.status = "requires_payment_method"; intent.last_payment_error = { code: "payment_failed", message: "Attempt failed" };
    await h.webhook(a, intent, "payment_intent.payment_failed", "FAILED");
    assert.equal((await h.start(await h.prepare())).status, 409);
    intent.status = "processing"; intent.last_payment_error = null;
    await h.webhook(a, intent, "payment_intent.processing", "FAILED");
    assert.equal((await h.start(await h.prepare())).status, 409);
    h.settle(a, intent); await h.webhook(a, intent);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });

  for (const status of ["FAILED", "EXPIRED", "CHECKOUT_STARTED"]) {
    test(`${label}: ${status} + expired session without intent permits one new attempt`, async () => {
      const h = await harness(method, backend); const a = await h.original(status); a.session.status = "expired"; a.session.url = null;
      assert.equal((await h.start(await h.prepare())).status, 200);
      const rows = await h.payments(); assert.equal(rows.length, 2);
      assert.equal(rows.filter(row => active.has(row.status)).length, 1);
      assert.equal(rows.find(row => row.id === a.payment.id).status, status === "CHECKOUT_STARTED" ? "EXPIRED" : status);
      assert.equal(h.calls.creates.length, 2);
    });
  }
  for (const closed of ["expired", "complete"]) test(`${label}: ${closed} with conclusively canceled intent permits retry`, async () => {
    const h = await harness(method, backend); const a = await h.original(); h.intentFor(a, "canceled"); a.session.status = closed;
    assert.equal((await h.start(await h.prepare())).status, 200);
    assert.equal((await h.payments()).length, 2); assert.equal(h.calls.creates.length, 2);
  });
  for (const [name, change, expected] of [
    ["Checkout read failure", (h) => { h.live.fail = "session"; }, 500],
    ["intent read failure", (h, a) => { h.intentFor(a); h.live.fail = "intent"; }, 500],
    ["unknown Checkout status", (h, a) => { a.session.status = null; }, 500],
    ["malformed missing intent reference", (h, a) => { a.session.status = "expired"; delete a.session.payment_intent; }, 500],
    ["open Checkout with canceled intent", (h, a) => { h.intentFor(a, "canceled"); }, 409],
    ["complete Checkout without intent", (h, a) => { a.session.status = "complete"; }, 409],
    ["expired processing intent", (h, a) => { a.session.status = "expired"; h.intentFor(a, "processing"); }, 409],
    ["closed retryable intent", (h, a) => { a.session.status = "complete"; h.intentFor(a); }, 409],
    ["expired requires_action intent", (h, a) => { a.session.status = "expired"; h.intentFor(a, "requires_action"); }, 409],
    ["expired requires_capture intent", (h, a) => { a.session.status = "expired"; h.intentFor(a, "requires_capture"); }, 409],
    ["expired succeeded intent", (h, a) => { const i = h.intentFor(a); h.settle(a, i); a.session.status = "expired"; }, 409],
    ["expired recoverable checkout", (h, a) => { a.session.status = "expired"; a.session.after_expiration = { recovery: { enabled: true } }; }, 409],
    ["wrong Stripe amount", (h, a) => { a.session.amount_total++; }, 500],
    ["wrong Stripe metadata owner", (h, a) => { a.session.metadata.paymentId = "someone-else"; }, 500],
    ["wrong intent destination", (h, a) => { h.intentFor(a, "canceled").transfer_data.destination = "acct_other"; a.session.status = "expired"; }, 500],
    ["canceled intent with money received", (h, a) => { h.intentFor(a, "canceled").amount_received = 1; a.session.status = "expired"; }, 409],
    ["missing persisted Stripe ID", async (h, a) => { await h.db.payment.update({ where: { id: a.payment.id }, data: { stripeCheckoutSessionId: null } }); }, 409],
    ["different payer", (h, a, retry) => h.db.checkoutSession.update({ where: { id: retry.id }, data: { phone: "5555559999" } }), 409],
    ["different payment method", (h, a, retry) => h.db.checkoutSession.update({ where: { id: retry.id }, data: { paymentMethod: method === "ACH" ? "CARD" : "ACH" } }), 409],
  ]) test(`${label}: ${name} fails closed without sibling`, async () => {
    const h = await harness(method, backend); const a = await h.original(); const retry = await h.prepare();
    await change(h, a, retry); assert.equal((await h.start(retry)).status, expected);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });

  for (const status of ["PAID", "PENDING", "DISPUTED", "RETURNED"]) test(`${label}: ${status} cannot create another collectible Payment`, async () => {
    const h = await harness(method, backend); await h.original(status);
    assert.equal((await h.start(await h.prepare())).status, 409);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });

  test(`${label}: scan older collectible attempts even when newer history is terminal`, async () => {
    const h = await harness(method, backend); const a = await h.original(); const retry = await h.prepare();
    await h.db.payment.create({ data: { businessId: a.payment.businessId, sourceType: "RECURRING_PLAN", sourceId: a.payment.sourceId,
      billingCycle: a.payment.billingCycle, referenceLabel: a.payment.referenceLabel, status: "EXPIRED", paymentMethod: method,
      payerFirstName: "Test", payerLastName: "Payer", payerPhone: "5555551234", itemDescription: "Older legacy attempt",
      lineItemsSnapshot: a.payment.lineItemsSnapshot, subtotalCents: 100000, platformFeeCents: a.payment.platformFeeCents,
      totalChargedCents: a.payment.totalChargedCents, businessProceedsCents: 100000, stripeCheckoutSessionId: `cs_unknown_${randomUUID()}` } });
    assert.equal((await h.start(retry)).status, 500);
    assert.equal(h.calls.creates.length, 1); assert.equal((await h.payments()).length, 2);
  });
  test(`${label}: verified newer terminal history cannot hide an earlier FAILED collectible attempt`, async () => {
    const h = await harness(method, backend); const a = await h.original();
    const stripeId = `cs_terminal_${randomUUID()}`;
    const data = { ...a.payment, status: "EXPIRED", stripeCheckoutSessionId: stripeId };
    delete data.id; delete data.createdAt; delete data.updatedAt;
    const terminal = await h.db.payment.create({ data });
    const checkoutData = { ...a.checkout, paymentId: terminal.id, stripeCheckoutSessionId: stripeId, status: "EXPIRED" };
    delete checkoutData.id; delete checkoutData.createdAt; delete checkoutData.updatedAt;
    const terminalCheckout = await h.db.checkoutSession.create({ data: checkoutData });
    h.live.sessions.set(stripeId, { ...clone(a.session), id: stripeId, status: "expired", url: null,
      client_reference_id: terminal.id, metadata: { ...a.session.metadata, paymentId: terminal.id, checkoutSessionId: terminalCheckout.id } });
    const response = await h.start(await h.prepare()); assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentId, a.payment.id);
    assert.equal((await h.payments()).length, 2); assert.equal(h.calls.creates.length, 1);
    const intent = h.intentFor(a); h.settle(a, intent); await h.webhook(a, intent);
  });

  test(`${label}: simultaneous fresh starts reserve only one Payment and Stripe Checkout`, async () => {
    const h = await harness(method, backend); const checkouts = await Promise.all(Array.from({ length: 8 }, () => h.prepare()));
    const responses = await Promise.all(checkouts.map(h.start));
    assert.ok(responses.some(row => row.status === 200));
    assert.ok(responses.every(row => [200, 409].includes(row.status)));
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: simultaneous retry/resume requests never create a sibling`, async () => {
    const h = await harness(method, backend); const a = await h.original(); h.intentFor(a);
    const checkouts = await Promise.all(Array.from({ length: 8 }, () => h.prepare()));
    const responses = await Promise.all(checkouts.map(h.start));
    assert.ok(responses.every(row => row.status === 200));
    for (const response of responses) assert.equal((await response.json()).paymentId, a.payment.id);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: same Checkout concurrent requests cannot create two Stripe resources`, async () => {
    const h = await harness(method, backend); const checkout = await h.prepare();
    await Promise.all(Array.from({ length: 8 }, () => h.start(checkout)));
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: concurrent starts after terminal expiration reserve only one replacement`, async () => {
    const h = await harness(method, backend); const a = await h.original("CHECKOUT_STARTED"); a.session.status = "expired";
    const checkouts = await Promise.all(Array.from({ length: 8 }, () => h.prepare()));
    const responses = await Promise.all(checkouts.map(h.start));
    assert.ok(responses.some(row => row.status === 200)); assert.ok(responses.every(row => [200, 409].includes(row.status)));
    assert.equal((await h.payments()).length, 2); assert.equal(h.calls.creates.length, 2);
    assert.equal((await h.payments()).filter(row => active.has(row.status)).length, 1);
  });
  test(`${label}: ambiguous create failure retains reservation despite FAILED and old age`, async () => {
    const h = await harness(method, backend); h.live.createFailure = true;
    assert.equal((await h.start(await h.prepare())).status, 500);
    const [payment] = await h.payments(); assert.equal(payment.status, "FAILED");
    await h.db.payment.update({ where: { id: payment.id }, data: { createdAt: new Date("2020-01-01") } });
    assert.equal((await h.start(await h.prepare())).status, 409);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: B3 signed cancellation return reuses the collectible attempt`, async () => {
    const h = await harness(method, backend); const a = await h.original();
    const response = await h.start(a.checkout); assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentId, a.payment.id);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: a paid timestamp still blocks retry if another writer regresses local status`, async () => {
    const h = await harness(method, backend); const a = await h.original();
    await h.db.payment.update({ where: { id: a.payment.id }, data: { paidAt: new Date() } });
    assert.equal((await h.start(await h.prepare())).status, 409);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });

  if (backend === "postgres") test(`${label}: checkout-start waits for the real webhook row lock and sees committed PAID`, async () => {
    const h = await harness(method, backend); const a = await h.original(); const retry = await h.prepare();
    const intent = h.intentFor(a); h.settle(a, intent);
    let entered, release;
    const acquired = new Promise(resolve => { entered = resolve; });
    const continueWebhook = new Promise(resolve => { release = resolve; });
    h.live.onIntentRead = async () => { entered(); await continueWebhook; };
    const webhook = h.webhook(a, intent); await acquired;
    const start = h.start(retry);
    try {
      let waiting = false;
      for (let n = 0; n < 100 && !waiting; n++) {
        const [row] = await postgres.$queryRawUnsafe(`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE usename = 'rfl_b1' AND wait_event_type = 'Lock' AND query LIKE '%"referenceLabel"%ORDER BY%FOR UPDATE%'`);
        waiting = row.count > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(waiting, "checkout-start must block on the real Payment row lock held by the webhook");
    } finally { release(); }
    await webhook; assert.equal((await start).status, 409);
    assert.equal((await h.payments()).length, 1); assert.equal(h.calls.creates.length, 1);
  });
}

if (postgres) test("postgres: the unchanged real index rejects the original FAILED A + CREATED B + late PAID sequence", async () => {
  const h = await harness("ACH", "postgres"); const a = await h.original();
  const data = { ...a.payment }; delete data.id; delete data.createdAt; delete data.updatedAt;
  data.stripeCheckoutSessionId = null; data.stripePaymentIntentId = null; data.stripeChargeId = null; data.status = "CREATED";
  await h.db.payment.create({ data });
  await assert.rejects(h.db.payment.update({ where: { id: a.payment.id }, data: { status: "PAID" } }), error => error.code === "P2002");
  assert.equal((await h.db.payment.findUnique({ where: { id: a.payment.id } })).status, "FAILED");
  // Prevention cannot repair a sibling that already existed before deployment.
  // Verify that the unchanged webhook still surfaces this conflict for retries;
  // it must not acknowledge/ignore real money while leaving RFL inconsistent.
  assert.equal((await h.start(await h.prepare())).status, 409);
  const intent = h.intentFor(a); h.settle(a, intent);
  await h.webhook(a, intent, "payment_intent.succeeded", "FAILED", 500);
  assert.equal(await h.db.smsReceipt.findUnique({ where: { paymentId: a.payment.id } }), null);
});
