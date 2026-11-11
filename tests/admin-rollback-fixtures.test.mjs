import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { authHarness } from './helpers/auth-harness.mjs';
import { installTransactionFault, assertFaultReached, assertRollbackState } from './helpers/transaction-fault-fixture.mjs';

function delegates({ sameClient = false } = {}) {
  const tx = { manager: { tag: 'local', update: async args => args, findUnique() { return this.tag; } } };
  const calls = [];
  const db = { manager: { tag: 'root', update: async () => 'root-write' }, $transaction: async (fn, options) => { calls.push(options); return fn(sameClient ? db : tx); } };
  return { db, tx, calls };
}
const failure = code => Object.assign(Error('Synthetic database failure'), { code });
test('V02 injection reaches local delegate, preserves transaction/options and restores wrapper', async () => {
  const { db, tx, calls } = delegates(), original = db.$transaction, options = { isolationLevel: 'ReadCommitted', timeout: 30000 };
  const fault = installTransactionFault(db, 'manager', 'update', async actual => { assert.equal(actual, tx); throw failure('P2003'); });
  try {
    await assert.rejects(() => db.$transaction(async local => { assert.equal(await local.manager.findUnique(), 'local'); return local.manager.update({}); }, options), error => error.code === 'P2003');
    assertFaultReached(fault.state, 'P2003'); assert.equal(calls[0], options);
  } finally { fault.restore(); }
  assert.equal(db.$transaction, original);
});
test('V02 rejects missed injection through root client', async () => {
  const { db } = delegates(), fault = installTransactionFault(db, 'manager', 'update', async () => { throw failure('P2003'); });
  try { assert.equal(await db.manager.update({}), 'root-write'); assert.throws(() => assertFaultReached(fault.state, 'P2003'), { code: 'ERR_ASSERTION' }); }
  finally { fault.restore(); }
});
test('V02 rejects a transaction that never reaches the intended operation', async () => {
  const { db } = delegates(), fault = installTransactionFault(db, 'manager', 'update', async () => { throw failure('P2003'); });
  try { await db.$transaction(tx => tx.manager.findUnique()); assert.throws(() => assertFaultReached(fault.state, 'P2003'), { code: 'ERR_ASSERTION' }); }
  finally { fault.restore(); }
});
test('V02 detects incorrect commit when injection returns instead of failing', async () => {
  const { db } = delegates(), fault = installTransactionFault(db, 'manager', 'update', async () => 'incorrectly-committed');
  try {
    assert.equal(await db.$transaction(tx => tx.manager.update({})), 'incorrectly-committed');
    assert.throws(() => assertFaultReached(fault.state, 'P2003'), { code: 'ERR_ASSERTION' });
  } finally { fault.restore(); }
});
test('V02 rejection assertion detects a swallowed injected failure despite a valid hit counter', async () => {
  const { db } = delegates(), fault = installTransactionFault(db, 'manager', 'update', async () => { throw failure('P2003'); });
  try {
    const result = db.$transaction(async tx => {
      await tx.manager.update({}).catch(() => {}); // Deliberately incorrect commit control.
      return 'incorrectly-committed';
    });
    await assert.rejects(() => assert.rejects(result, error => error.code === 'P2003'), { code: 'ERR_ASSERTION' });
    assertFaultReached(fault.state, 'P2003'); // A hit alone must never replace rejection/rollback checks.
  } finally { fault.restore(); }
});
test('V02 rejects wrong database failure classification', async () => {
  const { db } = delegates(), fault = installTransactionFault(db, 'manager', 'update', async () => { throw failure('P2025'); });
  try { await assert.rejects(() => db.$transaction(tx => tx.manager.update({}))); assert.throws(() => assertFaultReached(fault.state, 'P2003'), { code: 'ERR_ASSERTION' }); }
  finally { fault.restore(); }
});
test('V02 detects repeated injections', async () => {
  const { db } = delegates(), fault = installTransactionFault(db, 'manager', 'update', async () => { throw failure('P2003'); });
  try {
    await db.$transaction(async tx => { for (let n = 0; n < 2; n++) await assert.rejects(() => tx.manager.update({})); });
    assert.throws(() => assertFaultReached(fault.state, 'P2003'), { code: 'ERR_ASSERTION' });
  } finally { fault.restore(); }
});
test('V02 rejects root client masquerading as a transaction', async () => {
  const { db } = delegates({ sameClient: true }), fault = installTransactionFault(db, 'manager', 'update', async () => { throw failure('P2003'); });
  try { await assert.rejects(() => db.$transaction(tx => tx.manager.update({})), /transaction-local/); assert.throws(() => assertFaultReached(fault.state, 'P2003')); }
  finally { fault.restore(); }
});
const snapshot = {
  businesses: [{ id: 'target', isActive: true }, { id: 'other', isActive: true }],
  managers: [{ id: 'target', passwordHash: 'synthetic-original' }, { id: 'other', passwordHash: 'synthetic-other' }],
  sessions: [{ id: 'original-session' }], tokens: [{ id: 'original-token', usedAt: null }],
  audits: [], payments: [{ id: 'target', totalChargedCents: 10200, actualManagementNetCents: null }, { id: 'other', totalChargedCents: 10200 }],
};
test('V02 accepts a complete unchanged rollback snapshot', () => assertRollbackState(snapshot, structuredClone(snapshot)));
for (const [name, mutate] of [
  ['partial credential write', state => { state.managers[0].passwordHash = 'changed'; }],
  ['partial token revocation', state => { state.tokens[0].usedAt = new Date(); }],
  ['partial session deletion', state => { state.sessions = []; }],
  ['partial audit commit', state => { state.audits.push({ id: 'uncommitted' }); }],
  ['financial amount change', state => { state.payments[0].totalChargedCents++; }],
  ['unknown promoted to zero', state => { state.payments[0].actualManagementNetCents = 0; }],
  ['cross-business credential change', state => { state.managers[1].passwordHash = 'changed'; }],
  ['cross-business financial change', state => { state.payments[1].totalChargedCents++; }],
  ['cross-business status change', state => { state.businesses[1].isActive = false; }],
]) test('V02 detects ' + name + ' surviving rollback', () => {
  const after = structuredClone(snapshot); mutate(after);
  assert.throws(() => assertRollbackState(snapshot, after), { code: 'ERR_ASSERTION' });
});
const authState = async h => Object.fromEntries(await Promise.all(['business','manager','session','verificationToken','auditLog','adminAccess'].map(async model => [model, await h.db[model].findMany()])));
for (const kind of ['anonymous','manager','inactive-admin','foreign-origin']) test('V02 administrative rollback path rejects ' + kind, async () => {
  const h = await authHarness();
  if (kind !== 'anonymous') await h.issue(kind === 'manager' ? 'MANAGER' : 'ADMIN');
  if (kind === 'inactive-admin') await h.db.adminAccess.update({ where: { id: h.admins[0].id }, data: { isActive: false } });
  const before = await authState(h), fault = installTransactionFault(h.db, 'manager', 'update', async () => { throw failure('P2003'); });
  try {
    const response = kind === 'foreign-origin'
      ? await h.load('app/api/admin/businesses/[businessId]/credentials/route.ts').PATCH(new Request('https://example.test/api', { method: 'PATCH', headers: { origin: 'https://foreign.invalid', 'content-type': 'application/json' }, body: '{}' }), { params: Promise.resolve({ businessId: h.businesses[0].id }) })
      : await h.reset();
    assert.equal(response.status, kind === 'foreign-origin' ? 403 : 401);
    assert.equal(fault.state.calls, 0); assert.equal(fault.state.transactions, 0);
  } finally { fault.restore(); }
  const expected = structuredClone(before);
  if (kind === 'inactive-admin') {
    // Authentication deliberately purges the one invalid session; no protected
    // credential, business, token, audit or unrelated principal may change.
    assert.equal(expected.session.length, 1);
    assert.equal(expected.session[0].adminAccessId, h.admins[0].id);
    expected.session = []; assert.equal(h.token(), '');
  }
  assertRollbackState(expected, await authState(h));
});
const contracts = {
  'lib/adminMutation.ts': 'b138e79251c22a6a14fa150edb899d61caa2c99cbe2d1ec1d6ccc2bedbf504fe',
  'app/api/admin/businesses/[businessId]/credentials/route.ts': 'cc8032177813ffbe1208469c732f32b973d5d83b2485318cf32386e641063df5',
};
const checkContract = (file, source) => assert.equal(createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex'), contracts[file], file);
test('V02 preserves exact approved administrator transaction and reset contracts', () => {
  for (const file of Object.keys(contracts)) checkContract(file, readFileSync(file, 'utf8'));
});
for (const [file, before, after] of [
  ['lib/adminMutation.ts', 'return prisma.$transaction(', 'return mutate('],
  ['app/api/admin/businesses/[businessId]/credentials/route.ts', 'await tx.session.deleteMany', 'await prisma.session.deleteMany'],
  ['app/api/admin/businesses/[businessId]/credentials/route.ts', 'await tx.verificationToken.updateMany', 'await prisma.verificationToken.updateMany'],
  ['app/api/admin/businesses/[businessId]/credentials/route.ts', 'await tx.auditLog.create', 'await prisma.auditLog.create'],
]) test('V02 rejects protected rollback contract mutation: ' + before, () => {
  const source = readFileSync(file, 'utf8'); assert.ok(source.includes(before));
  assert.throws(() => checkContract(file, source.replace(before, after)), { code: 'ERR_ASSERTION' });
});
