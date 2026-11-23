import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function render(file, props = {}) {
  const fixture = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, {
    module: fixture, exports: fixture.exports,
    require(name) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsx;
      assert.equal(name, "next/link");
      return { __esModule: true, default: p => React.createElement("a", p, p.children) };
    },
    fetch() { throw Error("Network access prohibited in copy tests"); },
  });
  return renderToStaticMarkup(React.createElement(fixture.exports.default, props));
}
const text = render("app/terms/page.tsx").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

test("approved refund policy and ACH platform fee are qualified accurately", () => {
  for (const phrase of ["New payments use ACH bank transfers", "ACH fees vary by transaction amount", "added to the Business subtotal", "not a statement of Stripe's actual processing costs", "fee and total debit are shown before payment authorization", "Management handles voluntary tenant refunds directly, outside RentFrayLite", "does not offer discretionary manager-initiated refunds", "ordinarily retained after processing", "does not remove a Payer's bank dispute rights", "legally required refunds", "Stripe fees and transferred funds may be reversed", "does not change or erase the original platform payment record"]) assert.ok(text.includes(phrase), phrase);
  assert.doesNotMatch(text, /fees are never refunded|transfers are never reversed/i);
});

test("authorization, billing, push and unresolved legal clauses remain unchanged", () => {
  const file = "app/terms/page.tsx";
  const before = execFileSync("git", ["show", "47ab626fd9a947bb5c8fd0ff059e6270720dc27d:" + file], { encoding: "utf8" }).replace(/\r\n/g, "\n");
  const after = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  for (const title of ["7. Payer Authorization", "8. Business Charges and Billing Rules", "11. Optional manager notifications", "18. Limitation of Liability", "19. Indemnification"]) {
    const section = s => s.slice(s.indexOf(title), s.indexOf("</section>", s.indexOf(title)));
    assert.equal(section(after), section(before), title);
  }
  assert.match(text, /operational launch draft/);
});

for (const sourceType of ["RECURRING_PLAN", "CUSTOM_PAYMENT"]) {
  test(sourceType + ": only fee label changes; amounts and authorization remain", () => {
    const file = "app/[accountCode]/review/ReviewPaymentClient.tsx";
    const before = execFileSync("git", ["show", "47ab626fd9a947bb5c8fd0ff059e6270720dc27d:" + file], { encoding: "utf8" });
    assert.equal(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), before.replace(/\r\n/g, "\n").replace('{isCustom ? "Processing fee" : "Platform Service Fee"}', "Platform Service Fee"));
    const html = render(file, { sourceType, checkoutSessionId: "synthetic-quote", businessName: "Synthetic Business", accountCode: "AA-1234", unitNumber: "101", firstName: "Synthetic", lastName: "Payer", phone: "5555551234", paymentMethod: "ACH", billingCycle: sourceType === "CUSTOM_PAYMENT" ? null : "2026-11", dueDate: null, graceEndsAt: null, lineItems: [{ type: "BASE_AMOUNT", label: "Synthetic payment", amountCents: 10000 }], subtotalCents: 10000, platformFeeCents: 395, totalCents: 10395 });
    for (const phrase of ["Platform Service Fee", "$100.00", "$3.95", "$103.95", "Continue to Secure Payment"]) assert.ok(html.includes(phrase), phrase);
    assert.match(html, /href="\/terms"/);
    assert.match(html, /href="\/privacy"/);
  });
}
