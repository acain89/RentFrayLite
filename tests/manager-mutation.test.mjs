import assert from 'node:assert/strict';
import test from 'node:test';
import { authHarness, postgres } from './helpers/auth-harness.mjs';

const pgTest = (name, fn) => test('PostgreSQL mutation authority: ' + name, { skip: !postgres }, fn);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const billing = id => ({ sameRulesForAll: true, rules: [{ recurringPlanId: id, dueDay: 2, gracePeriodDays: 1, initialLateFeeCents: 100, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0 }], advance: true });
const charges = id => ({ tiers: [{ recurringPlanId: id, charges: [{ id: null, clientKey: 'new', sharedChargeGroupId: null, label: 'New charge', amountCents: 100, applyToAllTiers: false }] }], advance: true });

async function fixture() {
  const hooks = {};
  const wrapTx = tx => new Proxy(tx, { get(target, key) {
    if (typeof target[key] !== 'object' || !target[key]) return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    return new Proxy(target[key], { get(model, method) { return async (...args) => {
      await hooks.before?.(String(key), String(method), args);
      const value = await model[method](...args);
      await hooks.after?.(String(key), String(method), args, value);
      return value;
    }; } });
  } });
  const db = new Proxy(postgres, { get(target, key) {
    if (key === '$transaction') return (fn, options) => target.$transaction(typeof fn === 'function' ? tx => fn(wrapTx(tx)) : fn, options);
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  const account = id => ({ id, country: 'US', details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: 'active' }, requirements: {} });
  const providerCalls = { accounts: 0, links: 0 };
  const stripe = { accounts: { create: async () => { providerCalls.accounts++; return { id: 'acct_mutation_' + crypto.randomUUID().replaceAll('-', '') }; }, retrieve: async id => account(typeof id === 'string' ? id : 'acct_platform') },
    accountLinks: { create: async () => { providerCalls.links++; return { url: 'https://example.test/onboarding' }; } },
    paymentMethodConfigurations: { list: async () => ({ has_more: false, data: [{ active: true, application: null, is_default: true, livemode: true, card: { available: true }, us_bank_account: { available: true } }] }) } };
  const h = await authHarness('postgres', db, { '@/lib/stripe': { getStripeClient: () => stripe } }, { NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_mutation_fixture_no_network' });
  const manager = await h.issue(), second = await h.issue(), other = await h.issue('MANAGER', 1), admin = await h.issue('ADMIN'); h.use(manager);
  const plan = await postgres.recurringPlan.create({ data: { businessId: h.businesses[0].id, name: 'Rent', baseAmountCents: 100000, dueDay: 1, gracePeriodDays: 1 } });
  await postgres.recurringCharge.create({ data: { recurringPlanId: plan.id, label: 'Original', amountCents: 50 } });
  const snapshot = async () => ({
    business: await postgres.business.findUnique({ where: { id: h.businesses[0].id } }),
    connections: await postgres.stripeConnection.findMany({ where: { businessId: h.businesses[0].id } }),
    plans: await postgres.recurringPlan.findMany({ where: { businessId: h.businesses[0].id }, include: { charges: true }, orderBy: { id: 'asc' } }),
  });
  const save = request => h.load('app/api/setup/recurring/charges/route.ts').PUT(request ?? h.request(charges(plan.id)));
  const pauseBody = (route, method, body) => {
    const entered = deferred(), release = deferred();
    const result = h.load(route)[method]({ url: 'https://example.test/api', json: async () => { entered.resolve(); await release.promise; return body; } });
    return { entered: entered.promise, release: release.resolve, result };
  };
  const reset = async () => { h.use(admin); const r = await h.reset(); assert.equal(r.status, 200); return r; };
  // A retained CheckoutSession selects real B6 deactivation instead of deletion.
  const retain = () => postgres.checkoutSession.create({ data: { businessId: h.businesses[0].id, accountCode: 'AA-1111', planId: plan.id,
    unitNumber: '101', firstName: 'Test', lastName: 'Payer', phone: '5555551234', paymentMethod: 'ACH', billingCycle: '2026-10',
    baseAmountCents: 100000, recurringChargesCents: 0, initialLateFeeCents: 0, dailyLateFeesCents: 0, subtotalCents: 100000, platformFeeCents: 995, totalCents: 100995, dueDate: new Date(), graceEndsAt: new Date(),
    lineItems: [], expiresAt: new Date(Date.now() + 60000) } });
  const deactivate = async () => { h.use(admin); const r = await h.load('app/api/admin/businesses/[businessId]/route.ts').DELETE(h.request({}), { params: Promise.resolve({ businessId: h.businesses[0].id }) }); assert.equal(r.status, 200); assert.equal((await r.json()).action, 'deactivated'); };
  return { h, hooks, stripe, providerCalls, plan, manager, second, other, admin, snapshot, save, pauseBody, reset, retain, deactivate };
}
const chargeRoute = 'app/api/setup/recurring/charges/route.ts';
async function waitBlocked(pattern) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const rows = await postgres.$queryRawUnsafe("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
    if (rows.some(row => pattern.test(row.query))) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw Error('Expected PostgreSQL lock waiter did not appear');
}

pgTest('active save commits configuration and audit atomically', async () => {
  const f = await fixture(); await postgres.business.update({ where: { id: f.h.businesses[0].id }, data: { setupCompletedAt: null } });
  assert.equal((await f.save()).status, 200);
  assert.equal((await f.snapshot()).plans[0].charges[0].label, 'New charge');
  assert.equal(await postgres.auditLog.count({ where: { businessId: f.h.businesses[0].id, action: 'RECURRING_CHARGES_COMPLETED' } }), 1);
});
pgTest('reset before request rejects both sessions; unrelated manager and administrator survive', async () => {
  const f = await fixture(); const before = await f.snapshot(); await f.reset();
  for (const token of [f.manager, f.second]) { f.h.use(token); assert.equal((await f.save()).status, 401); }
  assert.deepEqual(await f.snapshot(), before);
  f.h.use(f.other); const authority = await f.h.session.getCurrentSession();
  await f.h.load('lib/managerMutation.ts').withManagerMutation(authority, tx => tx.business.update({ where: { id: f.h.businesses[1].id }, data: { ownerName: 'Still authorized' } }));
  f.h.use(f.admin); assert.ok(await f.h.session.getCurrentSession());
  assert.equal(await postgres.auditLog.count({ where: { businessId: f.h.businesses[0].id, action: 'MANAGER_CREDENTIALS_UPDATED' } }), 1);
});
for (const kind of ['reset', 'inactive manager', 'inactive business', 'disabled business', 'missing manager', 'manager relationship', 'session relationship', 'deleted session', 'expired session']) {
  pgTest(kind + ' after initial authorization prevents charge mutation', async () => {
    const f = await fixture(); const pending = f.pauseBody(chargeRoute, 'PUT', charges(f.plan.id)); await pending.entered;
    if (kind === 'reset') await f.reset();
    if (kind === 'inactive manager') await postgres.manager.update({ where: { id: f.h.managers[0].id }, data: { isActive: false } });
    if (kind === 'inactive business' || kind === 'disabled business') await postgres.business.update({ where: { id: f.h.businesses[0].id }, data: kind === 'inactive business' ? { isActive: false } : { status: 'DISABLED' } });
    if (kind === 'missing manager') await postgres.manager.delete({ where: { id: f.h.managers[0].id } });
    if (kind === 'manager relationship') {
      const b = await postgres.business.create({ data: { name: 'Third', ownerName: 'Test', contactEmail: 'third@example.test' } });
      await postgres.manager.update({ where: { id: f.h.managers[0].id }, data: { businessId: b.id } });
    }
    if (kind === 'session relationship') await postgres.session.updateMany({ where: { managerId: f.h.managers[0].id }, data: { businessId: f.h.businesses[1].id } });
    if (kind === 'deleted session') await postgres.session.deleteMany({ where: { managerId: f.h.managers[0].id } });
    if (kind === 'expired session') await postgres.session.updateMany({ where: { managerId: f.h.managers[0].id }, data: { expiresAt: new Date(0) } });
    const before = await f.snapshot(); const auditCount = await postgres.auditLog.count({ where: { businessId: f.h.businesses[0].id } });
    pending.release(); assert.equal((await pending.result).status, 401);
    assert.deepEqual(await f.snapshot(), before); assert.equal(await postgres.auditLog.count({ where: { businessId: f.h.businesses[0].id } }), auditCount);
  });
}
for (const operation of ['reset', 'deactivation']) {
  pgTest(operation + ' commits before delayed save', async () => {
    const f = await fixture(); if (operation === 'deactivation') await f.retain();
    const p = f.pauseBody(chargeRoute, 'PUT', charges(f.plan.id)); await p.entered;
    await (operation === 'reset' ? f.reset() : f.deactivate()); const before = await f.snapshot();
    p.release(); assert.equal((await p.result).status, 401); assert.deepEqual(await f.snapshot(), before);
  });
  pgTest('save holds authority first; ' + operation + ' waits until commit', async () => {
    const f = await fixture(); if (operation === 'deactivation') await f.retain();
    const entered = deferred(), release = deferred();
    f.hooks.before = async (model, method) => { if (model === 'recurringCharge' && method === 'deleteMany') { entered.resolve(); await release.promise; } };
    const save = f.save(); await entered.promise;
    const revoke = operation === 'reset' ? f.reset() : f.deactivate();
    try { await waitBlocked(operation === 'reset' ? /UPDATE.*Manager/s : /Business.*FOR NO KEY UPDATE/s); } finally { release.resolve(); }
    assert.equal((await save).status, 200); await revoke;
    assert.equal((await f.snapshot()).plans[0].charges[0].label, 'New charge');
    assert.equal(await postgres.session.count({ where: { managerId: f.h.managers[0].id } }), 0);
    f.h.use(f.manager); assert.equal((await f.save()).status, 401);
  });
}
for (const failure of ['mutation', 'audit']) pgTest(failure + ' failure rolls back deleted/recreated charges', async () => {
  const f = await fixture(); await postgres.business.update({ where: { id: f.h.businesses[0].id }, data: { setupCompletedAt: null } }); const before = await f.snapshot();
  f.hooks.before = async (model, method) => { if ((failure === 'mutation' && model === 'recurringCharge' && method === 'create') || (failure === 'audit' && model === 'auditLog' && method === 'create')) throw Error('Injected transaction failure'); };
  assert.equal((await f.save()).status, 500); assert.deepEqual(await f.snapshot(), before);
  assert.equal(await postgres.auditLog.count({ where: { businessId: f.h.businesses[0].id } }), 0);
});
pgTest('expiry during transaction rolls back the completed mutation', async () => {
  const f = await fixture(); const until = new Date(Date.now() + 1500);
  await postgres.session.updateMany({ where: { managerId: f.h.managers[0].id }, data: { expiresAt: until } });
  const before = await f.snapshot();
  f.hooks.after = async (model, method) => { if (model === 'recurringCharge' && method === 'create') await postgres.$executeRawUnsafe('SELECT pg_sleep(2)'); };
  assert.equal((await f.save()).status, 401); assert.deepEqual(await f.snapshot(), before);
});
for (const name of ['tiers', 'billing', 'account-code', 'security']) pgTest(name + ' delayed request cannot commit after credential reset', async () => {
  const f = await fixture();
  if (name === 'account-code') await postgres.stripeConnection.create({ data: { businessId: f.h.businesses[0].id, stripeAccountId: 'acct_' + f.plan.id } });
  const route = name === 'security' ? 'app/api/manager/security/route.ts' : name === 'account-code' ? 'app/api/setup/account-code/route.ts' : `app/api/setup/recurring/${name}/route.ts`;
  const body = name === 'tiers' ? { tiers: [{ id: f.plan.id, clientKey: 'rent', name: 'Changed', amountCents: 110000 }] } : name === 'billing' ? billing(f.plan.id) : name === 'account-code' ? { accountCode: 'ZZ-1234' } : { action: 'PASSWORD', currentPassword: 'old-password', newPassword: 'changed-password', confirmPassword: 'changed-password' };
  const p = f.pauseBody(route, name === 'security' ? 'PATCH' : name === 'account-code' ? 'POST' : 'PUT', body); await p.entered; await f.reset(); const before = await f.snapshot();
  p.release(); assert.equal((await p.result).status, 401); assert.deepEqual(await f.snapshot(), before);
});
// Review has no body and provider refresh has no HTTP route: pause their genuine
// read boundaries after session authentication, without substituting authority.
for (const name of ['review', 'connect', 'onboard', 'sync']) pgTest(name + ' rechecks persisted authority before protected effect', async () => {
  const f = await fixture();
  if (name === 'onboard' || name === 'sync') await postgres.stripeConnection.create({ data: { businessId: f.h.businesses[0].id, stripeAccountId: 'acct_' + f.plan.id } });
  const identity = await f.h.session.getCurrentSession();
  const entered = deferred(), release = deferred(); let once = false;
  // Root read pause occurs before mutation transaction; the SQL client is real.
  const rootModel = name === 'review' ? 'business' : 'stripeConnection';
  const db = new Proxy(postgres, { get(target, key) {
    if (key === rootModel) return new Proxy(target[key], { get(model, method) { return async (...args) => { const result = await model[method](...args); if (method === 'findUnique' && !once) { once = true; entered.resolve(); await release.promise; } return result; }; } });
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  // Fresh route loader uses the same real persisted sessions and cookies.
  const g = await authHarness('postgres', db, { '@/lib/stripe': { getStripeClient: () => f.stripe } }, { NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_mutation_fixture_no_network' }); g.use(f.manager);
  let action;
  if (name === 'review') action = g.load('app/api/setup/recurring/review/route.ts').POST();
  if (name === 'onboard') action = g.load('app/api/stripe/onboard/route.ts').GET({ url: 'https://example.test/api' });
  if (name === 'sync') {
    f.stripe.accounts.retrieve = async id => { entered.resolve(); await release.promise; return { id, country: 'US', details_submitted: true, payouts_enabled: true, charges_enabled: true, capabilities: { transfers: 'active' }, requirements: {} }; };
    action = g.load('lib/stripeConnection.ts').syncStripeConnection(identity.businessId, 'acct_' + f.plan.id, identity);
    // Install rejection observation before releasing its boundary.
    action = assert.rejects(action, /Authentication required/);
  }
  if (name === 'connect') {
    // Hold the Business lock externally so the actual guard must wait; reset's
    // audit KEY SHARE can still commit, proving the selected lock compatibility.
    const held = deferred(), unlock = deferred();
    const lock = postgres.$transaction(async tx => { await tx.$queryRawUnsafe('SELECT "id" FROM "Business" WHERE "id"=$1 FOR NO KEY UPDATE', identity.businessId); held.resolve(); await unlock.promise; }, { timeout: 15000 });
    await held.promise; action = g.load('app/api/stripe/connect/route.ts').POST({ url: 'https://example.test/api' });
    try { await waitBlocked(/Business.*FOR NO KEY UPDATE/s); await f.reset(); } finally { unlock.resolve(); } await lock;
    assert.equal((await action).status, 401); assert.equal(await postgres.stripeConnection.count({ where: { businessId: identity.businessId } }), 0); assert.deepEqual(f.providerCalls, { accounts: 0, links: 0 }); return;
  }
  await entered.promise; await f.reset(); const before = await f.snapshot(); release.resolve();
  if (name === 'sync') await action;
  else { const response = await action; assert.equal(response.status, name === 'onboard' ? 307 : 401); if (name === 'onboard') { assert.match(response.headers.get('location'), /login\/manager/); assert.equal(f.providerCalls.links, 0); } }
  assert.deepEqual(await f.snapshot(), before);
});
for (const operation of ['reset', 'deactivation']) pgTest(operation + ' repeated real concurrent interleavings (20)', async () => {
  for (let n = 0; n < 20; n++) {
    const f = await fixture(); if (operation === 'deactivation') await f.retain();
    const pending = f.pauseBody(chargeRoute, 'PUT', charges(f.plan.id)); await pending.entered;
    pending.release();
    const write = pending.result.then(response => { assert.ok([200, 401].includes(response.status)); return response.status === 200 ? 'committed' : 'rejected'; });
    const revoke = operation === 'reset' ? f.reset() : f.deactivate(); const [outcome] = await Promise.all([write, revoke]);
    const rows = await postgres.recurringCharge.findMany({ where: { recurringPlanId: f.plan.id } });
    assert.equal(rows.length, 1); assert.equal(rows[0].label, outcome === 'committed' ? 'New charge' : 'Original');
    f.h.use(f.manager); assert.equal((await f.save()).status, 401);
  }
});

test('shared mutation guard also rechecks isolated persisted authority', async () => {
  const h = await authHarness(); await h.issue(); const identity = await h.session.getCurrentSession();
  await h.db.session.deleteMany({ where: { id: identity.id } });
  const before = await h.db.business.findUnique({ where: { id: identity.businessId } });
  await assert.rejects(() => h.load('lib/managerMutation.ts').withManagerMutation(identity, tx => tx.business.update({ where: { id: identity.businessId }, data: { name: 'Unauthorized' } })), /Authentication required/);
  assert.deepEqual(await h.db.business.findUnique({ where: { id: identity.businessId } }), before);
});

for (const action of ['PASSWORD', 'EMAIL']) pgTest('security ' + action + ' cannot commit with deleted in-flight session', async () => {
  const f = await fixture();
  const p = f.pauseBody('app/api/manager/security/route.ts', 'PATCH', action === 'PASSWORD' ? { action, currentPassword: 'old-password', newPassword: 'changed-password', confirmPassword: 'changed-password' } : { action, currentPassword: 'old-password', newEmail: 'changed-' + f.plan.id + '@example.test' });
  await p.entered; await postgres.session.deleteMany({ where: { managerId: f.h.managers[0].id } });
  const before = await postgres.manager.findUnique({ where: { id: f.h.managers[0].id } });
  p.release(); assert.equal((await p.result).status, 401);
  assert.deepEqual(await postgres.manager.findUnique({ where: { id: before.id } }), before);
  assert.equal(await postgres.auditLog.count({ where: { businessId: f.h.businesses[0].id } }), 0);
});
pgTest('active Connect creation and onboarding keep local connection and audit', async () => {
  const f = await fixture(); const response = await f.h.load('app/api/stripe/connect/route.ts').POST({ url: 'https://example.test/api' });
  assert.equal(response.status, 200); assert.equal((await response.json()).redirectTo, 'https://example.test/onboarding');
  assert.equal(await postgres.stripeConnection.count({ where: { businessId: f.h.businesses[0].id } }), 1);
  assert.equal(await postgres.auditLog.count({ where: { businessId: f.h.businesses[0].id, action: 'STRIPE_ACCOUNT_CREATED' } }), 1);
});

pgTest('reset queued on Manager first beats a mutation holding Business without lock inversion', async () => {
  const f = await fixture(), held = deferred(), release = deferred();
  const holder = postgres.$transaction(async tx => { await tx.$queryRawUnsafe('SELECT "id" FROM "Manager" WHERE "id"=$1 FOR UPDATE', f.h.managers[0].id); held.resolve(); await release.promise; }, { timeout: 15000 });
  await held.promise; const reset = f.reset(); await waitBlocked(/UPDATE.*Manager/s);
  f.h.use(f.manager); const save = f.save();
  try { await waitBlocked(/Manager.*FOR NO KEY UPDATE/s); } finally { release.resolve(); }
  await holder; await reset; assert.equal((await save).status, 401);
  assert.equal((await f.snapshot()).plans[0].charges[0].label, 'Original');
});

pgTest('onboarding-link failure retains committed account and retry reuses it', async () => {
  const f = await fixture(), original = f.stripe.accountLinks.create;
  f.stripe.accountLinks.create = async () => { throw Error('Injected link failure'); };
  const route = f.h.load('app/api/stripe/connect/route.ts');
  assert.equal((await route.POST({ url: 'https://example.test/api' })).status, 500);
  const before = await postgres.stripeConnection.findUnique({ where: { businessId: f.h.businesses[0].id } });
  assert.ok(before); assert.equal(f.providerCalls.accounts, 1);
  f.stripe.accountLinks.create = original;
  assert.equal((await route.POST({ url: 'https://example.test/api' })).status, 200);
  assert.equal((await postgres.stripeConnection.findUnique({ where: { businessId: before.businessId } })).stripeAccountId, before.stripeAccountId);
  assert.equal(f.providerCalls.accounts, 1);
  assert.equal(await postgres.auditLog.count({ where: { businessId: before.businessId, action: 'STRIPE_ACCOUNT_CREATED' } }), 1);
});
