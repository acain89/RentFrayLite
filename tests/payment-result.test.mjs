import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { format } from "node:util";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const enums = require("@prisma/client");

function harness(status = "PAID", method = "CARD") {
  const jar = new Map();
  const options = [];
  const logs = [], faults = new Map();
  const checkout = { id: "checkout-private", paymentId: "payment-private", businessId: "business-private", accountCode: "TEST" };
  const payment = {
    id: checkout.paymentId, businessId: checkout.businessId, stripeCheckoutSessionId: "cs_test_receipt",
    status, paymentMethod: method, itemDescription: "Monthly rent", referenceLabel: "Unit 101",
    subtotalCents: 100000, platformFeeCents: method === "ACH" ? 995 : 4900,
    totalChargedCents: method === "ACH" ? 100995 : 104900,
    lineItemsSnapshot: [{ type: "BASE", label: "Rent", amountCents: 100000 }, { type: "PLATFORM_FEE", label: "Platform service fee", amountCents: method === "ACH" ? 995 : 4900 }],
    business: { id: checkout.businessId, name: "Test Storage", accountCode: "TEST", propertyTimeZone: null },
    createdAt: new Date("2026-10-01T10:00:00Z"),
    paidAt: new Date("2026-10-01T12:00:00Z"), pendingAt: new Date("2026-10-01T11:00:00Z"),
    smsReceipt: { status: "QUEUED" },
    smsNotifications: [],
  };
  let reads = 0;
  // All write methods and external clients are absent: unexpected imports fail closed.
  const mocks = {
    "@prisma/client": enums,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "next/headers": { cookies: async () => ({
      set: (name, value, opts) => { jar.set(name, value); options.push(opts); },
      get: (name) => jar.has(name) ? { value: jar.get(name) } : undefined,
    }) },
    "@/lib/prisma": { prisma: {
      auditLog: { findMany: async () => { if (faults.has("dispute")) throw faults.get("dispute"); return payment.disputeStatus ? [{ metadata: { reportingDisputes: [{ id: "dp_private", status: payment.disputeStatus }] } }] : []; } },
      checkoutSession: { findUnique: async ({ where }) => { reads++; if (faults.has("checkout")) throw faults.get("checkout"); return where.stripeCheckoutSessionId === payment.stripeCheckoutSessionId ? structuredClone(checkout) : null; } },
      payment: { findUnique: async ({ where }) => { reads++; if (faults.has("payment")) throw faults.get("payment"); return where.id === payment.id ? structuredClone(payment) : null; } },
    } },
  };
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(root, relative);
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    });
    const loadedModule = { exports: {} };
    cache.set(relative, loadedModule.exports);
    const localRequire = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/lib/")) return load(name.slice(2) + ".ts");
      if (name === "node:crypto" || name === "react/jsx-runtime") return require(name);
      throw new Error("Unexpected test import: " + name);
    };
    // Synthetic local process object; the real environment is never changed.
    vm.runInThisContext("(function(require,module,exports,process,console){\n" + outputText + "\n})", { filename })(
      localRequire, loadedModule, loadedModule.exports,
      { env: { STRIPE_SECRET_KEY: "sk_test_receipt_fixture", NODE_ENV: "production" } },
      { error: (...args) => logs.push(args) },
    );
    return loadedModule.exports;
  }
  const access = load("lib/paymentResultAccess.ts");
  const page = load("app/payment/success/page.tsx");
  return {
    checkout, payment, jar, options, access, page, logs, faults,
    authorize: () => access.grantPaymentResultAccess(payment.stripeCheckoutSessionId, checkout.id),
    render: async (extra = {}) => renderToStaticMarkup(await page.default({
      searchParams: Promise.resolve({ session_id: payment.stripeCheckoutSessionId, accountCode: "TEST", ...extra }),
    })),
    reads: () => reads,
  };
}

for (const full of [true, false]) test("result page preserves original charge and shows " + (full ? "full" : "partial") + " refund", async () => {
  const h = harness(); h.payment.customerRefunds = [{ stripeRefundId: "re_private", currency: "usd", status: "succeeded", amountCents: full ? h.payment.totalChargedCents : 100 }];
  await h.authorize(); const html = await h.render();
  assert.ok(html.includes(full ? "Payment fully refunded" : "Payment partially refunded"));
  assert.ok(html.includes("Original payment amount")); assert.ok(!html.includes("Payment successful"));
  assert.ok(!html.includes("re_private"));
});
for (const [state, status, label] of [["under_review", "DISPUTED", "Dispute active"], ["won", "PAID", "Dispute closed won"], ["lost", "DISPUTED", "Dispute closed lost"]]) test("result page dispute " + state, async () => {
  const h = harness(status); h.payment.disputedAt = new Date(); h.payment.disputeStatus = state;
  await h.authorize(); const html = await h.render();
  assert.ok(html.includes(label)); assert.ok(!html.includes("dp_private"));
  assert.ok(!html.includes("This payment is under dispute."));
});

