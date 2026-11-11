import assert from 'node:assert/strict';

/** Wrap only the callback's delegate; preserve the real transaction and options. */
export function installTransactionFault(db, model, method, inject) {
  const transaction = db.$transaction;
  const state = { transactions: 0, calls: 0, transactionLocal: false, errorCode: null };
  db.$transaction = (fn, options) => transaction.call(db, typeof fn === 'function' ? async tx => {
    state.transactions++;
    return fn(new Proxy(tx, { get(target, key) {
      if (key === model) return new Proxy(target[key], { get(delegate, operation) {
        if (operation === method) return async args => {
          state.calls++;
          state.transactionLocal = tx !== db;
          assert.equal(state.transactionLocal, true, 'Fault must reach a transaction-local delegate');
          try { return await inject(tx, args); }
          catch (error) { state.errorCode = error.code ?? null; throw error; }
        };
        return typeof delegate[operation] === 'function' ? delegate[operation].bind(delegate) : delegate[operation];
      } });
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } }));
  } : fn, options);
  return { state, restore() { db.$transaction = transaction; } };
}

export function assertFaultReached(state, expectedCode) {
  assert.ok(state.transactions > 0, 'Real transaction callback must be entered');
  assert.equal(state.calls, 1, 'Intended fault must be triggered exactly once');
  assert.equal(state.transactionLocal, true, 'Root-client injection is insufficient');
  assert.equal(state.errorCode, expectedCode, 'Expected native database failure must escape the delegate');
}

export function assertRollbackState(before, after) {
  assert.deepEqual(after, before, 'Failed mutation must leave all scoped state unchanged');
}

/** Entire scoped rows, including timestamps; no financial/security field exclusions. */
export async function captureRollbackState(db, { businessIds, managerIds, adminIds }) {
  const businesses = { in: businessIds }, managers = { in: managerIds }, admins = { in: adminIds };
  const financial = { payment: { businessId: businesses } };
  const rows = (tx, model, where) => tx[model].findMany({ where, orderBy: { id: 'asc' } });
  return db.$transaction(async tx => ({
    businesses: await rows(tx, 'business', { id: businesses }),
    managers: await rows(tx, 'manager', { id: managers }),
    admins: await rows(tx, 'adminAccess', { id: admins }),
    sessions: await rows(tx, 'session', { OR: [{ managerId: managers }, { adminAccessId: admins }] }),
    tokens: await rows(tx, 'verificationToken', { businessId: businesses }),
    audits: await rows(tx, 'auditLog', { OR: [{ businessId: businesses }, { actorId: admins }, { targetId: managers }] }),
    payments: await rows(tx, 'payment', { businessId: businesses }),
    refunds: await rows(tx, 'customerRefundObservation', financial),
    reconciliations: await rows(tx, 'directFinancialReconciliation', financial),
    notifications: await rows(tx, 'smsNotification', financial),
    receipts: await rows(tx, 'smsReceipt', financial),
  }), { isolationLevel: 'RepeatableRead' });
}
