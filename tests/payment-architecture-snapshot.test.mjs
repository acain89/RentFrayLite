import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { harness } from "./helpers/checkout-harness.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const architectureFields = ["pricingVersion","chargeModel","stripeConnectedAccountId","expectedStripeProcessingFeeCents","rflApplicationFeeCents"];
const nullArchitecture = Object.fromEntries(architectureFields.map(field => [field,null]));
const sum = items => items.reduce((total,item) => total + item.quantity * item.price_data.unit_amount,0);

for (const method of ["ACH","CARD"]) {
  test(`${method}: production session/start capture legacy facts without changing the Stripe request`, async () => {
    const h = await harness(method,"isolated"), checkout = await h.prepare();
    const destination = h.business.stripeConnection.stripeAccountId;
    assert.equal((await h.start(checkout)).status,200);
    const [payment] = await h.payments(), {params,options} = h.calls.creates[0];
    const fee = method === "ACH" ? 995 : 4900, total = method === "ACH" ? 100995 : 104900;
    for (const record of [checkout,payment]) {
      assert.equal(record.pricingVersion,"RFL_LEGACY_V1"); assert.equal(record.chargeModel,"LEGACY_DESTINATION");
      assert.equal(record.stripeConnectedAccountId,destination); assert.equal(record.expectedStripeProcessingFeeCents,null);
      assert.equal(record.rflApplicationFeeCents,fee); assert.equal(record.subtotalCents,100000); assert.equal(record.platformFeeCents,fee);
    }
    assert.equal(checkout.expectedManagementNetCents,100000); assert.equal(payment.businessProceedsCents,100000);
    assert.ok(payment.processorFeeCents == null); assert.ok(payment.actualManagementNetCents == null); assert.ok(payment.stripeBalanceTransactionId == null);
    assert.equal(checkout.totalCents,total); assert.equal(payment.totalChargedCents,total); assert.equal(sum(params.line_items),total);
    assert.equal(params.line_items.filter(item => /platform.*fee/i.test(item.price_data.product_data.name)).length,1);
    assert.deepEqual(params.payment_method_types,[method === "ACH" ? "us_bank_account" : "card"]);
    assert.deepEqual(params.payment_intent_data,{application_fee_amount:fee,transfer_data:{destination},metadata:params.metadata});
    assert.deepEqual(options,{idempotencyKey:`rfl-payment-${payment.id}`});
    assert.deepEqual(Object.keys(params).sort(),["mode","payment_method_types","line_items","success_url","cancel_url","client_reference_id","metadata","payment_intent_data"].sort());
  });

  test(`${method}: connection change cannot replace the captured destination at creation`, async () => {
    const h = await harness(method,"isolated"), checkout = await h.prepare();
    const originalAccount = checkout.stripeConnectedAccountId;
    h.business.stripeConnection.stripeAccountId = "acct_replacement";
    const retrieveAccount = h.stripe.accounts.retrieve, checkedAccounts = [];
    h.stripe.accounts.retrieve = async (...args) => { checkedAccounts.push(args[0]); return retrieveAccount(...args); };
    assert.equal((await h.start(checkout)).status,200);
    const [payment] = await h.payments();
    assert.equal(payment.stripeConnectedAccountId,originalAccount);
    assert.equal(h.calls.creates[0].params.payment_intent_data.transfer_data.destination,originalAccount);
    assert.ok(checkedAccounts.includes(originalAccount)); assert.ok(!checkedAccounts.includes("acct_replacement"));
  });

  test(`${method}: linked resume observes the historical captured account after connection change`, async () => {
    const h = await harness(method,"isolated"), attempt = await h.original("CHECKOUT_STARTED");
    const intent = h.intentFor(attempt);
    const beforePayment = await h.db.payment.findUnique({where:{id:attempt.payment.id}});
    const beforeCheckout = await h.db.checkoutSession.findUnique({where:{id:attempt.checkout.id}});
    h.business.stripeConnection.stripeAccountId = "acct_replacement";
    const response = await h.start(attempt.checkout);
    assert.equal(response.status,200); assert.equal((await response.json()).paymentId,attempt.payment.id);
    assert.equal(intent.transfer_data.destination,beforePayment.stripeConnectedAccountId);
    assert.equal(h.calls.creates.length,1);
    assert.deepEqual(await h.db.payment.findUnique({where:{id:attempt.payment.id}}),beforePayment);
    assert.deepEqual(await h.db.checkoutSession.findUnique({where:{id:attempt.checkout.id}}),beforeCheckout);
  });

  const corruptions = {
    pricingVersion:"RFL_DIRECT_V1", chargeModel:"DIRECT", stripeConnectedAccountId:"acct_tampered",
    expectedStripeProcessingFeeCents:500, rflApplicationFeeCents:1,
    subtotalCents:100001, platformFeeCents:1, totalChargedCents:1, businessProceedsCents:99999,
  };
  for (const [field,value] of Object.entries(corruptions)) test(`${method}: payment ${field} cannot change during resume`, async () => {
    const h = await harness(method,"isolated"), attempt = await h.original("CHECKOUT_STARTED"); h.intentFor(attempt);
    await h.db.payment.update({where:{id:attempt.payment.id},data:{[field]:value}});
    const before = await h.payments(), checkout = await h.db.checkoutSession.findUnique({where:{id:attempt.checkout.id}});
    assert.ok([409,500].includes((await h.start(attempt.checkout)).status));
    assert.deepEqual(await h.payments(),before); assert.deepEqual(await h.db.checkoutSession.findUnique({where:{id:attempt.checkout.id}}),checkout);
    assert.equal(h.calls.creates.length,1);
  });
  for (const [field,value] of Object.entries({...corruptions,expectedManagementNetCents:99999}).filter(([field]) => !["businessProceedsCents","totalChargedCents"].includes(field))) {
    test(`${method}: checkout ${field} cannot change during resume`, async () => {
      const h = await harness(method,"isolated"), attempt = await h.original("CHECKOUT_STARTED"); h.intentFor(attempt);
      await h.db.checkoutSession.update({where:{id:attempt.checkout.id},data:{[field]:value}});
      const before = await h.payments();
      assert.ok([409,500].includes((await h.start(attempt.checkout)).status));
      assert.deepEqual(await h.payments(),before); assert.equal(h.calls.creates.length,1);
    });
  }

  test(`${method}: snapshot changes between route read and reservation fail without payment creation`, async () => {
    const h = await harness(method,"isolated"), checkout = await h.prepare();
    h.live.onBeforeReserve = async () => h.db.checkoutSession.update({where:{id:checkout.id},data:{stripeConnectedAccountId:"acct_changed"}});
    assert.equal((await h.start(checkout)).status,500); assert.equal(h.calls.creates.length,0); assert.equal((await h.payments()).length,0);
  });
  test(`${method}: independent review uses its captured account without rebinding an original payment`, async () => {
    const h = await harness(method,"isolated"), attempt = await h.original("CHECKOUT_STARTED"); h.intentFor(attempt);
    h.business.stripeConnection.stripeAccountId = "acct_replacement";
    const replacement = await h.prepare();
    assert.equal((await h.start(replacement)).status,200); assert.equal(h.calls.creates.length,2);
    const original = await h.db.payment.findUnique({where:{id:attempt.payment.id}});
    assert.deepEqual(original,attempt.payment);
    const fresh = (await h.payments()).find(p=>p.id!==original.id);
    assert.equal(fresh.stripeConnectedAccountId,"acct_replacement");
    assert.equal(original.stripeConnectedAccountId,attempt.payment.stripeConnectedAccountId);
    assert.equal((await h.start(attempt.checkout)).status,200); assert.equal(h.calls.creates.length,2);
  });
  test(`${method}: legacy null snapshots remain readable; unknown ownership cannot authorize retry`, async () => {
    const h = await harness(method,"isolated"), attempt = await h.original("CHECKOUT_STARTED"); h.intentFor(attempt);
    await h.db.payment.update({where:{id:attempt.payment.id},data:nullArchitecture});
    await h.db.checkoutSession.update({where:{id:attempt.checkout.id},data:{...nullArchitecture,expectedManagementNetCents:null}});
    // The isolated ORM does not project Prisma nested select relations. Supply
    // only that relation; the production result/access logic remains real.
    const findPayment = h.db.payment.findUnique;
    h.db.payment.findUnique = async args => {
      const row = await findPayment(args);
      return row && args.select?.business ? {...row,business:{id:h.business.id,name:h.business.name,accountCode:h.business.accountCode}} : row;
    };
    const result = await h.load("lib/paymentResult.ts").getPaymentResult(h.business.accountCode,attempt.session.id);
    assert.ok(result); assert.equal(result.payment.totalChargedCents,attempt.payment.totalChargedCents);
    const before = await h.payments(); assert.equal((await h.start(attempt.checkout)).status,500);
    assert.deepEqual(await h.payments(),before); assert.equal(h.calls.creates.length,1);
    // Historical settlement still uses the unchanged signed webhook authority.
    const intent = h.live.intents.get(attempt.session.payment_intent);
    h.settle(attempt,intent); const paid = await h.webhook(attempt,intent);
    for (const field of architectureFields) assert.equal(paid[field],null);
  });
  test(`${method}: unknown unstarted history requires a fresh checkout instead of guessed backfill`, async () => {
    const h = await harness(method,"isolated"), checkout = await h.prepare();
    await h.db.checkoutSession.update({where:{id:checkout.id},data:{...nullArchitecture,expectedManagementNetCents:null}});
    assert.equal((await h.start(checkout)).status,409); assert.equal((await h.payments()).length,0); assert.equal(h.calls.creates.length,0);
    assert.equal((await h.db.checkoutSession.findUnique({where:{id:checkout.id}})).pricingVersion,null);
  });
  test(`${method}: new snapshot fields do not change signed destination webhook settlement`, async () => {
    const h = await harness(method,"isolated"), attempt = await h.original("CHECKOUT_STARTED"), intent = h.intentFor(attempt);
    h.settle(attempt,intent); const before = await h.db.payment.findUnique({where:{id:attempt.payment.id}});
    const paid = await h.webhook(attempt,intent);
    for (const field of architectureFields) assert.equal(paid[field],before[field]);
    assert.equal(paid.businessProceedsCents,100000); assert.ok(paid.actualManagementNetCents == null);
  });
}