for (const [status, method, heading] of [
  ["PAID", "CARD", "Payment successful"], ["PENDING", "ACH", "Payment processing"],
  ["PAID", "ACH", "Payment successful"], ["FAILED", "CARD", "Payment unsuccessful"],
  ["RETURNED", "ACH", "Payment returned"], ["DISPUTED", "CARD", "Payment disputed"],
  ["EXPIRED", "CARD", "Checkout expired"], ["CREATED", "CARD", "Awaiting payment confirmation"],
  ["CHECKOUT_STARTED", "ACH", "Awaiting payment confirmation"],
]) {
  test("real result page: " + method + " " + status, async () => {
    const h = harness(status, method);
    await h.authorize();
    const html = await h.render({ status: "PAID", amount: "1", businessId: "attacker" });
    assert.ok(html.includes(heading));
    assert.ok(html.includes("Test Storage"));
    assert.ok(html.includes("Unit 101"));
    assert.ok(html.includes(method === "ACH" ? "$1,009.95" : "$1,049.00"));
    assert.equal(html.match(/Platform service fee/g)?.length, 1);
    assert.ok(html.includes('href="/TEST"'));
    assert.ok(!html.includes("payment-private") && !html.includes("checkout-private"));
    if (status !== "PAID") {
      assert.ok(!html.includes("Payment successful") && !html.includes("Total paid"));
      assert.ok(!html.includes("SMS receipt"));
    }
    if (status === "PENDING") assert.ok(html.includes("not yet confirmed as paid"));
  });
}

test("unknown, missing, array and unauthorized sessions cannot disclose a result", async () => {
  const h = harness();
  await assert.rejects(h.render(), /NOT_FOUND/);
  assert.equal(h.reads(), 0);
  await h.authorize();
  for (const extra of [{ session_id: "cs_unknown" }, { session_id: undefined }, { session_id: ["cs_test_receipt"] }, { accountCode: ["TEST"] }, { accountCode: "OTHER" }]) {
    await assert.rejects(h.render(extra), /NOT_FOUND/);
  }
});

for (const field of ["businessId", "stripeCheckoutSessionId", "businessAccount", "checkoutPayment", "checkoutId"]) {
  test("reject mismatched stored ownership: " + field, async () => {
    const h = harness();
    await h.authorize();
    if (field === "businessId") h.payment.businessId = "other";
    if (field === "stripeCheckoutSessionId") h.payment.stripeCheckoutSessionId = "cs_other";
    if (field === "businessAccount") h.payment.business.accountCode = "OTHER";
    if (field === "checkoutPayment") h.checkout.paymentId = "other";
    if (field === "checkoutId") h.checkout.id = "other";
    await assert.rejects(h.render(), /NOT_FOUND/);
  });
}

test("signed access is opaque, scoped, tamper resistant and supports multiple checkouts", async () => {
  const h = harness();
  await h.authorize();
  const token = [...h.jar.values()][0];
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.deepEqual(h.options[0], { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2592000 });
  assert.equal(h.access.verifyPaymentResultAccessToken(token, "cs_other", h.checkout.id), false);
  assert.equal(h.access.verifyPaymentResultAccessToken(token, h.payment.stripeCheckoutSessionId, "other"), false);
  h.jar.set([...h.jar.keys()][0], "0".repeat(64));
  await assert.rejects(h.render(), /NOT_FOUND/);
  await h.authorize();
  await h.access.grantPaymentResultAccess("cs_second", "checkout-second");
  assert.equal(h.jar.size, 2);
  assert.ok((await h.render()).includes("Payment successful"));
});

