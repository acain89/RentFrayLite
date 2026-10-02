import assert from 'node:assert/strict';
import test from 'node:test';
import { harness, postgres } from './helpers/checkout-harness.mjs';

const backends = [...(postgres ? ['postgres'] : []), 'isolated'];
const review = (h, checkout) => h.load('app/[accountCode]/review/page.tsx').default({ params: Promise.resolve({ accountCode: h.business.accountCode }), searchParams: Promise.resolve({ session: checkout.id }) });
const stored = async (h, a) => ({ payment: await h.db.payment.findUnique({ where: { id: a.payment.id } }), checkout: await h.db.checkoutSession.findUnique({ where: { id: a.checkout.id } }) });
async function fail(h) {
  const a = await h.failedAttempt(), intent = a.intent;
  const state = await stored(h, a);
  assert.equal(state.payment.status, 'FAILED'); assert.equal(state.checkout.status, 'FAILED');
  assert.equal(a.session.status, 'open'); assert.equal(intent.status, 'requires_payment_method');
  return { ...a, checkout: state.checkout, payment: state.payment, intent };
}
async function singleAttempt(h, a) {
  assert.equal((await h.payments()).length, 1);
  assert.equal((await h.db.checkoutSession.findMany({ where: { businessId: h.business.id } })).length, 1);
  assert.equal(h.calls.creates.length, 1); assert.equal(h.live.sessions.size, 1);
  const state = await stored(h, a);
  assert.equal(state.payment.stripeCheckoutSessionId, a.session.id);
  assert.equal(state.checkout.stripeCheckoutSessionId, a.session.id); assert.equal(state.checkout.paymentId, a.payment.id);
}
for (const backend of backends) for (const method of ['ACH', 'CARD']) {
  const label = `${backend} ${method} real failure/resume`;
  test(label + ': signed failure webhook reaches production review and resumes original immutable attempt', async () => {
    const h = await harness(method, backend), a = await fail(h), before = await stored(h, a);
    const element = await review(h, a.checkout);
    assert.equal(element.props.checkoutSessionId, a.checkout.id, 'production review must expose Continue for a bound failed attempt');
    const response = await h.start(a.checkout); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, checkoutUrl: a.session.url, paymentId: a.payment.id });
    assert.deepEqual(await stored(h, a), before); await singleAttempt(h, a);
    const params = h.calls.creates[0].params, fee = method === 'ACH' ? 995 : 4900, total = 100000 + fee;
    assert.equal(before.checkout.baseAmountCents, 100000); assert.equal(before.checkout.platformFeeCents, fee);
    assert.equal(before.checkout.totalCents, total); assert.equal(before.payment.totalChargedCents, total);
    assert.equal(params.line_items.reduce((sum, item) => sum + item.quantity * item.price_data.unit_amount, 0), before.payment.totalChargedCents);
    const feeItems = before.checkout.lineItems.filter(item => item.type === 'PLATFORM_FEE'); assert.equal(feeItems.length, 1);
    assert.equal(params.line_items.filter(item => item.price_data.product_data.name === feeItems[0].label).length, 1);
    assert.equal(params.payment_intent_data.application_fee_amount, fee); assert.equal(total - fee, before.payment.businessProceedsCents);
  });

  test(label + ': manager price/billing edits and local TTL cannot reprice or strand a linked attempt', async () => {
    const h = await harness(method, backend), a = await fail(h);
    Object.assign(h.business.recurringPlans[0], { baseAmountCents: 250000, dueDay: 15, initialLateFeeCents: 1000 });
    if (backend === 'postgres') await h.db.recurringPlan.update({ where: { id: h.business.recurringPlans[0].id }, data: { baseAmountCents: 250000, dueDay: 15, initialLateFeeCents: 1000 } });
    await h.db.checkoutSession.update({ where: { id: a.checkout.id }, data: { expiresAt: new Date(0) } });
    const before = await stored(h, a), params = structuredClone(h.calls.creates[0]);
    assert.equal((await review(h, a.checkout)).props.checkoutSessionId, a.checkout.id);
    assert.equal((await h.start(a.checkout)).status, 200);
    assert.deepEqual(await stored(h, a), before); assert.deepEqual(h.calls.creates[0], params); await singleAttempt(h, a);
  });
  test(label + ': linked local EXPIRED reconciles open Stripe; unlinked FAILED/EXPIRED never create', async () => {
    const h = await harness(method, backend), a = await fail(h);
    await h.db.payment.update({ where: { id: a.payment.id }, data: { status: 'EXPIRED' } });
    await h.db.checkoutSession.update({ where: { id: a.checkout.id }, data: { status: 'EXPIRED', expiresAt: new Date(0) } });
    const before = await stored(h, a);
    assert.equal((await review(h, a.checkout)).props.checkoutSessionId, a.checkout.id);
    assert.equal((await h.start(a.checkout)).status, 200); assert.deepEqual(await stored(h, a), before);
    for (const status of ['FAILED', 'EXPIRED']) {
      await h.db.checkoutSession.update({ where: { id: a.checkout.id }, data: { status, paymentId: null, stripeCheckoutSessionId: null } });
      assert.equal((await h.start(a.checkout)).status, 409);
    }
    assert.equal(h.calls.creates.length, 1); assert.equal((await h.payments()).length, 1);
  });
  for (const success of ['payment_intent.succeeded', 'checkout.session.async_payment_succeeded']) test(label + ': resume then ' + success + ' records PAID once', async () => {
    const h = await harness(method, backend), a = await fail(h);
    const financial = await stored(h, a); assert.equal((await h.start(a.checkout)).status, 200);
    h.settle(a, a.intent);
    const notice = success.startsWith('checkout.') ? a.session : a.intent;
    await h.webhook(a, notice, success, 'PAID'); await h.webhook(a, notice, success, 'PAID');
    const after = await stored(h, a);
    for (const field of ['subtotalCents', 'platformFeeCents', 'totalChargedCents', 'businessProceedsCents', 'billingCycle', 'sourceId', 'referenceLabel', 'lineItemsSnapshot']) assert.deepEqual(after.payment[field], financial.payment[field]);
    assert.equal(after.checkout.status, 'PAID'); assert.equal((await h.start(a.checkout)).status, 409);
    assert.equal((await h.db.smsReceipt.findMany({ where: { paymentId: a.payment.id } })).length, 1); await singleAttempt(h, a);
  });
  for (const state of ['complete', 'expired', 'canceled', 'processing', 'succeeded', 'requires_capture']) test(label + ': refuses externally ' + state + ' without creating siblings', async () => {
    const h = await harness(method, backend), a = await fail(h);
    if (['complete', 'expired'].includes(state)) a.session.status = state;
    else { a.intent.status = state; if (state === 'succeeded') h.settle(a, a.intent); }
    const before = await stored(h, a);
    assert.equal((await h.start(a.checkout)).status, 409); assert.deepEqual(await stored(h, a), before); await singleAttempt(h, a);
  });
  for (const event of ['checkout.session.expired', 'payment_intent.canceled']) test(label + ': failure then ' + event + ' cannot resume; only B1 can replace', async () => {
    const h = await harness(method, backend), a = await fail(h);
    a.intent.status = 'canceled'; a.session.status = 'expired'; a.session.url = null;
    await h.webhook(a, event.startsWith('checkout.') ? a.session : a.intent, event, 'FAILED');
    assert.equal((await h.start(a.checkout)).status, 409); await singleAttempt(h, a);
    const fresh = await h.prepare(); assert.equal((await h.start(fresh)).status, 200);
    assert.equal((await h.payments()).length, 2); assert.equal(h.calls.creates.length, 2);
    const old = await stored(h, a); assert.equal(old.payment.stripeCheckoutSessionId, a.session.id); assert.equal(old.checkout.paymentId, a.payment.id);
  });
  test(label + ': duplicate failure delivery is idempotent and failure after success cannot regress', async () => {
    const h = await harness(method, backend), a = await fail(h), failedNotice = structuredClone(a.intent);
    const eventId = 'evt_duplicate_' + a.payment.id;
    await h.webhook(a, a.intent, 'payment_intent.payment_failed', 'FAILED', 200, eventId);
    const before = await stored(h, a);
    await h.webhook(a, a.intent, 'payment_intent.payment_failed', 'FAILED', 200, eventId);
    assert.deepEqual(await stored(h, a), before);
    assert.equal((await h.db.auditLog.findMany({ where: { targetId: a.payment.id } })).filter(row => row.metadata?.stripeEventId === eventId).length, 1);
    h.settle(a, a.intent); await h.webhook(a, a.intent);
    const paid = await stored(h, a); await h.webhook(a, failedNotice, 'payment_intent.payment_failed', 'PAID');
    assert.deepEqual(await stored(h, a), paid); assert.equal((await h.start(a.checkout)).status, 409); await singleAttempt(h, a);
  });
  for (const status of ['PAID', 'PENDING', 'RETURNED', 'DISPUTED']) test(label + ': stale FAILED checkout cannot override protected Payment ' + status, async () => {
    const h = await harness(method, backend), a = await fail(h);
    // Deliberately stale local Checkout state: it must never authorize changing
    // an advanced Payment, even before its next page observation.
    await h.db.payment.update({ where: { id: a.payment.id }, data: { status } });
    const before = await stored(h, a); assert.equal((await h.start(a.checkout)).status, 409);
    assert.deepEqual(await stored(h, a), before); await singleAttempt(h, a);
  });
  for (const attack of ['missing binding', 'tampered binding', 'different customer binding', 'wrong payment', 'wrong business', 'wrong obligation', 'wrong payer', 'wrong method', 'wrong total', 'wrong fee', 'wrong snapshot', 'wrong Stripe id', 'wrong intent id', 'wrong Stripe metadata', 'wrong intent destination', 'wrong Stripe method', 'forged account code']) test(label + ': FAILED is no shortcut for ' + attack, async () => {
    const h = await harness(method, backend), a = await fail(h); const changes = {};
    if (attack === 'missing binding') h.cookieJar.clear();
    if (attack === 'tampered binding') for (const key of h.cookieJar.keys()) h.cookieJar.set(key, 'a'.repeat(64));
    if (attack === 'different customer binding') { h.cookieJar.clear(); await h.load('lib/paymentResultAccess.ts').grantPaymentResultAccess(a.session.id, 'another-customer'); }
    if (attack === 'wrong payment') changes.paymentId = 'another-payment';
    if (attack === 'wrong business') { const other = await harness(method, backend); await h.db.payment.update({ where: { id: a.payment.id }, data: { businessId: other.business.id } }); }
    if (attack === 'wrong obligation') changes.unitNumber = '999';
    if (attack === 'wrong payer') changes.phone = '5555559999';
    if (attack === 'wrong method') changes.paymentMethod = method === 'ACH' ? 'CARD' : 'ACH';
    if (attack === 'wrong total') changes.totalCents = a.checkout.totalCents + 1;
    if (attack === 'wrong fee') changes.platformFeeCents = a.checkout.platformFeeCents + 1;
    if (attack === 'wrong snapshot') changes.lineItems = a.checkout.lineItems.map(item => ({ ...item, label: item.label + ' tampered' }));
    if (attack === 'wrong Stripe id') changes.stripeCheckoutSessionId = 'cs_wrong_' + a.checkout.id;
    if (attack === 'wrong intent id') await h.db.payment.update({ where: { id: a.payment.id }, data: { stripePaymentIntentId: a.intent.id + 'wrong' } });
    if (attack === 'wrong Stripe metadata') a.session.metadata.businessId = 'someone-else';
    if (attack === 'wrong intent destination') a.intent.transfer_data.destination = 'acct_someone_else';
    if (attack === 'wrong Stripe method') a.session.payment_method_types = [method === 'ACH' ? 'card' : 'us_bank_account'];
    if (attack === 'forged account code') changes.accountCode = 'ZZ-0000';
    if (Object.keys(changes).length) await h.db.checkoutSession.update({ where: { id: a.checkout.id }, data: changes });
    const before = await stored(h, a), response = await h.start(a.checkout);
    assert.ok([409, 500].includes(response.status)); assert.deepEqual(await stored(h, a), before);
    assert.equal(h.calls.creates.length, 1); assert.equal(h.live.sessions.size, 1);
    if (attack.includes('binding')) await assert.rejects(() => review(h, a.checkout), /NOT_FOUND/);
  });
  test(label + ': readiness loss rejects resume but does not cancel external resources', async () => {
    const h = await harness(method, backend), a = await fail(h), before = await stored(h, a);
    h.stripe.accounts.retrieve = async () => { throw Error('Readiness lost'); };
    assert.equal((await h.start(a.checkout)).status, 409); assert.deepEqual(await stored(h, a), before);
    assert.equal(a.session.status, 'open'); await singleAttempt(h, a);
  });
  test(label + ': concurrent Continue clicks after real failure reuse one attempt', async () => {
    const h = await harness(method, backend), a = await fail(h), before = await stored(h, a);
    const responses = await Promise.all(Array.from({ length: 8 }, () => h.start(a.checkout)));
    for (const response of responses) { assert.equal(response.status, 200); assert.equal((await response.json()).paymentId, a.payment.id); }
    assert.deepEqual(await stored(h, a), before); await singleAttempt(h, a);
  });
  for (const target of ['failure', 'success', 'expiration']) test(label + ': ' + target + ' webhook commits before delayed resume authority', async () => {
    const h = await harness(method, backend), a = await fail(h);
    let entered, release; const arrived = new Promise(r => { entered = r; }), barrier = new Promise(r => { release = r; });
    h.live.onBeforeReserve = async () => { entered(); await barrier; };
    const resume = h.start(a.checkout); await arrived;
    if (target === 'success') { h.settle(a, a.intent); await h.webhook(a, a.intent); }
    else if (target === 'expiration') { a.session.status = 'expired'; await h.webhook(a, a.session, 'checkout.session.expired', 'FAILED'); }
    else await h.webhook(a, a.intent, 'payment_intent.payment_failed', 'FAILED');
    const authoritative = await stored(h, a); release(); const response = await resume;
    assert.equal(response.status, target === 'failure' ? 200 : 409);
    assert.deepEqual(await stored(h, a), authoritative); await singleAttempt(h, a);
  });
  test(label + ': actual processing webhook before delayed ordinary resume preserves PENDING', async () => {
    const h = await harness(method, backend), a = await h.original('CHECKOUT_STARTED'), intent = h.intentFor(a, 'processing'); intent.last_payment_error = null;
    let entered, release; const arrived = new Promise(r => { entered = r; }), barrier = new Promise(r => { release = r; });
    h.live.onBeforeReserve = async () => { entered(); await barrier; };
    const resume = h.start(a.checkout); await arrived; await h.webhook(a, intent, 'payment_intent.processing', 'PENDING');
    const authoritative = await stored(h, a); release(); assert.equal((await resume).status, 409);
    assert.deepEqual(await stored(h, a), authoritative); await singleAttempt(h, a);
  });
  for (const target of ['failure', 'success', 'expiration']) test(label + ': resume locks first while ' + target + ' webhook races', async () => {
    const h = await harness(method, backend), a = await fail(h);
    let entered, release, once = false; const arrived = new Promise(r => { entered = r; }), barrier = new Promise(r => { release = r; });
    h.live.onRead = async () => { if (!once) { once = true; entered(); await barrier; } };
    const resume = h.start(a.checkout); await arrived;
    if (target === 'success') h.settle(a, a.intent);
    if (target === 'expiration') a.session.status = 'expired';
    const expected = target === 'success' ? 'PAID' : 'FAILED';
    const webhook = h.webhook(a, target === 'expiration' ? a.session : a.intent, target === 'success' ? 'payment_intent.succeeded' : target === 'failure' ? 'payment_intent.payment_failed' : 'checkout.session.expired', expected);
    // PostgreSQL must expose a genuine row-lock waiter, not a mocked race.
    if (backend === 'postgres') {
      const until = Date.now() + 10000; let waiting = false;
      while (Date.now() < until) {
        const rows = await postgres.$queryRawUnsafe("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
        if (rows.some(row => /Payment.*FOR UPDATE/s.test(row.query))) { waiting = true; break; }
        await new Promise(r => setTimeout(r, 10));
      }
      if (!waiting) { release(); await Promise.allSettled([resume, webhook]); }
      assert.ok(waiting, 'webhook must wait for the real Payment lock');
    }
    release(); await Promise.all([resume, webhook]);
    assert.equal((await stored(h, a)).payment.status, expected);
    assert.equal((await h.start(a.checkout)).status, target === 'failure' ? 200 : 409); await singleAttempt(h, a);
  });
}

for (const backend of backends) for (const method of ['ACH', 'CARD']) test(`${backend} ${method} failed records cannot authorize forged IDs or another business`, async () => {
  const h = await harness(method, backend), a = await fail(h);
  assert.equal((await h.start({ id: 'forged-checkout' })).status, 404);
  await assert.rejects(() => h.load('app/[accountCode]/review/page.tsx').default({ params: Promise.resolve({ accountCode: 'ZZ-0000' }), searchParams: Promise.resolve({ session: a.checkout.id }) }), /NOT_FOUND/);
  const other = await harness(method, backend), foreign = await fail(other);
  const before = await stored(other, foreign);
  assert.ok([404, 409].includes((await h.start(foreign.checkout)).status));
  assert.deepEqual(await stored(other, foreign), before); await singleAttempt(h, a); await singleAttempt(other, foreign);
});
