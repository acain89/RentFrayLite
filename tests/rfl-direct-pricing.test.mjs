import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = readFileSync(path.join(root, "lib/rflDirectPricing.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const loaded = { exports: {} };
// No provider/database/financial mocks: any dependency import fails the test.
vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`)(
  name => { throw new Error(`Inactive pricing must have no imports: ${name}`); }, loaded, loaded.exports,
);
const { priceRflDirectV1: price, planManagementNetReconciliation: plan,
  roundPlanningPercentageCents: round, RFL_DIRECT_PRICING_VERSION: version,
  PLANNING_PERCENTAGE_ROUNDING: rounding } = loaded.exports;
const methods = ["ACH", "CARD"];
const quote = (owed, method) => price({ managementOwedCents: owed, paymentMethod: method });

function invariants(result) {
  assert.equal(result.pricingVersion, "RFL_DIRECT_V1");
  assert.equal(result.tenantTotalCents, result.managementOwedCents + result.tenantProcessingFeeCents);
  assert.equal(result.rflApplicationFeeCents, result.tenantProcessingFeeCents - result.expectedStripeProcessingFeeCents);
  assert.equal(result.expectedManagementNetCents, result.tenantTotalCents - result.expectedStripeProcessingFeeCents - result.rflApplicationFeeCents);
  assert.equal(result.expectedManagementNetCents, result.managementOwedCents);
  assert.ok(result.rflApplicationFeeCents >= 0);
  for (const [name, value] of Object.entries(result)) {
    if (name.endsWith("Cents") || name === "bandNumber") assert.ok(Number.isSafeInteger(value), name);
  }
}

for (const method of methods) {
  for (const owed of [0, -1, 99, 500001, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "100", null, undefined]) {
    test(`${method} explicitly rejects obligation ${String(owed)}`, () => assert.throws(() => quote(owed, method), RangeError));
  }
  for (let band = 1; band <= 200; band++) {
    const boundary = band * 2500;
    test(`${method} boundary ${boundary} cents: below, at, above`, () => {
      for (const offset of [-1, 0, 1]) {
        const owed = boundary + offset;
        if (owed > 500000) { assert.throws(() => quote(owed, method), RangeError); continue; }
        const result = quote(owed, method);
        const expectedBand = band + (offset === 1 ? 1 : 0);
        assert.equal(result.bandNumber, expectedBand);
        assert.equal(result.tenantProcessingFeeCents, method === "CARD"
          ? (expectedBand + 1) * 100 : Math.min(995, (expectedBand + 1) * 50));
        invariants(result);
      }
    });
  }
}

// Literal contract fixtures, independent of the implementation's fee calculation.
// owed, band, ACH tenant fee, card tenant fee, ACH processing, card processing.
const cases = [
  [100,1,100,200,2,39], [2500,1,100,200,21,108], [2501,2,150,300,21,111],
  [2600,2,150,300,22,114], [5000,2,150,300,41,184], [5001,3,200,400,42,187],
  [5100,3,200,400,42,190], [10000,4,250,500,82,335], [25000,10,550,1100,204,787],
  [45000,18,950,1900,368,1390], [45001,19,995,2000,368,1393], [45100,19,995,2000,369,1396],
  [62500,25,995,2600,500,1918], [62501,26,995,2700,500,1921], [62600,26,995,2700,500,1924],
  [100000,40,995,4100,500,3049], [200000,80,995,8100,500,6065], [500000,200,995,20100,500,15113],
];
for (const [owed, band, achFee, cardFee, achProcessing, cardProcessing] of cases) {
  for (const method of methods) test(`${method} named obligation ${owed} cents`, () => {
    const result = quote(owed, method);
    assert.equal(result.bandNumber, band);
    assert.equal(result.tenantProcessingFeeCents, method === "ACH" ? achFee : cardFee);
    assert.equal(result.expectedStripeProcessingFeeCents, method === "ACH" ? achProcessing : cardProcessing);
    invariants(result);
  });
}

for (const method of methods) test(`${method} every valid cent: fee progression, processing, cap and net invariant`, () => {
  let band = 1;
  let tenantFee = method === "ACH" ? 100 : 200;
  for (let owed = 100; owed <= 500000; owed++) {
    if (owed > band * 2500) { band++; tenantFee = method === "ACH" ? Math.min(995, tenantFee + 50) : tenantFee + 100; }
    const result = quote(owed, method);
    assert.equal(result.bandNumber, band);
    assert.equal(result.tenantProcessingFeeCents, tenantFee);
    // Independent remainder-based rounding oracle (not the production helper).
    const product = (owed + tenantFee) * (method === "ACH" ? 8 : 29);
    const rounded = Math.floor(product / 1000) + (product % 1000 >= 500 ? 1 : 0);
    assert.equal(result.expectedStripeProcessingFeeCents, method === "ACH" ? Math.min(500, rounded) : rounded + 30);
    if (method === "ACH") {
      assert.ok(tenantFee <= 995);
      if (owed >= 42501 && owed <= 45000) assert.equal(tenantFee, 950);
      if (owed >= 45001) assert.equal(tenantFee, 995);
    }
    invariants(result);
  }
});

test("central percentage policy rounds below/at/above ties upward and handles odd denominators", () => {
  assert.equal(rounding, "HALF_UP_NON_NEGATIVE");
  for (const [amount,numerator,denominator,expected] of [
    [0,29,1000,0], [499,1,1000,0], [500,1,1000,1], [501,1,1000,1],
    [1499,1,1000,1], [1500,1,1000,2], [4500,29,1000,131],
    [1,1,3,0], [2,1,3,1], [Number.MAX_SAFE_INTEGER,1,1,Number.MAX_SAFE_INTEGER],
  ]) assert.equal(round(amount,numerator,denominator),expected);
});
test("percentage policy rejects invalid values and output overflow", () => {
  for (const args of [[-1,1,1],[1,0.5,1],[1,1,0],[1,1,-1],[NaN,1,1],[1,Infinity,1],[1,1,1.5],
    [Number.MAX_SAFE_INTEGER,2,1]]) assert.throws(() => round(...args), RangeError);
});
test("ACH processing reaches its cap on tenant total, with cent rounding", () => {
  assert.equal(quote(61442,"ACH").expectedStripeProcessingFeeCents,499);
  assert.equal(quote(61443,"ACH").expectedStripeProcessingFeeCents,500);
  assert.equal(quote(61505,"ACH").expectedStripeProcessingFeeCents,500);
});
test("version and pricing output are stable, immutable, and leave inputs intact", () => {
  assert.equal(version,"RFL_DIRECT_V1");
  const input = Object.freeze({ managementOwedCents:100000, paymentMethod:"CARD" });
  const first = price(input);
  assert.deepEqual(first,price(input)); assert.ok(Object.isFrozen(first));
  assert.throws(() => { first.tenantTotalCents = 1; },TypeError);
  assert.deepEqual(input,{ managementOwedCents:100000, paymentMethod:"CARD" });
});
test("unknown payment methods cannot silently price as card", () => {
  for (const method of ["card","CASH","",null,undefined]) assert.throws(() => quote(100,method),TypeError);
});

const plans = [
  [100000,495,"NONE",0,0,0,0],
  [99999,495,"APPLICATION_FEE_REFUND_REQUIRED",1,1,0,0],
  [99505,495,"APPLICATION_FEE_REFUND_REQUIRED",495,495,0,0],
  [99504,495,"FINANCIAL_EXCEPTION",496,495,1,0],
  [99999,0,"FINANCIAL_EXCEPTION",1,0,1,0],
  [100001,495,"NONE",0,0,0,1],
  [105000,495,"NONE",0,0,0,5000],
  [-100,495,"FINANCIAL_EXCEPTION",100100,495,99605,0],
];
for (const [actual,remaining,action,shortfall,refund,unresolved,overage] of plans) {
  test(`pure reconciliation: actual ${actual}, remaining fee ${remaining}`, () => {
    const input = Object.freeze({managementOwedCents:100000,actualManagementNetCents:actual,remainingApplicationFeeCents:remaining});
    const expected = {action,shortfallCents:shortfall,applicationFeeRefundCents:refund,unresolvedShortfallCents:unresolved,managementOverageCents:overage};
    const result = plan(input);
    assert.deepEqual(result,expected); assert.deepEqual(plan(input),expected);
    assert.ok(Object.isFrozen(result)); assert.ok(result.applicationFeeRefundCents <= remaining);
    assert.equal(result.applicationFeeRefundCents + result.unresolvedShortfallCents,result.shortfallCents);
    assert.throws(() => { result.applicationFeeRefundCents = 1; },TypeError);
  });
}
test("planner validates amounts and rejects unsafe shortfall arithmetic", () => {
  const valid = {managementOwedCents:100000,actualManagementNetCents:100000,remainingApplicationFeeCents:495};
  for (const invalid of [{managementOwedCents:99},{managementOwedCents:500001},{actualManagementNetCents:1.5},
    {actualManagementNetCents:NaN},{remainingApplicationFeeCents:-1},{remainingApplicationFeeCents:1.5},
    {actualManagementNetCents:-Number.MAX_SAFE_INTEGER}]) assert.throws(() => plan({...valid,...invalid}),RangeError);
});
test("direct pricing imports are restricted to approved preparation/validation; public issuance and execution stay disabled", () => {
  function inspect(directory) {
    for (const entry of readdirSync(directory,{withFileTypes:true})) {
      const filename = path.join(directory,entry.name);
      if (entry.isDirectory()) inspect(filename);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && ![path.join(root,"lib/rflDirectPricing.ts"),path.join(root,"lib/directPaymentFoundation.ts"),path.join(root,"lib/directCheckoutLifecycle.ts"),path.join(root,"lib/directFinancialReconciliation.ts"),path.join(root,"lib/customPayment.ts"),path.join(root,"lib/versionedCheckoutQuote.ts"),path.join(root,"lib/checkoutDispatch.ts")].includes(filename)) {
        assert.doesNotMatch(readFileSync(filename,"utf8"),/rflDirectPricing|directPaymentFoundation|directCheckoutLifecycle/,path.relative(root,filename));
      }
    }
  }
  inspect(path.join(root,"app")); inspect(path.join(root,"lib")); inspect(path.join(root,"components"));
  for (const file of ["lib/customPayment.ts", "lib/versionedCheckoutQuote.ts"]) {
    assert.doesNotMatch(readFileSync(path.join(root, file), "utf8"), /createDirectCheckoutSession|startDirectCheckout|directCheckoutLifecycle/, file);
  }
  assert.doesNotMatch(readFileSync(path.join(root, "lib/checkoutDispatch.ts"), "utf8"), /startDirectCheckout|createDirectCheckoutSession|\.checkout\.sessions\.create/);
  const policySource = readFileSync(path.join(root, "lib/paymentArchitecturePolicy.ts"), "utf8");
  const policy = { exports: {} };
  vm.runInThisContext(`(function(module,exports){${ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText}\n})`)(policy, policy.exports);
  assert.equal(policy.exports.selectedCheckoutChargeModel(), "LEGACY_DESTINATION");
  assert.equal(policy.exports.directPaymentCreationEnabled(), false);

});