test("repeated real page loads only read stored state and never enqueue or send receipts", async () => {
  const h = harness("PENDING", "ACH");
  await h.authorize();
  const before = structuredClone(h.payment);
  const first = await h.render();
  for (let i = 0; i < 10; i++) assert.equal(await h.render(), first);
  assert.deepEqual(h.payment, before);
  h.payment.status = "PAID"; // Simulate an authoritative settlement, not a page transition.
  const paid = await h.render();
  assert.ok(paid.includes("Payment successful"));
  assert.ok(paid.includes("If you opted in"));
  assert.equal(h.payment.smsReceipt.status, "QUEUED");
});

test("legacy SMS failure is unknown and does not change confirmed payment status", async () => {
  const h = harness();
  await h.authorize();
  h.payment.smsReceipt.status = "FAILED";
  assert.ok((await h.render()).includes("delivery information is unavailable"));
  assert.equal(h.payment.status, "PAID");
});

for (const [status, text] of [
  ["QUEUED", "receipt is queued"], ["SENDING", "being submitted"],
  ["SENT", "Delivery is not yet confirmed"], ["DELIVERED", "confirmed delivery"],
  ["FAILED", "SMS receipt failed"], ["SUPPRESSED", "receipt is suppressed"],
  ["AMBIGUOUS", "will not be automatically resent"],
]) test("tenant result uses authoritative outbox " + status + " without changing payment", async () => {
  const h = harness(); await h.authorize();
  h.payment.smsReceipt.status = "SENT";
  h.payment.smsNotifications = [{ status, recipientType: "TENANT", reasonCode: null }];
  const before = structuredClone(h.payment), html = await h.render();
  assert.ok(html.includes(text)); assert.ok(html.includes("Payment successful"));
  assert.deepEqual(h.payment, before);
});

test("tenant result reflects later failed and delivered callbacks over a stale SENT receipt", async () => {
  const h = harness(); await h.authorize(); h.payment.smsReceipt.status = "SENT";
  const n = { status: "SENT", recipientType: "TENANT", reasonCode: null }; h.payment.smsNotifications = [n];
  assert.ok((await h.render()).includes("Delivery is not yet confirmed"));
  n.status = "FAILED"; assert.ok((await h.render()).includes("SMS receipt failed"));
  n.reasonCode = "OPTED_OUT"; assert.ok((await h.render()).includes("receipt is suppressed"));
  n.status = "DELIVERED"; n.reasonCode = null; assert.ok((await h.render()).includes("confirmed delivery"));
  assert.equal(h.payment.smsReceipt.status, "SENT"); assert.equal(h.payment.status, "PAID");
});

for (const [zone, instant, expected] of [
  ["America/Los_Angeles", "2026-03-08T09:30:00Z", "1:30:00 AM PST"],
  ["America/Los_Angeles", "2026-03-08T10:30:00Z", "3:30:00 AM PDT"],
  ["America/Los_Angeles", "2026-11-01T08:30:00Z", "1:30:00 AM PDT"],
  ["America/Los_Angeles", "2026-11-01T09:30:00Z", "1:30:00 AM PST"],
  ["Asia/Tokyo", "2026-12-31T15:30:00Z", "Jan 1, 2027"],
  [null, "2026-12-31T23:30:00Z", "UTC"],
]) test("result uses stored property timezone " + zone + " at " + instant, async () => {
  const h=harness();h.payment.business.propertyTimeZone=zone;h.payment.paidAt=new Date(instant);await h.authorize();
  const before=structuredClone(h.payment),html=await h.render({timeZone:"Pacific/Honolulu"});
  assert.ok(html.includes(expected));assert.ok(html.includes("Original payment confirmation"));assert.ok(html.includes("Original transaction date"));
  assert.ok(html.includes(h.payment.paidAt.toISOString()));assert.ok(!html.includes(">Updated<"));assert.ok(!html.includes(" Central"));
  if(zone===null)assert.ok(html.includes("UTC display compatibility"));else assert.ok(html.includes(zone));
  assert.deepEqual(h.payment,before);
});

for(const [status,field,label] of [["PENDING","pendingAt","Processing first recorded"],["FAILED","failedAt","Failure first recorded"],["RETURNED","returnedAt","Return first recorded"],["DISPUTED","disputedAt","Dispute first recorded"],["EXPIRED","expiredAt","Checkout expiry recorded"],["CHECKOUT_STARTED","checkoutStartedAt","Checkout start recorded"]])test("result accurately labels "+status+" recorded time",async()=>{
 const h=harness(status);h.payment[field]=new Date("2026-11-01T09:30:00Z");h.payment.business.propertyTimeZone="America/Los_Angeles";await h.authorize();const html=await h.render();assert.ok(html.includes(label));assert.ok(html.includes("1:30:00 AM PST"));assert.ok(html.includes(h.payment[field].toISOString()));
});

