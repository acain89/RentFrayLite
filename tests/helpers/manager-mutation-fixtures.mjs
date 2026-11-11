import assert from 'node:assert/strict';

export const bodylessDelete = (origin = 'https://example.test') => new Request('https://example.test/api', {
  method: 'DELETE', headers: origin === null ? {} : { origin },
});

/** Require the actual blocked backend, not an unrelated matching SQL statement. */
export function assertLockWaiter(rows, pattern, blockingPid) {
  const row = rows.find(row => pattern.test(row.query) &&
    (blockingPid === undefined || row.blockers?.includes(blockingPid)));
  assert.ok(row, 'Expected authority lock waiter and blocker');
  assert.ok(row.blockers?.length, 'Waiter must have a real blocking transaction');
  return row;
}

export function assertPendingMutation({ settled, before, current, auditBefore, auditCurrent }) {
  assert.equal(settled, false, 'Conflicting revocation must still be blocked');
  assert.deepEqual(current, before, 'Uncommitted mutation must not be visible');
  assert.equal(auditCurrent, auditBefore, 'Uncommitted audit must not be visible');
}

/** Real Request/ReadableStream; pulling happens only when the route reads.
 * Both missing reads and unreleased pauses fail boundedly, never auto-commit. */
export function pauseJsonRoute(run, method, bodyFactory, { timeoutMs = 15000 } = {}) {
  let enter, failEnter, release, controller, started = false, disposed = false;
  const entered = new Promise((yes, no) => { enter = yes; failEnter = no; });
  entered.catch(() => {}); // Observe early rejection without changing await semantics.
  const gate = new Promise(yes => { release = yes; });
  const stream = new ReadableStream({
    start(value) { controller = value; },
    async pull(value) {
      if (started || disposed) return;
      started = true;
      try {
        const body = await bodyFactory();
        enter();
        await gate;
        if (disposed) return;
        value.enqueue(new TextEncoder().encode(JSON.stringify(body)));
        value.close();
      } catch (error) { failEnter(error); if (!disposed) value.error(error); }
    },
    cancel() { disposed = true; release(); },
  }, { highWaterMark: 0 });
  const request = new Request('https://example.test/api', {
    method, headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: stream, duplex: 'half',
  });
  const dispose = (error = Error('Fixture body pause disposed')) => {
    if (disposed) return;
    disposed = true; failEnter(error); controller.error(error); release();
  };
  const timer = setTimeout(() => dispose(Error('Fixture body pause timed out')), timeoutMs);
  const result = Promise.resolve().then(() => run(request));
  result.then(() => {
    clearTimeout(timer);
    if (!started) dispose(Error('Route completed before reading fixture body'));
  }, error => { clearTimeout(timer); dispose(error); });
  return { entered, release, result, request, dispose };
}
