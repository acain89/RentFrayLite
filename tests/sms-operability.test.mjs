import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const now = new Date("2026-11-06T12:00:00Z");
const secret = "SYNTHETIC_PRIVATE_CRON";
const markers = ["SYNTHETIC_PRIVATE_PHONE", "SYNTHETIC_PRIVATE_BODY", secret, "SYNTHETIC_PRIVATE_TOKEN"];
const rawError = code => Object.assign(new Error(markers.join(" ")), {
  code, meta: { detail: markers[0] }, cause: new Error(markers[3]),
});
const noPrivate = value => { for (const marker of markers) assert.ok(!JSON.stringify(value).includes(marker), marker); };
const row = (id, patch = {}) => ({ id, status: "QUEUED", reasonCode: null, recipientType: "TENANT",
  createdAt: new Date(now - 600000), nextAttemptAt: new Date(now - 1000),
  phone: markers[0], body: markers[1], callbackToken: markers[3], ...patch });

function fixture(input = [], cronSecret = secret) {
  const rows = new Map(input.map(r => [r.id, r])), logs = [], reads = [];
  let dispatches = 0, failure, transactionFailure, onGroup, attemptIds;
  class SmsCallbackInvalid extends Error {}
  const db = {
    smsNotification: { findUnique: async ({ where }) => rows.get(where.id) ?? null },
    $transaction: async (fn, options) => {
      if (transactionFailure) throw transactionFailure;
      assert.equal(options.isolationLevel, "RepeatableRead");
      const snapshot = structuredClone([...rows.values()]);
      return fn({ smsNotification: {
        groupBy: async args => {
          reads.push(args); assert.deepEqual(args.by, ["status", "reasonCode"]);
          const grouped = new Map();
          for (const r of snapshot) {
            const key = JSON.stringify([r.status, r.reasonCode]);
            const value = grouped.get(key) ?? { status: r.status, reasonCode: r.reasonCode, _count: { _all: 0 } };
            value._count._all++; grouped.set(key, value);
          }
          onGroup?.();
          return [...grouped.values()];
        },
        aggregate: async args => {
          reads.push(args);
          const due = snapshot.filter(r => r.status === args.where.status && r.nextAttemptAt <= args.where.nextAttemptAt.lte);
          return { _count: { _all: due.length }, _min: { createdAt: due.length ? new Date(Math.min(...due.map(r => +r.createdAt))) : null } };
        },
      } });
    },
  };
  const mocks = {
    "node:crypto": require("node:crypto"),
    "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    "@/lib/prisma": { prisma: db },
    "@/lib/smsReceipts": { processQueuedSmsReceipts: async limit => {
      assert.equal(limit, 20); dispatches++; if (failure) throw failure;
      return (attemptIds ?? [...rows.keys()]).flatMap(receiptId => [{ receiptId, status: "SKIPPED" }, { receiptId, status: "SKIPPED" }]);
    } },
    "@/lib/smsDelivery": { SmsCallbackInvalid,
      applySmsStatus: async () => { if (failure) throw failure; },
      applySmsOptOut: async () => { if (failure) throw failure; return "<Response/>"; } },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loadedModule = { exports: {} };
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/lib/")) return load(name.slice(2) + ".ts");
      throw Error("Forbidden import/provider: " + name);
    };
    vm.runInThisContext("(function(require,module,exports,process,console){\n" + compiled + "\n})", { filename: file })(
      localRequire, loadedModule, loadedModule.exports, { env: { CRON_SECRET: cronSecret } }, { error: (...args) => logs.push(args) });
    cache.set(file, loadedModule.exports); return loadedModule.exports;
  }
  return { rows, logs, reads, db, load, SmsCallbackInvalid,
    fail: e => { failure = e; }, failHealth: e => { transactionFailure = e; }, onGroup: fn => { onGroup = fn; },
    dispatches: () => dispatches, attempts: ids => { attemptIds = ids; },
    health: () => load("lib/smsDeliveryReporting.ts").loadSmsQueueHealth(db, now),
    request: (path = "/api/internal/sms/process", authorized = true) => new Request("https://example.test" + path, {
      method: "POST", headers: { ...(authorized ? { authorization: "Bearer " + secret } : {}), "x-rfl-correlation": markers[3] },
    }),
  };
}