test("later refund/dispute observations never relabel or replace original confirmation time",async()=>{
 const h=harness();h.payment.business.propertyTimeZone="Asia/Tokyo";h.payment.customerRefunds=[{stripeRefundId:"re_private",currency:"usd",status:"succeeded",amountCents:100,observedAt:new Date("2026-12-31T23:00:00Z")}];h.payment.disputedAt=new Date("2026-11-05T12:00:00Z");h.payment.disputeStatus="won";await h.authorize();
 const before=structuredClone(h.payment),html=await h.render();assert.ok(html.includes("Payment partially refunded"));assert.ok(html.includes("Original payment confirmation"));assert.ok(html.includes(h.payment.paidAt.toISOString()));assert.ok(html.includes("not refund or dispute-resolution timestamps"));assert.ok(!html.includes("2026-12-31"));assert.deepEqual(h.payment,before);
});

test("invalid configured result timezone fails closed without changing payment facts",async()=>{
 const h=harness();h.payment.business.propertyTimeZone="invalid/zone";await h.authorize();const before=structuredClone(h.payment);await assert.rejects(()=>h.render(),/Invalid IANA/);assert.deepEqual(h.payment,before);
});


for (const boundary of ["checkout", "payment", "dispute"]) {
  for (const knownCode of [true, false]) test("result storage privacy: " + boundary + (knownCode ? " classified" : " unclassified"), async () => {
    const h = harness();
    if (boundary === "dispute") {
      h.payment.disputedAt = new Date("2026-10-02T12:00:00Z");
      h.payment.disputeStatus = "won";
    }
    await h.authorize();
    const before = structuredClone(h.payment);
    const markers = ["SYNTHETIC_RESULT_PRIVATE", "PRIVATE_CUSTOMER_PHONE", "PRIVATE_QUERY_ARGUMENTS"];
    const raw = Object.assign(new Error(markers.join(" ")), {
      code: knownCode ? "P1001" : markers[0],
      meta: { detail: markers[1] }, cause: new Error(markers[2]),
    });
    h.faults.set(boundary, raw);
    let safe;
    try { await h.render(); } catch (error) { safe = error; }
    assert.ok(safe);
    assert.notEqual(safe, raw);
    assert.equal(safe.message, "Payment result unavailable. Please try again.");
    for (const field of ["cause", "code", "meta"]) assert.equal(safe[field], undefined);
    assert.deepEqual(h.payment, before);
    assert.equal(h.logs.length, 1);
    assert.deepEqual(h.logs[0], ["RFL_OPERATION_FAILED", {
      operation: "payment_result_failed",
      category: knownCode ? "PRISMA_P1001" : "UNEXPECTED_ERROR",
      correlation: createHash("sha256").update(boundary === "checkout" ? h.payment.stripeCheckoutSessionId : h.payment.id).digest("hex"),
    }]);

    // Installed Next's actual RSC error handler and server logger must receive
    // only the replacement error. The packaged HTTP check verifies this too.
    const captured = [], original = console.error;
    try {
      console.error = (...args) => captured.push(format(...args));
      const { createReactServerErrorHandler } = require("next/dist/server/app-render/create-error-handler.js");
      const log = require("next/dist/build/output/log.js");
      assert.ok(createReactServerErrorHandler(false, false, new Map(), error => log.error(error))(safe));
    } finally { console.error = original; }
    assert.ok(captured.length);
    const output = JSON.stringify(h.logs) + captured.join("\n") + safe.stack;
    for (const marker of markers) assert.ok(!output.includes(marker), marker);
    assert.match(captured.join("\n"), /Payment result unavailable/);
    h.faults.clear();
    assert.match(await h.render(), boundary === "dispute" ? /Dispute closed won/ : /Payment successful/);
  });
}

test("result storage boundary leaves missing and invalid binding rejection unchanged without error logging", async () => {
  const h = harness();
  h.faults.set("payment", new Error("SYNTHETIC_RESULT_PRIVATE"));
  await assert.rejects(h.render(), /NOT_FOUND/);
  await h.authorize();
  h.jar.set([...h.jar.keys()][0], "0".repeat(64));
  await assert.rejects(h.render(), /NOT_FOUND/);
  assert.equal(h.logs.length, 0);
});
