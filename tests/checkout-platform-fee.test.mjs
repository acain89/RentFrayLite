import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

// Load the real route and pricing code, replacing external services only.
// Unknown imports fail closed so this test cannot reach Prisma or Stripe.
function loadSource(relativePath, mocks, logger = console) {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const loadedModule = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/lib/")) {
      return loadSource(`${name.slice(2)}.ts`, mocks, logger);
    }
    throw new Error(`Unexpected test import: ${name}`);
  };
  vm.runInThisContext(`(function(require, module, exports, console, process) {\n${outputText}\n})`, {
    filename,
  })(localRequire, loadedModule, loadedModule.exports, logger, { env: { NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_fixture" } });
  return loadedModule.exports;
}

const enums = require("@prisma/client");
const { calculateCheckoutPricing } = loadSource("lib/checkoutPricing.ts", {});
const nextResponseMock = {
  NextResponse: { json: (body, options) => Response.json(body, options) },
};

async function prepareCheckout(paymentMethod, charges = []) {
  const plan = {
    id: "plan-test", name: "Rent", baseAmountCents: 100000,
    dueDay: 1, gracePeriodDays: 1, initialLateFeeCents: 0,
    dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0, isActive: true,
    charges: charges.map(charge => ({ isActive: true, ...charge })),
  };
  const business = {
    id: "business-test", name: "Test business", accountCode: "TE-1234", isActive: true, status: "ACTIVE", setupCompletedAt: new Date(),
    stripeConnection: { stripeAccountId: "acct_test", readyForLive: true },
    recurringPlans: [plan],
  };
  let checkout;
  const { POST } = loadSource("app/api/public/checkout/session/route.ts", {
    "@prisma/client": enums,
    "next/server": nextResponseMock,
    "@/lib/prisma": { prisma: {
      business: { findUnique: async () => structuredClone(business) },
      $queryRaw: async () => [],
      $transaction: async function (operation) { return operation(this); },
      checkoutSession: {
      create: async ({ data }) => {
        // Simulate persistence, including JSON serialization of the snapshot.
        checkout = {
          id: "checkout-test", paymentId: null, ...structuredClone(data),
          lineItems: JSON.parse(JSON.stringify(data.lineItems)),
        };
        return structuredClone(checkout);
      },
    } } },
    "@/lib/publicCheckout": {
      getPublicCheckoutBusiness: async () => business,
      isRecurringCheckoutBusiness: () => true,
    },
  });
  const response = await POST(new Request("https://example.test/api/public/checkout/session", {
    method: "POST", body: JSON.stringify({
      accountCode: "TE-1234", planId: plan.id, unitNumber: "101",
      firstName: "Test", lastName: "Payer", phone: "5555551234", paymentMethod,
    }),
  }));
  assert.equal(response.status, 201);
  const pricing = calculateCheckoutPricing({ plan, paymentMethod });
  assert.deepEqual(checkout.lineItems, pricing.lineItems);
  assert.equal(checkout.totalCents, pricing.totalChargedCents);
  // Simulate the existing review transition; no monetary fields change.
  checkout.status = enums.CheckoutSessionStatus.REVIEWED;
  return { checkout, business, pricing };
}

async function startCheckout(checkout, business, existingPayment = null) {
  const calls = { stripe: [], stripeClient: 0, paymentCreates: [], updates: [], errors: [], resultAccess: [] };
  const savedCheckout = structuredClone(checkout);
  let savedPayment = structuredClone(existingPayment);
  const prisma = {
    checkoutSession: {
      findUnique: async () => structuredClone(savedCheckout),
      update: async (args) => { calls.updates.push(args); Object.assign(savedCheckout, structuredClone(args.data)); return structuredClone(savedCheckout); },
      updateMany: async (args) => { calls.updates.push(args); Object.assign(savedCheckout, structuredClone(args.data)); return { count: 1 }; },
    },
    business: { findUnique: async () => structuredClone(business) },
    payment: {
      findUnique: async () => structuredClone(savedPayment),
      findFirst: async () => null,
      findMany: async () => existingPayment ? [structuredClone(existingPayment)] : [],
      create: async ({ data }) => {
        const payment = { id: "payment-test", paidAt: null, stripeCheckoutSessionId: null, ...structuredClone(data) };
        savedPayment = structuredClone(payment);
        calls.paymentCreates.push(payment);
        return payment;
      },
      update: async (args) => { calls.updates.push(args); Object.assign(savedPayment, structuredClone(args.data)); return structuredClone(savedPayment); },
      updateMany: async (args) => { calls.updates.push(args); Object.assign(savedPayment, structuredClone(args.data)); return { count: 1 }; },
    },
    $queryRaw: async () => [],
    $transaction: async (operations) => typeof operations === "function" ? operations(prisma) : Promise.all(operations),
  };
  const { POST } = loadSource("app/api/public/checkout/start/route.ts", {
    "@prisma/client": enums,
    "next/server": nextResponseMock,
    "@/lib/prisma": { prisma },
    "@/lib/paymentResultAccess": { grantPaymentResultAccess: async (...args) => { calls.resultAccess.push(args); } },
    "@/lib/stripe": { getStripeClient: () => {
      calls.stripeClient += 1;
      return { accounts: { retrieve: async (id) => ({ id: typeof id === "string" ? id : "acct_platform", country: "US",
        details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" }, requirements: {} }) },
        paymentMethodConfigurations: { list: async () => ({ has_more: false, data: [{ is_default: true, application: null, active: true, livemode: false, card: { available: true }, us_bank_account: { available: true } }] }) },
        checkout: { sessions: {
        create: async (params, options) => {
          calls.stripe.push({ params: structuredClone(params), options: structuredClone(options) });
          return { id: "cs_test", url: "https://example.test/checkout" };
        },
      } } };
    } },
  }, { error: (...args) => calls.errors.push(args) });
  const response = await POST(new Request("https://example.test/api/public/checkout/start", {
    method: "POST", body: JSON.stringify({ checkoutSessionId: checkout.id }),
  }));
  return { response, calls };
}

const methods = [
  { paymentMethod: enums.PaymentMethod.ACH, fee: 995, total: 100995, stripeMethod: "us_bank_account" },
  { paymentMethod: enums.PaymentMethod.CARD, fee: 4900, total: 104900, stripeMethod: "card" },
];

for (const { paymentMethod, fee, total, stripeMethod } of methods) {
  test(`$1,000 ${paymentMethod}: pricing → persisted session → start → Stripe reconciles exactly once`, async () => {
  const { checkout, business, pricing } = await prepareCheckout(paymentMethod);
  const { response, calls } = await startCheckout(checkout, business);
  assert.equal(response.status, 200);
  assert.equal(calls.stripe.length, 1);
  assert.equal(calls.paymentCreates.length, 1);
  assert.equal(calls.errors.length, 0);
  const storedPayment = calls.paymentCreates[0];
  const { params: stripeParams, options: stripeOptions } = calls.stripe[0];
  assert.equal(pricing.subtotalCents, 100000);
  assert.equal(checkout.platformFeeCents, fee);
  assert.equal(checkout.totalCents, total);
  assert.equal(storedPayment.platformFeeCents, fee);
  assert.equal(storedPayment.totalChargedCents, checkout.totalCents);
  assert.equal(storedPayment.businessProceedsCents, 100000);
  assert.deepEqual(storedPayment.lineItemsSnapshot, checkout.lineItems);
  assert.deepEqual(stripeParams.payment_method_types, [stripeMethod]);
  const stripeTotal = stripeParams.line_items.reduce(
    (sum, item) => sum + item.quantity * item.price_data.unit_amount, 0,
  );
  assert.equal(stripeTotal, total);
  assert.equal(stripeTotal, checkout.totalCents);
  assert.equal(stripeTotal, storedPayment.totalChargedCents);
  const platformFee = checkout.lineItems.filter((item) => item.type === "PLATFORM_FEE");
  assert.equal(platformFee.length, 1);
  assert.equal(stripeParams.line_items.filter((item) =>
    /platform.*fee/i.test(item.price_data.product_data.name)).length, 1);
  assert.equal(stripeParams.line_items.filter((item) =>
    item.price_data.product_data.name === platformFee[0].label).length, 1);
  assert.equal(stripeParams.payment_intent_data.application_fee_amount, fee);
  assert.equal(stripeTotal - stripeParams.payment_intent_data.application_fee_amount, 100000);
  assert.equal(stripeParams.payment_intent_data.transfer_data.destination, "acct_test");
  assert.equal(stripeOptions.idempotencyKey, `rfl-payment-${storedPayment.id}`);
  const successUrl = new URL(stripeParams.success_url);
  assert.equal(successUrl.pathname, "/payment/success");
  assert.equal(successUrl.searchParams.get("session_id"), "{CHECKOUT_SESSION_ID}");
  assert.equal(successUrl.searchParams.get("accountCode"), checkout.accountCode);
  assert.deepEqual(calls.resultAccess, [["cs_test", checkout.id]]);
  });

  const invalidCases = [
    ["empty snapshot", (c) => { c.lineItems = []; }],
    ["null snapshot", (c) => { c.lineItems = null; }],
    ["missing snapshot", (c) => { delete c.lineItems; }],
    ["non-array snapshot", (c) => { c.lineItems = {}; }],
    ["base-only snapshot", (c) => { c.lineItems = c.lineItems.filter(i => i.type !== "PLATFORM_FEE"); }],
    ["entirely rejected items", (c) => { c.lineItems = [null, "invalid", {}]; }],
    ["malformed item alongside otherwise reconciled items", (c) => { c.lineItems.push(null); }],
    ["blank fee label", (c) => { c.lineItems.at(-1).label = " "; }],
    ["missing amount", (c) => { delete c.lineItems.at(-1).amountCents; }],
    ["string amount", (c) => { c.lineItems.at(-1).amountCents = String(fee); }],
    ["fractional cents that previously rounded to the correct fee", (c) => { c.lineItems.at(-1).amountCents += 0.4; }],
    ["legacy dollar amount instead of canonical cents", (c) => {
      const item = c.lineItems.at(-1); item.amount = fee / 100; delete item.amountCents;
    }],
    ["negative amount", (c) => { c.lineItems.at(-1).amountCents = -fee; }],
    ["nonfinite amount", (c) => { c.lineItems.at(-1).amountCents = Infinity; }],
    ["NaN amount", (c) => { c.lineItems.at(-1).amountCents = NaN; }],
    ["unsafe amount", (c) => { c.lineItems.at(-1).amountCents = Number.MAX_SAFE_INTEGER + 1; }],
    ["line-item sum below authoritative total", (c) => { c.totalCents += 1; }],
    ["line-item sum above authoritative total", (c) => { c.totalCents -= 1; }],
    ["duplicate platform fee", (c) => { c.lineItems.push(structuredClone(c.lineItems.at(-1))); }],
    ["invalid authoritative total", (c) => { c.totalCents = NaN; }],
    ["unsafe line-item sum", (c) => {
      c.lineItems = [{ label: "First", amountCents: Number.MAX_SAFE_INTEGER }, { label: "Second", amountCents: 1 }];
      c.totalCents = Number.MAX_SAFE_INTEGER;
    }],
  ];

  for (const [name, corrupt] of invalidCases) {
    test(`${paymentMethod} rejects ${name} before any Stripe call or payment write`, async () => {
      const { checkout, business } = await prepareCheckout(paymentMethod);
      corrupt(checkout);
      const before = structuredClone(checkout);
      const { response, calls } = await startCheckout(checkout, business);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        error: "Unable to open secure payment checkout. Please begin a new payment.",
      });
      assert.equal(calls.stripe.length, 0);
      assert.equal(calls.stripeClient, 0);
      assert.equal(calls.paymentCreates.length, 0);
      assert.equal(calls.updates.length, 0);
      assert.deepEqual(checkout, before);
      assert.equal(calls.errors.length, 1);
      assert.equal(calls.errors[0][0], "Checkout line-item reconciliation failed:");
      assert.deepEqual(Object.keys(calls.errors[0][1]).sort(), [
        "checkoutSessionId", "expectedTotalCents", "stripeLineItemsTotalCents",
      ]);
      assert.equal(calls.errors[0][1].checkoutSessionId, checkout.id);
    });
  }

  test(`${paymentMethod} preserves valid zero-value snapshot entries without synthesizing a charge`, async () => {
    const { checkout, business } = await prepareCheckout(paymentMethod, [{
      id: "zero-charge", label: "Zero charge", amountCents: 0,
      effectiveBillingCycle: null, endsAfterBillingCycle: null,
    }]);
    const { response, calls } = await startCheckout(checkout, business);
    assert.equal(response.status, 200);
    assert.equal(calls.stripe.length, 1);
    const params = calls.stripe[0].params;
    assert.equal(params.line_items.reduce((sum, i) => sum + i.quantity * i.price_data.unit_amount, 0), checkout.totalCents);
    assert.equal(params.line_items.length, 2);
    assert.deepEqual(calls.paymentCreates[0].lineItemsSnapshot, checkout.lineItems);
    assert.equal(checkout.lineItems.find(i => i.label === "Zero charge").amountCents, 0);
  });

  test(`${paymentMethod} rejects a mismatched snapshot for an existing unstarted payment`, async () => {
    const { checkout, business } = await prepareCheckout(paymentMethod);
    const payment = {
      id: "existing-payment", status: enums.PaymentStatus.CREATED,
      stripeCheckoutSessionId: null, totalChargedCents: checkout.totalCents,
    };
    checkout.paymentId = payment.id;
    checkout.totalCents += 1;
    const before = structuredClone(payment);
    const { response, calls } = await startCheckout(checkout, business, payment);
    assert.equal(response.status, 500);
    assert.equal(calls.stripe.length, 0);
    assert.equal(calls.stripeClient, 0);
    assert.equal(calls.paymentCreates.length, 0);
    assert.equal(calls.updates.length, 0);
    assert.deepEqual(payment, before);
  });
}