test("empty queue has zero counts and unknown oldest age, without dispatch or provider imports", async () => {
  const f = fixture(), h = await f.health();
  assert.equal(h.eligibleQueuedCount, 0); assert.equal(h.oldestEligibleQueuedAt, null); assert.equal(h.oldestEligibleQueuedAgeSeconds, null);
  assert.ok(Object.values(h.counts).every(n => n === 0)); assert.equal(f.dispatches(), 0); assert.equal(f.reads.length, 2); noPrivate(h);
});

test("oldest eligible age uses original enqueue time, excludes future retries and includes due equality", async () => {
  const f = fixture([row("future", { createdAt: new Date(now - 86400000), nextAttemptAt: new Date(+now + 1) }),
    row("old", { createdAt: new Date(now - 7200000), nextAttemptAt: now }), row("new")]);
  const h = await f.health(); assert.equal(h.counts.QUEUED, 3); assert.equal(h.eligibleQueuedCount, 2);
  assert.equal(h.oldestEligibleQueuedAgeSeconds, 7200); assert.equal(h.oldestEligibleQueuedAt, new Date(now - 7200000).toISOString());
  assert.equal(h.asOf, now.toISOString()); noPrivate(h);
});

test("future-only backlog has no eligible age rather than a false zero", async () => {
  const f = fixture([row("future", { nextAttemptAt: new Date(+now + 60000) })]);
  const h = await f.health(); assert.equal(h.counts.QUEUED, 1); assert.equal(h.eligibleQueuedCount, 0); assert.equal(h.oldestEligibleQueuedAgeSeconds, null);
});

test("all durable states use the shared suppression and unknown projection", async () => {
  const states = ["QUEUED", "SENDING", "SENT", "DELIVERED", "FAILED", "SUPPRESSED", "AMBIGUOUS"];
  const f = fixture([...states.map(s => row(s, { status: s })), row("opted", { status: "FAILED", reasonCode: "OPTED_OUT" }), row("unknown", { status: "NEW_UNRECOGNIZED_STATE" })]);
  const h = await f.health(); for (const s of states) assert.equal(h.counts[s], s === "SUPPRESSED" ? 2 : 1);
  assert.equal(h.counts.UNKNOWN, 1); assert.equal(h.eligibleQueuedCount, 1); noPrivate(h);
});

test("large queue counts unique durable identities, never legacy aliases or repeated attempts", async () => {
  const input = Array.from({ length: 5000 }, (_, i) => row("n" + i));
  const f = fixture([...input, input[0], input[1]]), h = await f.health();
  assert.equal(h.counts.QUEUED, 5000); assert.equal(h.eligibleQueuedCount, 5000); assert.equal(f.reads.length, 2);
  assert.equal(f.dispatches(), 0); noPrivate(h);
});

test("clock skew cannot create negative queue age", async () => {
  const h = await fixture([row("future-created", { createdAt: new Date(+now + 1000) })]).health();
  assert.equal(h.oldestEligibleQueuedAgeSeconds, 0);
});

test("state counts and due age share one read snapshot during concurrent changes", async () => {
  const f = fixture([row("changing")]); f.onGroup(() => f.rows.set("changing", row("changing", { status: "AMBIGUOUS" })));
  const first = await f.health(); assert.equal(first.counts.QUEUED, 1); assert.equal(first.eligibleQueuedCount, 1);
  const second = await f.health(); assert.equal(second.counts.AMBIGUOUS, 1); assert.equal(second.eligibleQueuedCount, 0);
});

test("protected endpoint rejects missing/wrong secret before reads or dispatch", async () => {
  const f = fixture(), api = f.load("app/api/internal/sms/process/route.ts");
  for (const request of [f.request(undefined, false), new Request("https://example.test/api/internal/sms/process", { method: "POST", headers: { authorization: "Bearer wrong" } })]) {
    assert.equal((await api.POST(request)).status, 401);
  }
  assert.equal(f.dispatches(), 0); assert.equal(f.reads.length, 0); assert.equal(f.logs.length, 0);
});

