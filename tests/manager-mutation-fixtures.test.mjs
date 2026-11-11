import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { authHarness } from './helpers/auth-harness.mjs';
import { bodylessDelete, pauseJsonRoute, assertLockWaiter, assertPendingMutation } from './helpers/manager-mutation-fixtures.mjs';

const businessWait = /Business.*FOR NO KEY UPDATE/s;
const waiter = { pid: 42, query: 'SELECT "id" FROM "Business" WHERE "id"=$1 FOR NO KEY UPDATE', blockers: [41] };
test('V01 lock observation requires the actual conflicting backend', () => {
  assert.equal(assertLockWaiter([waiter], businessWait, 41).pid, 42);
});
for (const [name, rows, pattern] of [
  ['missing waiter', [], businessWait],
  ['obsolete Manager waiter', [waiter], /UPDATE.*Manager/s],
  ['unrelated blocker', [{ ...waiter, blockers: [99] }], businessWait],
  ['no blocking transaction', [{ ...waiter, blockers: [] }], businessWait],
]) test('V01 rejects ' + name, () => assert.throws(() => assertLockWaiter(rows, pattern, 41), { code: 'ERR_ASSERTION' }));

const pending = { settled: false, before: [{ id: 'original', label: 'Original' }], current: [{ id: 'original', label: 'Original' }], auditBefore: 0, auditCurrent: 0 };
test('V01 pending serialization preserves uncommitted rows and audit', () => assertPendingMutation(pending));
for (const [name, change] of [
  ['early revocation completion', { settled: true }],
  ['visible uncommitted mutation', { current: [{ id: 'replacement', label: 'New charge' }] }],
  ['visible uncommitted audit', { auditCurrent: 1 }],
]) test('V01 detects ' + name, () => assert.throws(() => assertPendingMutation({ ...pending, ...change }), { code: 'ERR_ASSERTION' }));

async function deletionFixture(type) {
  const h = await authHarness();
  if (type) await h.issue(type);
  h.db.payment = { findFirst: async () => ({ id: 'retained-original-payment' }) };
  h.db.checkoutSession = { findFirst: async () => null };
  return h;
}
const businessState = async h => ({ businesses: await h.db.business.findMany(), audits: await h.db.auditLog.findMany() });
const remove = (h, request) => h.load('app/api/admin/businesses/[businessId]/route.ts').DELETE(request, { params: Promise.resolve({ businessId: h.businesses[0].id }) });
test('V01 valid DELETE is bodyless and retains financial history through deactivation', async () => {
  const h = await deletionFixture('ADMIN'), request = bodylessDelete();
  assert.equal(request.method, 'DELETE'); assert.equal(request.body, null);
  const response = await remove(h, request);
  assert.equal(response.status, 200); assert.equal((await response.json()).action, 'deactivated');
  assert.equal((await h.db.business.findUnique({ where: { id: h.businesses[0].id } })).isActive, false);
  assert.equal(await h.db.auditLog.count({ where: { action: 'BUSINESS_DEACTIVATED' } }), 1);
});
for (const type of [null, 'MANAGER']) test('V01 DELETE rejects ' + (type ?? 'anonymous') + ' authority without mutation', async () => {
  const h = await deletionFixture(type), before = await businessState(h);
  assert.equal((await remove(h, bodylessDelete())).status, 401);
  assert.deepEqual(await businessState(h), before);
});
for (const origin of ['https://foreign.invalid', null]) test('V01 DELETE rejects ' + (origin ?? 'missing') + ' origin without mutation', async () => {
  const h = await deletionFixture('ADMIN'), before = await businessState(h);
  assert.equal((await remove(h, bodylessDelete(origin))).status, 403);
  assert.deepEqual(await businessState(h), before);
});
test('V01 DELETE still rejects even an empty JSON object body', async () => {
  const h = await deletionFixture('ADMIN'), before = await businessState(h);
  const request = new Request('https://example.test/api', { method: 'DELETE', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await remove(h, request)).status, 400);
  assert.deepEqual(await businessState(h), before);
});

