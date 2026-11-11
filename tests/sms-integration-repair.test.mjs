import assert from 'node:assert/strict';
import test from 'node:test';
import { harness, postgres } from './helpers/checkout-harness.mjs';
import { customFixture } from './helpers/custom-payment-harness.mjs';
import { authHarness } from './helpers/auth-harness.mjs';

const backends = postgres ? ['isolated', 'postgres'] : ['isolated'];
for (const backend of backends) for (const sourceType of ['CUSTOM_PAYMENT', 'RECURRING_PLAN']) {
  async function fixture(method = 'ACH', consent = true) {
    const h = sourceType === 'CUSTOM_PAYMENT' ? await customFixture(method, backend) : await harness(method, backend);
    const evidence = { smsConsent: consent, phone: '312555'+String(Math.floor(Math.random()*10000)).padStart(4, '0') };
    const checkout = sourceType === 'CUSTOM_PAYMENT' ? (await h.prepareCustom('123.45', evidence)).checkout : await h.prepare(evidence);
    const body = { sourceType, accountCode: checkout.accountCode, firstName: checkout.firstName, lastName: checkout.lastName,
      unitNumber: checkout.unitNumber, phone: checkout.phone, paymentMethod: method === 'ACH' ? 'CARD' : 'ACH', previousCheckoutSessionId: checkout.id,
      ...(sourceType === 'CUSTOM_PAYMENT' ? { amount: '123.45' } : { planId: checkout.planId }) };
    const change = extra => h.load('app/api/public/checkout/session/route.ts').POST(new Request('https://example.test/api/public/checkout/session', { method: 'POST', headers: {'content-type':'application/json',origin:'https://example.test'}, body: JSON.stringify({ ...body, ...extra }) }));
    return { h, checkout, body, change };
  }
  async function notificationAfterSettlement(h, checkout) {
    await h.load('app/[accountCode]/review/page.tsx').default({ params: Promise.resolve({ accountCode: checkout.accountCode }), searchParams: Promise.resolve({ session: checkout.id }) });
    assert.equal((await h.start(checkout)).status, 200);
    const [payment] = await h.payments(), session = h.live.sessions.get(payment.stripeCheckoutSessionId);
    const attempt = { payment, session, checkout }, intent = h.intentFor(attempt); h.settle(attempt, intent);
    // The transport fixture was originally constructed with the other method.
    intent.latest_charge.payment_method_details.type = checkout.paymentMethod === 'ACH' ? 'us_bank_account' : 'card';
    await h.webhook(attempt, intent);
    return h.db.smsNotification.findFirst({ where: { paymentId: payment.id, recipientType: 'TENANT' } });
  }
  for (const method of ['ACH', 'CARD']) test(`${backend} ${sourceType}: ${method} method change retains exact consent evidence and server pricing`, async () => {
    const { h, checkout, change } = await fixture(method), before = structuredClone(checkout);
    const response = await change(); assert.equal(response.status, 201, await response.clone().text());
    const result = await response.json(), saved = await h.db.checkoutSession.findUnique({ where: { id: result.checkoutSession.id } });
    assert.notEqual(saved.id, checkout.id); assert.equal(saved.paymentMethod, method === 'ACH' ? 'CARD' : 'ACH');
    assert.equal(saved.smsConsentAt.getTime(), checkout.smsConsentAt.getTime()); assert.equal(saved.smsConsentVersion, checkout.smsConsentVersion);
    assert.equal(saved.phone, checkout.phone); assert.equal(saved.subtotalCents, checkout.subtotalCents);
    assert.deepEqual(await h.db.checkoutSession.findUnique({ where: { id: checkout.id } }), before);
    assert.equal(h.calls.creates.length, 0); assert.equal((await h.payments()).length, 0);
    const quote = sourceType === 'CUSTOM_PAYMENT' ? h.load('lib/customPayment.ts').quoteCustomPayment(saved.subtotalCents, saved.paymentMethod) : h.load('lib/checkoutCalendar.ts').quoteStandardCheckout(h.business, h.business.recurringPlans[0], saved.paymentMethod, new Date());
    assert.equal(saved.platformFeeCents, quote.platformFeeCents);
    assert.equal(saved.totalCents, quote.totalCents ?? quote.totalChargedCents);
    const options = [...h.calls.cookieOptions].find(([name]) => name.startsWith('rfl_checkout_'))[1];
    assert.equal(options.httpOnly, true); assert.equal(options.sameSite, 'lax'); assert.equal(options.path, '/'); assert.equal(options.maxAge, 1800);
    const notification = await notificationAfterSettlement(h, saved);
    assert.equal(notification.status, 'QUEUED'); assert.equal(notification.consentAt.getTime(), checkout.smsConsentAt.getTime());
    assert.equal(notification.consentVersion, checkout.smsConsentVersion);
  });
  test(`${backend} ${sourceType}: absence of consent remains absent`, async () => {
    const { h, change } = await fixture('ACH', false), r = await change(); assert.equal(r.status, 201);
    const row = await h.db.checkoutSession.findUnique({ where: { id: (await r.json()).checkoutSession.id } });
    assert.equal(row.smsConsentAt, null); assert.equal(row.smsConsentVersion, null);
    const notification = await notificationAfterSettlement(h, row);
    assert.equal(notification.status, 'SUPPRESSED'); assert.equal(notification.reasonCode, 'CONSENT_ABSENT');
  });
  for (const kind of ['missing-cookie', 'forged-cookie', 'other-checkout-cookie', 'expired', 'paid', 'reserved', 'wrong-phone', 'wrong-payer', 'wrong-unit', 'wrong-amount', 'client-consent', 'unknown-source', ...(sourceType === 'RECURRING_PLAN' ? ['wrong-cycle'] : [])]) {
    test(`${backend} ${sourceType}: rejects ${kind} consent transfer without creating payments`, async () => {
      const { h, checkout, change } = await fixture(); let extra = {};
      if (kind === 'missing-cookie') h.cookieJar.clear();
      if (kind === 'forged-cookie') for (const k of h.cookieJar.keys()) h.cookieJar.set(k, 'a'.repeat(64));
      if (kind === 'other-checkout-cookie') { const other = sourceType === 'CUSTOM_PAYMENT' ? (await h.prepareCustom()).checkout : await h.prepare(); const own = [...h.cookieJar.keys()].find(k => k.endsWith(checkoutHash(checkout.id))); h.cookieJar.delete(own); assert.notEqual(other.id, checkout.id); }
      if (kind === 'expired') await h.db.checkoutSession.update({ where: { id: checkout.id }, data: { expiresAt: new Date(0) } });
      if (kind === 'paid') await h.db.checkoutSession.update({ where: { id: checkout.id }, data: { status: 'PAID' } });
      if (kind === 'reserved') await h.db.checkoutSession.update({ where: { id: checkout.id }, data: { paymentId: 'reserved-fixture' } });
      if (kind === 'wrong-phone') extra.phone = '3125550199';
      if (kind === 'wrong-payer') extra.firstName = 'Another';
      if (kind === 'wrong-unit') extra.unitNumber = '999';
      if (kind === 'wrong-cycle') await h.db.checkoutSession.update({ where: { id: checkout.id }, data: { billingCycle: '2025-01' } });
      if (kind === 'wrong-amount') { if (sourceType === 'CUSTOM_PAYMENT') extra.amount = '200.00'; else await h.db.checkoutSession.update({ where: { id: checkout.id }, data: { subtotalCents: 1 } }); }
      if (kind === 'client-consent') extra.smsConsent = true;
      if (kind === 'unknown-source') extra.previousCheckoutSessionId = 'unowned-checkout';
      const r = await change(extra); assert.ok([400, 403].includes(r.status), `${r.status}: ${await r.text()}`);
      assert.equal(h.calls.creates.length, 0); assert.equal((await h.payments()).length, 0);
    });
  }
}
import { createHash } from 'node:crypto';
const checkoutHash = id => createHash('sha256').update(id).digest('hex').slice(0, 24);