test("generated schema exposes nullable architecture/economics fields without duplicate monetary aliases", () => {
  const { Prisma } = require("@prisma/client");
  const models = Prisma.dmmf.datamodel.models;
  for (const name of ["CheckoutSession","Payment"]) {
    const model = models.find(model => model.name === name);
    const fields = [...architectureFields,...(name === "CheckoutSession" ? ["expectedManagementNetCents"] : ["stripeBalanceTransactionId","actualManagementNetCents","processorFeeCents"])];
    for (const name of fields) { const field = model.fields.find(field => field.name === name); assert.ok(field,name); assert.equal(field.isRequired,false,name); assert.equal(field.hasDefaultValue,false,name); }
    assert.ok(!model.fields.some(field => ["managementOwedCents","tenantProcessingFeeCents"].includes(field.name)));
  }
  assert.deepEqual(Prisma.dmmf.datamodel.enums.find(e => e.name === "StripeChargeModel").values.map(v => v.name),["LEGACY_DESTINATION","DIRECT"]);
});
test("migration is additive and makes no historical assignments or speculative uniqueness", () => {
  const sql = readFileSync(path.join(root,"prisma/migrations/20261002120000_add_payment_architecture_snapshots/migration.sql"),"utf8").replace(/--[^\n]*/g,"");
  assert.doesNotMatch(sql,/\b(UPDATE|DELETE|DROP|DEFAULT|UNIQUE|NOT NULL)\b/i);
  assert.equal((sql.match(/ADD COLUMN/g) ?? []).length,13);
});