test("worker keeps processed outcomes deduplicated and backlog separately counts unselected ambiguity", async () => {
  const f = fixture([row("sent", { status: "SENT" }), row("ambiguous", { status: "AMBIGUOUS" })]);
  f.attempts(["sent"]);
  const r = await f.load("app/api/internal/sms/process/route.ts").POST(f.request()), data = await r.json();
  assert.equal(r.status, 200); assert.equal(data.processed, 1); assert.equal(data.sent, 1); assert.equal(data.delivered, 0);
  assert.equal(data.ambiguous, 0); assert.equal(data.backlog.counts.AMBIGUOUS, 1); assert.equal(data.backlog.counts.SENT, 1);
  assert.equal(f.dispatches(), 1); noPrivate(data);
});

for (const [file, operation, status, path] of [
  ["app/api/internal/sms/process/route.ts", "sms_worker_failed", 500, "/api/internal/sms/process"],
  ["app/api/twilio/status/route.ts", "sms_status_callback_failed", 503, "/api/twilio/status?token=" + markers[3]],
  ["app/api/twilio/inbound/route.ts", "sms_inbound_callback_failed", 503, "/api/twilio/inbound"],
]) for (const code of ["P1001", "PRIVATE_UNKNOWN_CODE"]) test(operation + " " + code + " logs only safe category and matching server correlation", async () => {
  const f = fixture(); f.fail(rawError(code)); const r = await f.load(file).POST(f.request(path));
  assert.equal(r.status, status); const text = await r.text(); noPrivate(text);
  assert.equal(f.logs.length, 1); const [tag, diagnostic] = f.logs[0];
  assert.equal(tag, "RFL_OPERATION_FAILED"); assert.equal(diagnostic.operation, operation);
  assert.equal(diagnostic.category, code === "P1001" ? "PRISMA_P1001" : "UNEXPECTED_ERROR");
  assert.match(diagnostic.correlation, /^[a-f0-9]{64}$/); assert.equal(r.headers.get("x-rfl-correlation"), diagnostic.correlation);
  assert.notEqual(diagnostic.correlation, createHash("sha256").update(markers[3]).digest("hex"));
  assert.deepEqual(Object.keys(diagnostic).sort(), ["category", "correlation", "operation"]); noPrivate(f.logs);
  if (status === 503) { assert.equal(text, ""); assert.equal(f.dispatches(), 0); }
});

test("reporting outage after dispatch returns failure and never retries the dispatch internally", async () => {
  const f = fixture(); f.failHealth(rawError("P2024"));
  const r = await f.load("app/api/internal/sms/process/route.ts").POST(f.request());
  assert.equal(r.status, 500); assert.equal(f.dispatches(), 1); assert.equal(f.logs[0][1].category, "PRISMA_P2024"); noPrivate(f.logs); noPrivate(await r.text());
});

for (const route of ["status", "inbound"]) test(route + " invalid callback remains rejected without logging untrusted content", async () => {
  const f = fixture(); f.fail(new f.SmsCallbackInvalid(markers.join(" ")));
  const r = await f.load("app/api/twilio/" + route + "/route.ts").POST(f.request("/api/twilio/" + route));
  assert.equal(r.status, 403); assert.equal(await r.text(), ""); assert.equal(f.logs.length, 0); assert.equal(f.dispatches(), 0);
});

for (const route of ["status", "inbound"]) test(route + " valid callback response unchanged without provider operations", async () => {
  const f = fixture(), r = await f.load("app/api/twilio/" + route + "/route.ts").POST(f.request("/api/twilio/" + route));
  assert.equal(r.status, 200); assert.equal(await r.text(), route === "inbound" ? "<Response/>" : "");
  assert.equal(f.logs.length, 0); assert.equal(f.dispatches(), 0);
});

test("unconfigured worker secret rejects even a supplied Bearer credential", async () => {
  const f = fixture([], "");
  const r = await f.load("app/api/internal/sms/process/route.ts").POST(f.request());
  assert.equal(r.status, 401); assert.equal(f.dispatches(), 0); assert.equal(f.reads.length, 0); assert.equal(f.logs.length, 0);
});
