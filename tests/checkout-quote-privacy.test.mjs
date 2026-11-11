import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './helpers/checkout-harness.mjs';

const review = (h, q) => h.load('app/[accountCode]/review/page.tsx').default({
  params: Promise.resolve({ accountCode: q.accountCode }), searchParams: Promise.resolve({ session: q.id }),
});
const quoteKey = h => [...h.cookieJar.keys()].find(k => k.startsWith('rfl_checkout_'));
for (const method of ['ACH', 'CARD']) for (const sourceType of ['RECURRING_PLAN', 'CUSTOM_PAYMENT']) {
  const label = `${method} ${sourceType}`;
  const fixture = async () => {
    const clock = { now: '2026-11-08T18:00:00Z' };
    const h = await harness(method, 'isolated', clock);
    const q = await h.prepare(sourceType === 'CUSTOM_PAYMENT' ? { sourceType, planId: undefined, amount: '100.00' } : {});
    return { h, q, clock };
  };
  test(`${label}: issuing browser reviews and reserves without SMS opt-in; retry is immutable`, async () => {
    const { h, q } = await fixture();
    await h.db.checkoutSession.update({ where: { id: q.id }, data: { status: 'CREATED' } });
    const rendered = await review(h, q);
    assert.equal(rendered.props.firstName, q.firstName);
    assert.equal(rendered.props.phone, q.phone);
    assert.equal((await h.start(q)).status, 200);
    const before = await h.payments();
    assert.equal(before.length, 1);
    for (const key of [...h.cookieJar.keys()]) if (key.startsWith('rfl_checkout_')) h.cookieJar.delete(key);
    assert.equal((await h.start(q)).status, 200);
    assert.deepEqual(await h.payments(), before);
    assert.equal(h.calls.creates.length, 1);
    await review(h, q); // Reserved review uses result ownership, not quote TTL.
  });
  for (const kind of ['different browser', 'missing', 'invalid', 'mismatched', 'expired', 'tampered expiry', 'legacy']) {
    test(`${label}: ${kind} cookie cannot disclose or reserve`, async () => {
      const { h, q, clock } = await fixture();
      await h.db.checkoutSession.update({ where: { id: q.id }, data: { status: 'CREATED' } });
      const key = quoteKey(h), original = h.cookieJar.get(key);
      if (kind === 'different browser' || kind === 'missing') h.cookieJar.clear();
      if (kind === 'invalid') h.cookieJar.set(key, 'invalid');
      if (kind === 'mismatched') {
        await h.load('lib/checkoutConsent.ts').grantCheckoutConsentAccess('another-quote');
        h.cookieJar.set(key, [...h.cookieJar.entries()].find(([k]) => k !== key)[1]);
      }
      if (kind === 'expired') {
        clock.now = '2026-11-08T18:30:00Z';
        await h.db.checkoutSession.update({ where: { id: q.id }, data: { expiresAt: new Date('2026-11-08T19:00:00Z') } });
      }
      if (kind === 'tampered expiry') h.cookieJar.set(key, `9999999999999.${original.split('.')[1]}`);
      if (kind === 'legacy') h.cookieJar.set(key, 'a'.repeat(64));
      const before = await h.db.checkoutSession.findUnique({ where: { id: q.id } });
      await assert.rejects(() => review(h, q), /^Error: NOT_FOUND$/);
      const response = await h.start(q);
      assert.equal(response.status, 403);
      const body = await response.text();
      for (const secret of [q.firstName, q.lastName, q.phone, q.unitNumber, String(q.totalCents)]) assert.ok(!body.includes(secret));
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.match(response.headers.get('cache-control'), /private, no-store/);
      assert.deepEqual(await h.db.checkoutSession.findUnique({ where: { id: q.id } }), before);
      assert.equal((await h.payments()).length, 0);
      assert.equal(h.calls.creates.length, 0);
    });
  }
  test(`${label}: loss of ownership while reservation waits creates no payment`, async () => {
    const { h, q } = await fixture();
    h.live.onBeforeReserve = () => h.cookieJar.clear();
    assert.equal((await h.start(q)).status, 409);
    assert.equal((await h.payments()).length, 0);
    assert.equal(h.calls.creates.length, 0);
  });
  test(`${label}: quote cookie cannot substitute for reserved result ownership`, async () => {
    const { h, q } = await fixture();
    assert.equal((await h.start(q)).status, 200);
    for (const key of [...h.cookieJar.keys()]) if (key.startsWith('rfl_result_')) h.cookieJar.delete(key);
    await assert.rejects(() => review(h, q), /NOT_FOUND/);
    assert.equal((await h.start(q)).status, 409);
    assert.equal(h.calls.creates.length, 1);
  });
  test(`${label}: two owned quotes in separate tabs keep independent bindings`, async () => {
    const { h, q } = await fixture();
    const other = await h.prepare(sourceType === 'CUSTOM_PAYMENT' ? { sourceType, planId: undefined, amount: '100.00' } : {});
    await review(h, q); await review(h, other);
    assert.equal((await h.start(q)).status, 200);
    assert.equal((await h.start(other)).status, 200);
    assert.equal((await h.payments()).length, 2);
    assert.equal(h.calls.creates.length, 2);
  });
  test(`${label}: quote expiry cannot expose PII even with a valid cookie`, async () => {
    const { h, q } = await fixture();
    await h.db.checkoutSession.update({ where: { id: q.id }, data: { expiresAt: new Date(0) } });
    const rendered = await review(h, q);
    const text = JSON.stringify(rendered);
    for (const value of [q.firstName, q.lastName, q.phone]) assert.ok(!text.includes(value));
    assert.equal((await h.start(q)).status, 409);
    assert.equal((await h.payments()).length, 0);
  });
}