test('V01 streamed pause begins at the actual reader and releases valid JSON', async () => {
  const h = await authHarness(), { publicJson } = h.load('lib/publicJson.ts');
  let authorize, read = false, finished = false;
  const authority = new Promise(yes => { authorize = yes; });
  const pause = pauseJsonRoute(async request => { await authority; return publicJson(request, 64); }, 'POST', async () => { read = true; return { synthetic: true }; });
  pause.result.then(() => { finished = true; });
  try {
    await new Promise(yes => setTimeout(yes, 10)); assert.equal(read, false);
    authorize(); await pause.entered; assert.equal(read, true); assert.equal(finished, false);
    pause.release(); assert.deepEqual(await pause.result, { synthetic: true });
  } finally { pause.dispose(); }
});
test('V01 early route rejection fails the pause instead of hanging', async () => {
  const pause = pauseJsonRoute(async () => new Response(null, { status: 401 }), 'POST', async () => ({}));
  await assert.rejects(pause.entered, /before reading/); assert.equal((await pause.result).status, 401);
  pause.dispose();
});
test('V01 unreleased body pause fails closed with a bounded timeout', async () => {
  const h = await authHarness(), { publicJson } = h.load('lib/publicJson.ts');
  const pause = pauseJsonRoute(request => publicJson(request, 64), 'POST', async () => ({}), { timeoutMs: 30 });
  const result = assert.rejects(pause.result, error => error.status === 400);
  await pause.entered; await result; pause.dispose();
});
function streamed(bytes, headers = {}) {
  const chunks = Array.isArray(bytes) ? bytes : [typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes];
  return new Request('https://example.test/api', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json', ...headers },
    body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }), duplex: 'half' });
}
for (const [name, body, headers, status] of [
  ['malformed JSON', '{', {}, 400],
  ['array payload', '[]', {}, 400],
  ['null payload', 'null', {}, 400],
  ['invalid UTF-8', new Uint8Array([255]), {}, 400],
  ['incorrect media type', '{}', { 'content-type': 'text/plain' }, 415],
  ['mismatched length', '{}', { 'content-length': '1' }, 400],
  ['oversized declared length', '{}', { 'content-length': '65' }, 413],
  ['oversized chunked stream', [new Uint8Array(40), new Uint8Array(40)], {}, 413],
]) test('V01 streamed reader rejects ' + name, async () => {
  const h = await authHarness(), { publicJson } = h.load('lib/publicJson.ts');
  await assert.rejects(() => publicJson(streamed(body, headers), 64), error => error.status === status);
});
for (const [file, method] of [['app/api/setup/account-code/route.ts', 'POST'], ['app/api/manager/security/route.ts', 'PATCH']]) test('V01 streamed route preserves origin admission: ' + file, async () => {
  const h = await authHarness('isolated', undefined, { '@/lib/stripe': { getStripeClient: () => { throw Error('Unexpected provider access'); } } }); await h.issue();
  const before = await businessState(h);
  const request = new Request('https://example.test/api', { method, headers: { origin: 'https://foreign.invalid', 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await h.load(file)[method](request)).status, 403);
  assert.deepEqual(await businessState(h), before);
});

// Exact current contracts; synthetic mutations never touch/evaluate application files.
const contracts = {
  'lib/adminMutation.ts': 'b138e79251c22a6a14fa150edb899d61caa2c99cbe2d1ec1d6ccc2bedbf504fe',
  'lib/managerMutation.ts': '7ad15222829d23f0bac0ddea4931792a02fc00c695bec250f687f0b054931247',
  'lib/publicJson.ts': '24c016722a58a5e3b7963e3af7f3249898fe498b4453b73cd477d69728bbebe1',
  'app/api/admin/businesses/[businessId]/route.ts': 'e316bbae6cc1f9523b723bb7de63167b418de5d0bf3ab8e645b00839d8dac609',
};
const checkContract = (file, source) => assert.equal(createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex'), contracts[file], file);
test('V01 protects complete current locking, parser and deletion contracts', () => {
  for (const file of Object.keys(contracts)) checkContract(file, readFileSync(file, 'utf8'));
});
for (const [file, before, after] of [
  ['lib/adminMutation.ts', 'FROM "Business"', 'FROM "Manager"'],
  ['lib/managerMutation.ts', 'FOR NO KEY UPDATE', 'FOR KEY SHARE'],
  ['lib/publicJson.ts', 'if (size > maximumBytes)', 'if (false)'],
  ['app/api/admin/businesses/[businessId]/route.ts', 'if (request.body)', 'if (false)'],
]) test('V01 rejects unexpected protected source changes: ' + file, () => {
  const source = readFileSync(file, 'utf8'); assert.ok(source.includes(before));
  assert.throws(() => checkContract(file, source.replace(before, after)), { code: 'ERR_ASSERTION' });
});
