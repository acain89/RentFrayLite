import assert from "node:assert/strict";
import { harness } from "./checkout-harness.mjs";

// Forward the actual browser request, including Origin and Cookie. Do not add
// authorization to requests which did not carry it in the issuing browser.
export async function customBrowserMutationRequest(request) {
  return new Request(request.url(), { method: request.method(), headers: await request.allHeaders(), body: request.postDataBuffer() });
}

export async function customFixture(method = "ACH", backend = "isolated") {
  const clock = { now: "2026-10-25T12:00:00Z" }, h = await harness(method, backend, clock);
  const calendar = { createdAt: new Date("2026-10-15T12:00:00Z"), propertyTimeZone: "America/Chicago", firstStandardBillingDate: new Date("2026-11-01") };
  Object.assign(h.business, calendar);
  if (backend === "postgres") {
    await h.db.business.update({ where: { id: h.business.id }, data: calendar });
    await h.db.recurringPlan.deleteMany({ where: { businessId: h.business.id } });
  }
  h.business.recurringPlans = [];
  // Real public readiness, with only Prisma/Stripe transports supplied by the harness.
  h.mocks["@/lib/publicCheckout"] = h.load("lib/publicCheckout.ts");
  const create = (amount = "123.45", extra = {}) => h.load("app/api/public/checkout/session/route.ts").POST(new Request("https://example.test/api", { method:"POST",headers:{"content-type":"application/json",origin:"https://example.test"},body: JSON.stringify({
    sourceType: "CUSTOM_PAYMENT", accountCode: h.business.accountCode, amount, firstName: "Custom", lastName: "Payer", unitNumber: "101", phone: "5555551234", paymentMethod: method, ...extra,
  }) }));
  const review = checkout => h.load("app/[accountCode]/review/page.tsx").default({ params: Promise.resolve({ accountCode: h.business.accountCode }), searchParams: Promise.resolve({ session: checkout.id }) });
  async function prepare(amount = "123.45", extra = {}) {
    const response = await create(amount, extra); assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const body = await response.json(), checkout = await h.db.checkoutSession.findUnique({ where: { id: body.checkoutSession.id } });
    const element = await review(checkout);
    return { checkout: await h.db.checkoutSession.findUnique({ where: { id: checkout.id } }), review: element.props, reviewUrl: body.reviewUrl };
  }
  const current = async checkout => {
    const stored = await h.db.checkoutSession.findUnique({ where: { id: checkout.id } });
    const payment = await h.db.payment.findUnique({ where: { id: stored.paymentId } });
    return { checkout: stored, payment, session: h.live.sessions.get(payment.stripeCheckoutSessionId) };
  };
  return { ...h, clock, create, review, prepareCustom: prepare, current };
}
