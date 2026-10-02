import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  const checkout = { id: "checkout-private", paymentId: "payment-private", businessId: "business-private", accountCode: "TEST" };
  const payment = {
    id: checkout.paymentId, businessId: checkout.businessId, stripeCheckoutSessionId: "cs_test_receipt",
    status, paymentMethod: method, itemDescription: "Monthly rent", referenceLabel: "Unit 101",
    subtotalCents: 100000, platformFeeCents: method === "ACH" ? 995 : 4900,
    totalChargedCents: method === "ACH" ? 100995 : 104900,
    lineItemsSnapshot: [{ type: "BASE", label: "Rent", amountCents: 100000 }, { type: "PLATFORM_FEE", label: "Platform service fee", amountCents: method === "ACH" ? 995 : 4900 }],
    business: { id: checkout.businessId, name: "Test Storage", accountCode: "TEST" },
    paidAt: new Date("2026-10-01T12:00:00Z"), pendingAt: new Date("2026-10-01T11:00:00Z"),
    smsReceipt: { status: "QUEUED" },
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
      checkoutSession: { findUnique: async ({ where }) => { reads++; return where.stripeCheckoutSessionId === payment.stripeCheckoutSessionId ? structuredClone(checkout) : null; } },
      payment: { findUnique: async ({ where }) => { reads++; return where.id === payment.id ? structuredClone(payment) : null; } },
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
    vm.runInThisContext("(function(require,module,exports,process){\n" + outputText + "\n})", { filename })(
      localRequire, loadedModule, loadedModule.exports,
      { env: { STRIPE_SECRET_KEY: "sk_test_receipt_fixture", NODE_ENV: "production" } },
    );
    return loadedModule.exports;
  }
  const access = load("lib/paymentResultAccess.ts");
  const page = load("app/payment/success/page.tsx");
  return {
    checkout, payment, jar, options, access, page,
    authorize: () => access.grantPaymentResultAccess(payment.stripeCheckoutSessionId, checkout.id),
    render: async (extra = {}) => renderToStaticMarkup(await page.default({
      searchParams: Promise.resolve({ session_id: payment.stripeCheckoutSessionId, accountCode: "TEST", ...extra }),
    })),
    reads: () => reads,
  };
}

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
  assert.ok(paid.includes("being prepared"));
  assert.equal(h.payment.smsReceipt.status, "QUEUED");
});

test("SMS delivery failure does not change confirmed payment status", async () => {
  const h = harness();
  await h.authorize();
  h.payment.smsReceipt.status = "FAILED";
  assert.ok((await h.render()).includes("could not be delivered"));
  assert.equal(h.payment.status, "PAID");
});
