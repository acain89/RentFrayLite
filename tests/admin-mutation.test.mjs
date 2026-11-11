import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { authHarness } from './helpers/auth-harness.mjs';

const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture() {
  const h = await authHarness();
  await h.issue('MANAGER'); await h.issue('MANAGER', 1); await h.issue('ADMIN');
  // These rows are read only by the retention predicate. Existing B6 suites
  // separately exercise actual payment/checkouts and hard-delete cascades.
  h.db.payment = { findFirst: async () => ({ id: 'retained-payment' }) };
  h.db.checkoutSession = { findFirst: async () => null };
  return h;
}
const snapshot = async h => ({
  managers: await h.db.manager.findMany(), businesses: await h.db.business.findMany(),
  sessions: await h.db.session.findMany(), tokens: await h.db.verificationToken.findMany(), audits: await h.db.auditLog.findMany(),
});
const remove = h => h.load('app/api/admin/businesses/[businessId]/route.ts').DELETE(new Request('https://example.test/api', { method: 'DELETE', headers: { origin: 'https://example.test' } }), { params: Promise.resolve({ businessId: h.businesses[0].id }) });
const call = (h, kind) => kind === 'credentials' ? h.reset() : remove(h);
function interceptTransaction(h, hook) {
  const original = h.db.$transaction.bind(h.db);
  h.db.$transaction = (fn, options) => original(async tx => fn(new Proxy(tx, {
    get(target, key) {
      if (key === '$queryRaw') return async q => { await hook(q); return target.$queryRaw(q); };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    },
  })), options);
}

test('valid admin credential reset revokes only target sessions and recovery tokens', async () => {
  const h = await fixture();
  for (const b of h.businesses) await h.db.verificationToken.create({ data: { businessId: b.id, type: 'PASSWORD_RESET' } });
  const other = await h.db.manager.findUnique({ where: { id: h.managers[1].id } });
  assert.equal((await h.reset()).status, 200);
  assert.equal(await bcrypt.compare('new-password', (await h.db.manager.findUnique({ where: { id: h.managers[0].id } })).passwordHash), true);
  assert.deepEqual(await h.db.manager.findUnique({ where: { id: h.managers[1].id } }), other);
  assert.equal((await h.db.session.findMany({ where: { managerId: h.managers[0].id } })).length, 0);
  assert.equal((await h.db.session.findMany({ where: { managerId: h.managers[1].id } })).length, 1);
  assert.ok((await h.db.verificationToken.findUnique({ where: { businessId: h.businesses[0].id } })).usedAt);
  assert.equal((await h.db.verificationToken.findUnique({ where: { businessId: h.businesses[1].id } })).usedAt, null);
});

test('revocation during bcrypt hashing rejects credentials without partial writes', async () => {
  const entered = gate(), release = gate();
  const h = await authHarness('isolated', undefined, { bcryptjs: { __esModule: true, default: { ...bcrypt, hash: async (...args) => { entered.resolve(); await release.promise; return bcrypt.hash(...args); } } } });
  await h.issue('ADMIN');
  const pending = h.reset(); await entered.promise;
  await h.db.session.deleteMany({ where: { adminAccessId: h.admins[0].id } });
  const before = await snapshot(h); release.resolve();
  assert.equal((await pending).status, 401); assert.deepEqual(await snapshot(h), before);
});