for (const backend of backends) {
  async function manager() {
    const h = await authHarness(backend); await h.issue();
    // Match the Prisma operation absent from the small in-memory auth transport.
    if (backend === 'isolated') h.db.business.findUniqueOrThrow = async args => { const b = await h.db.business.findUnique(args); assert.ok(b); return b; };
    const post = (body, headers = {}, url = 'http://internal:10000/api/manager/sms') => h.load('app/api/manager/sms/route.ts').POST(new Request(url, { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
    return { h, post };
  }
  test(`${backend}: HTTPS termination permits management ON/OFF with affirmative consent`, async () => {
    const { h, post } = await manager(), id = h.businesses[0].id;
    const otherBefore = await h.db.business.findUnique({ where: { id: h.businesses[1].id } });
    const on = { enabled: true, phone: '3125550100', consent: true };
    assert.equal((await post(on, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'example.test' })).status, 200);
    const saved = await h.db.business.findUnique({ where: { id } }); assert.equal(saved.paymentSmsEnabled, true); assert.ok(saved.smsConsentAt);
    assert.equal((await post({ ...on, enabled: false, consent: false })).status, 200);
    assert.equal((await h.db.business.findUnique({ where: { id } })).paymentSmsEnabled, false);
    assert.equal((await post({ ...on, consent: false })).status, 400);
    assert.equal((await post(on)).status, 200);
    assert.deepEqual(await h.db.business.findUnique({ where: { id: h.businesses[1].id } }), otherBefore);
  });
  for (const headers of [
    { origin: 'https://attacker.test' }, { origin: '' }, { origin: 'null' },
    { origin: 'http://example.test' }, { 'sec-fetch-site': 'cross-site' },
    { origin: 'https://attacker.test', 'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'https' },
    { origin: 'https://attacker.test', forwarded: 'host=example.test;proto=https', 'x-forwarded-host': 'example.test', 'x-forwarded-proto': 'https' },
  ]) test(`${backend}: rejects untrusted SMS origin ${JSON.stringify(headers)}`, async () => {
    const { h, post } = await manager(), before = await h.db.business.findUnique({ where: { id: h.businesses[0].id } });
    assert.equal((await post({ enabled: true, phone: '3125550100', consent: true }, headers)).status, 403);
    assert.deepEqual(await h.db.business.findUnique({ where: { id: before.id } }), before);
  });
  test(`${backend}: forwarded headers cannot override canonical origin`, async () => {
    const { post } = await manager();
    assert.equal((await post({ enabled: false, phone: '', consent: false }, { 'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'http' })).status, 200);
  });
  test(`${backend}: revoked management session cannot toggle SMS`, async () => {
    const { h, post } = await manager(); h.use('invalid-session');
    assert.equal((await post({ enabled: true, phone: '3125550100', consent: true })).status, 401);
  });
}