for (const kind of ['credentials', 'deletion']) {
  for (const change of ['revoked', 'expired', 'inactive admin', 'changed admin credential', 'wrong admin', 'wrong token', 'manager identity']) {
    test(`${kind}: delayed request rejects ${change} authority`, async () => {
      const h = await fixture(), entered = gate(), release = gate();
      const context = { params: { then(resolve) { entered.resolve(); release.promise.then(() => resolve({ businessId: h.businesses[0].id })); } } };
      const pending = kind === 'credentials'
        ? h.load('app/api/admin/businesses/[businessId]/credentials/route.ts').PATCH(h.request({ email: 'updated@example.test' }), context)
        : h.load('app/api/admin/businesses/[businessId]/route.ts').DELETE(new Request('https://example.test/api', { method: 'DELETE', headers: { origin: 'https://example.test' } }), context);
      // Resolve a separate barrier only after the initial authorization completes.
      await entered.promise;
      const session = await h.session.getCurrentSession();
      if (change === 'revoked') await h.db.session.deleteMany({ where: { id: session.id } });
      if (change === 'expired') await h.db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
      if (change === 'inactive admin') await h.db.adminAccess.update({ where: { id: h.admins[0].id }, data: { isActive: false } });
      if (change === 'changed admin credential') await h.db.adminAccess.update({ where: { id: h.admins[0].id }, data: { codeHash: 'changed-fixture' } });
      if (change === 'wrong admin') await h.db.session.update({ where: { id: session.id }, data: { adminAccessId: h.admins[1].id } });
      if (change === 'wrong token') await h.db.session.update({ where: { id: session.id }, data: { tokenHash: 'changed-fixture' } });
      if (change === 'manager identity') await h.db.session.update({ where: { id: session.id }, data: { type: 'MANAGER', managerId: h.managers[0].id } });
      const before = await snapshot(h); release.resolve();
      const response = await pending; assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'Unauthorized.' });
      assert.deepEqual(await snapshot(h), before);
    });
  }
  test(`${kind}: database expiry after business-lock wait rejects before changes`, async () => {
    const h = await fixture(), session = await h.session.getCurrentSession();
    interceptTransaction(h, async q => { if (/FROM "Business"/.test(q.sql)) h.db.now = new Date(session.expiresAt); });
    const before = await snapshot(h); assert.equal((await call(h, kind)).status, 401); assert.deepEqual(await snapshot(h), before);
  });
  test(`${kind}: expiry after writes rolls back credentials, sessions, business and audit`, async () => {
    const h = await fixture(), session = await h.session.getCurrentSession();
    const create = h.db.auditLog.create; h.db.auditLog.create = async args => { const row = await create(args); h.db.now = new Date(session.expiresAt); return row; };
    const before = await snapshot(h); assert.equal((await call(h, kind)).status, 401); assert.deepEqual(await snapshot(h), before);
  });
  test(`${kind}: revocation committed before transaction rejects`, async () => {
    const h = await fixture(), original = h.db.$transaction.bind(h.db); let once = true;
    h.db.$transaction = async (fn, options) => { if (once) { once = false; await h.db.session.deleteMany({ where: { adminAccessId: h.admins[0].id } }); } return original(fn, options); };
    const beforeManagers = await h.db.manager.findMany(), beforeBusinesses = await h.db.business.findMany();
    assert.equal((await call(h, kind)).status, 401);
    assert.deepEqual(await h.db.manager.findMany(), beforeManagers); assert.deepEqual(await h.db.business.findMany(), beforeBusinesses);
    assert.equal((await h.db.auditLog.findMany()).length, 0);
  });
  test(`${kind}: unauthenticated request rejects`, async () => {
    const h = await fixture(); h.jar.clear(); const before = await snapshot(h);
    assert.equal((await call(h, kind)).status, 401); assert.deepEqual(await snapshot(h), before);
  });
  test(`${kind}: mutation already serialized first completes before queued revocation`, async () => {
    const h = await fixture(), entered = gate(), release = gate();
    const create = h.db.auditLog.create;
    h.db.auditLog.create = async args => { entered.resolve(); await release.promise; return create(args); };
    const pending = call(h, kind); await entered.promise;
    let revoked = false;
    const revocation = h.db.$transaction(async tx => { await tx.session.deleteMany({ where: { adminAccessId: h.admins[0].id } }); revoked = true; });
    await Promise.resolve(); assert.equal(revoked, false);
    release.resolve(); assert.equal((await pending).status, 200); await revocation;
    assert.equal(await h.session.getCurrentSession(), null);
    assert.equal((await call(h, kind)).status, 401);
  });
}

test('valid deactivation preserves other business and payment history', async () => {
  const h = await fixture(), other = await h.db.business.findUnique({ where: { id: h.businesses[1].id } });
  const history = await h.db.payment.findFirst();
  const response = await remove(h); assert.equal(response.status, 200); assert.equal((await response.json()).action, 'deactivated');
  assert.equal((await h.db.business.findUnique({ where: { id: h.businesses[0].id } })).isActive, false);
  assert.deepEqual(await h.db.business.findUnique({ where: { id: h.businesses[1].id } }), other);
  assert.deepEqual(await h.db.payment.findFirst(), history);
});
