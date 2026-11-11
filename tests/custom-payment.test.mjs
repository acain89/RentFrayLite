import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { harness, postgres } from "./helpers/checkout-harness.mjs";
import { customFixture } from "./helpers/custom-payment-harness.mjs";

const pure = (await harness("ACH", "isolated")).load("lib/customPayment.ts");
for (const [text, cents] of [["1",100],["1.0",100],["1.01",101],["99.99",9999],["100.00",10000],["4999.99",499999],["5000",500000],["5000.00",500000]]) {
  test("Custom dollar parsing is exact: " + text, () => assert.equal(pure.parseCustomPaymentAmount(text), cents));
}
for (const value of [undefined,null,0,1,NaN,Infinity,{},[],""," ","0","0.99","-1","+1","1.001","1e3","1,000.00","$1.00","01.00","1.",".99"," 1.00","1.00 ","5000.01","99999999999999999999","1\n"]) {
  test("Custom dollar parsing rejects " + String(value), () => assert.throws(() => pure.parseCustomPaymentAmount(value), RangeError));
}


const backends = postgres ? ["isolated", "postgres"] : ["isolated"];
for (const backend of backends) for (const method of ["ACH", "CARD"]) {
  const label = backend + " " + method + " Custom";
  for (const [amount, cents, achFee, cardFee] of [["1.00",100,295,300],["123.45",12345,395,700],["5000.00",500000,995,19400]]) {
    test(label + ": no-tier checkout before first billing date at " + amount, async () => {
      const h = await customFixture(method, backend), { checkout, review } = await h.prepareCustom(amount);
      assert.equal(checkout.sourceType, "CUSTOM_PAYMENT");
      for (const field of ["planId","billingCycle","dueDate","graceEndsAt"]) assert.equal(checkout[field], null, field);
      for (const field of ["recurringChargesCents","initialLateFeeCents","dailyLateFeesCents"]) assert.equal(checkout[field], 0, field);
      assert.equal(checkout.baseAmountCents, cents); assert.equal(checkout.subtotalCents, cents);
      assert.equal(checkout.platformFeeCents, method === "ACH" ? achFee : cardFee);
      assert.deepEqual(checkout.lineItems.map(i => i.type), ["CUSTOM_PAYMENT","PLATFORM_FEE"]);
      assert.equal(review.sourceType, "CUSTOM_PAYMENT"); assert.equal(review.dueDate, null); assert.equal(review.billingCycle, null);
      assert.equal((await h.start(checkout)).status, 200);
      const a = await h.current(checkout), params = h.calls.creates[0].params;
      assert.equal(a.payment.sourceType, "CUSTOM_PAYMENT"); assert.equal(a.payment.sourceId, null); assert.equal(a.payment.billingCycle, null);
      assert.equal(a.payment.checkoutAttemptId, checkout.id); assert.equal(a.payment.businessProceedsCents, cents);
      assert.equal(params.payment_intent_data.application_fee_amount, checkout.platformFeeCents);
      assert.equal(params.payment_intent_data.transfer_data.destination, a.payment.stripeConnectedAccountId);
      assert.equal(params.line_items.reduce((n,i) => n + i.price_data.unit_amount,0), review.totalCents);
      assert.equal(params.metadata.sourceType, "CUSTOM_PAYMENT"); assert.equal(params.metadata.billingCycle, undefined);
      assert.equal(a.payment.chargeModel, "LEGACY_DESTINATION");
      const intent = h.intentFor(a); h.settle(a,intent); await h.webhook(a,intent);
      const result = await h.load("lib/paymentResult.ts").getPaymentResult(h.business.accountCode,a.session.id);
      assert.equal(result.payment.status,"PAID"); assert.deepEqual(result.payment.lineItemsSnapshot,checkout.lineItems);
      h.cookieJar.clear(); assert.equal(await h.load("lib/paymentResult.ts").getPaymentResult(h.business.accountCode,a.session.id),null);
    });
  }
  for (const value of ["0","-1","0.99","5000.01","1.001","1e3",100]) test(label + ": API rejects invalid amount " + value, async () => {
    const h = await customFixture(method, backend); assert.equal((await h.create(value)).status,400);
    assert.equal((await h.payments()).length,0); assert.equal(h.calls.creates.length,0);
  });
  for (const extra of [{planId:"tier"},{billingCycle:"2026-10"},{dueDate:"2026-10-01"},{platformFeeCents:0},{totalCents:1},{initialLateFeeCents:0},{lineItems:[]},{sourceType:"UNKNOWN"}]) test(label + ": API rejects mixed/client-controlled fields " + JSON.stringify(extra), async () => {
    const h = await customFixture(method,backend); assert.equal((await h.create("10.00",extra)).status,400); assert.equal((await h.payments()).length,0);
  });
  test(label + ": repeated identical and concurrent independent attempts are permitted", async () => {
    const h = await customFixture(method,backend), checkouts = await Promise.all(Array.from({length:3}, async()=> (await h.prepareCustom()).checkout));
    const responses = await Promise.all(checkouts.map(h.start)); assert.ok(responses.every(r=>r.status===200));
    assert.equal((await h.payments()).length,3); assert.equal(h.calls.creates.length,3); assert.equal(new Set(h.calls.creates.map(c=>c.options.idempotencyKey)).size,3);
  });
  test(label + ": concurrent same attempt and browser retry create one payment", async () => {
    const h = await customFixture(method,backend), {checkout}=await h.prepareCustom();
    const responses=await Promise.all(Array.from({length:8},()=>h.start(checkout))); assert.ok(responses.every(r=>[200,409].includes(r.status)));
    assert.equal((await h.payments()).length,1); assert.equal(h.calls.creates.length,1); assert.equal((await h.start(checkout)).status,200); assert.equal(h.calls.creates.length,1);
    h.cookieJar.clear(); assert.equal((await h.start(checkout)).status,409);
  });
  test(label + ": timeout after provider creation never recreates this attempt", async () => {
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();h.live.createFailure=true;
    assert.equal((await h.start(checkout)).status,500);h.live.createFailure=false;
    assert.equal((await h.start(checkout)).status,409);assert.equal(h.calls.creates.length,1);
    assert.equal((await h.start((await h.prepareCustom()).checkout)).status,200);assert.equal((await h.payments()).length,2);
  });
  for (const changes of [{totalCents:1},{platformFeeCents:0},{paymentMethod:method==="ACH"?"CARD":"ACH"},{lineItems:[{type:"CUSTOM_PAYMENT",label:"Tampered",amountCents:12345},{type:"PLATFORM_FEE",label:"Fee",amountCents:0}]}]) test(label + ": tampered quote is rejected " + Object.keys(changes).join(), async()=>{
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();await h.db.checkoutSession.update({where:{id:checkout.id},data:changes});
    assert.equal((await h.start(checkout)).status,409);assert.equal((await h.payments()).length,0);assert.equal(h.calls.creates.length,0);
  });
  test(label + ": expiry rejects a stale unreserved quote",async()=>{
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();h.clock.now="2026-10-25T13:00:00Z";
    // Fix 1 rejects the expired browser binding before quote-state disclosure.
    assert.equal((await h.start(checkout)).status,403);assert.equal((await h.payments()).length,0);assert.equal(h.calls.creates.length,0);
  });
  test(label + ": local midnight, invalid tier/calendar settings and later configuration do not reprice a reserved attempt",async()=>{
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();assert.equal((await h.start(checkout)).status,200);const before=await h.current(checkout);
    Object.assign(h.business,{propertyTimeZone:null,firstStandardBillingDate:new Date("2099-01-01")});
    if(backend==="postgres")await h.db.business.update({where:{id:h.business.id},data:{propertyTimeZone:null,firstStandardBillingDate:new Date("2099-01-01")}});
    h.clock.now="2027-01-05T12:00:00Z";assert.equal((await h.start(checkout)).status,200);assert.deepEqual(await h.current(checkout),before);assert.equal(h.calls.creates.length,1);
    assert.equal((await h.create()).status,201);
  });
  test(label + ": standard calendar/mandatory charges stay authoritative while Custom remains separate",async()=>{
    const h=await customFixture(method,backend),plan={id:"tier_"+randomUUID(),businessId:h.business.id,name:"Rent",isActive:true,baseAmountCents:100000,dueDay:1,gracePeriodDays:5,initialLateFeeCents:500,dailyLateFeeCents:100,dailyLateFeeMaxDays:10,sortOrder:0};
    const charge={id:"charge_"+randomUUID(),label:"Water",amountCents:400,isActive:true,effectiveBillingCycle:null,endsAfterBillingCycle:null,sortOrder:0};
    if(backend==="postgres")await h.db.recurringPlan.create({data:{...plan,charges:{create:charge}}});
    h.business.recurringPlans=[{...plan,charges:[charge]}];
    const standard=()=>h.load("app/api/public/checkout/session/route.ts").POST(new Request("https://example.test/api",{method:"POST",headers:{"content-type":"application/json",origin:"https://example.test"},body:JSON.stringify({accountCode:h.business.accountCode,planId:plan.id,firstName:"Standard",lastName:"Payer",unitNumber:"101",phone:"5555551234",paymentMethod:method})}));
    const blocked=await standard();assert.equal(blocked.status,409);assert.equal((await blocked.json()).code,"BEFORE_FIRST_CYCLE");
    const custom=(await h.prepareCustom()).checkout;assert.equal(custom.subtotalCents,12345);assert.equal(custom.recurringChargesCents,0);
    h.clock.now="2026-11-07T12:00:00Z";const response=await standard();assert.equal(response.status,201);const body=await response.json();
    const checkout=await h.db.checkoutSession.findUnique({where:{id:body.checkoutSession.id}});await h.review(checkout);
    assert.equal(checkout.recurringChargesCents,400);assert.equal(checkout.initialLateFeeCents,500);assert.equal(checkout.dailyLateFeesCents,100);assert.equal(checkout.subtotalCents,101000);
    assert.equal((await h.start(checkout)).status,200);
  });
  test(label + ": failure, resume, independent success, late settlement and replay remain isolated",async()=>{
    const h=await customFixture(method,backend),aCheckout=(await h.prepareCustom()).checkout;assert.equal((await h.start(aCheckout)).status,200);const a=await h.current(aCheckout),intent=h.intentFor(a);
    await h.webhook(a,intent,"payment_intent.payment_failed","FAILED");assert.equal((await h.start(aCheckout)).status,200);
    const bCheckout=(await h.prepareCustom("50.00")).checkout;assert.equal((await h.start(bCheckout)).status,200);const b=await h.current(bCheckout),bi=h.intentFor(b);h.settle(b,bi);await h.webhook(b,bi);
    h.settle(a,intent);const eventId="evt_"+randomUUID();await h.webhook(a,intent,"payment_intent.succeeded","PAID",200,eventId);await h.webhook(a,intent,"payment_intent.succeeded","PAID",200,eventId);
    await h.webhook(a,intent,"payment_intent.payment_failed","PAID");assert.deepEqual((await h.db.payment.findUnique({where:{id:a.payment.id}})).lineItemsSnapshot,aCheckout.lineItems);
    assert.equal((await h.db.auditLog.findMany({where:{targetId:a.payment.id}})).filter(r=>r.metadata?.stripeEventId===eventId).length,1);
    assert.equal((await h.payments()).length,2);
  });
  test(label + ": pending Custom payment blocks only its own execution, not a new checkout",async()=>{
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();assert.equal((await h.start(checkout)).status,200);
    const a=await h.current(checkout),intent=h.intentFor(a,"processing");await h.webhook(a,intent,"payment_intent.processing","PENDING");
    assert.equal((await h.start(checkout)).status,409);assert.equal((await h.start((await h.prepareCustom()).checkout)).status,200);
    h.settle(a,intent);await h.webhook(a,intent);assert.equal((await h.payments()).length,2);assert.equal(h.calls.creates.length,2);
  });
  test(label + ": provider source tampering cannot reinterpret a custom payment",async()=>{
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();assert.equal((await h.start(checkout)).status,200);const a=await h.current(checkout),intent=h.intentFor(a);h.settle(a,intent);a.session.metadata.sourceType="RECURRING_PLAN";
    const eventId="evt_custom_tamper_"+checkout.id;await h.webhook(a,intent,"payment_intent.succeeded","CHECKOUT_STARTED",500,eventId);assert.equal((await h.db.auditLog.findMany({where:{targetId:eventId}})).length,1);assert.equal(await h.db.smsReceipt.findUnique({where:{paymentId:a.payment.id}}),null);
  });
  test(label + ": owned dispute/ACH return and resolution preserve Custom identity and one receipt",async()=>{
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();assert.equal((await h.start(checkout)).status,200);
    const a=await h.current(checkout),intent=h.intentFor(a);h.settle(a,intent);await h.webhook(a,intent);
    intent.latest_charge.disputed=true;
    const dispute={id:"dp_"+randomUUID(),object:"dispute",charge:intent.latest_charge.id,payment_intent:intent.id,status:"lost",reason:method==="ACH"?"insufficient_funds":"fraudulent"};
    h.live.disputes.push(dispute);await h.webhook(a,dispute,"charge.dispute.created",method==="ACH"?"RETURNED":"DISPUTED");
    dispute.status="won";await h.webhook(a,dispute,"charge.dispute.closed","PAID");
    const p=await h.db.payment.findUnique({where:{id:a.payment.id}});assert.equal(p.sourceType,"CUSTOM_PAYMENT");assert.equal(p.billingCycle,null);assert.deepEqual(p.lineItemsSnapshot,checkout.lineItems);
    assert.equal((await h.db.smsReceipt.findMany()).filter(r=>r.paymentId===p.id).length,1);
  });
  test(label + ": source/calendar shape cannot be mixed",async()=>{
    const h=await customFixture(method,backend),{checkout}=await h.prepareCustom();
    if(backend==="postgres")await assert.rejects(h.db.checkoutSession.update({where:{id:checkout.id},data:{planId:"forged"}}));
    else{await h.db.checkoutSession.update({where:{id:checkout.id},data:{planId:"forged"}});assert.equal((await h.start(checkout)).status,409);}
    assert.equal((await h.payments()).length,0);
  });
  test(label + ": unavailable Stripe fails closed without payment creation",async()=>{
    const h=await customFixture(method,backend);h.stripe.accounts.retrieve=async()=>{throw Error("Mock account unavailable");};
    assert.equal((await h.create()).status,404);assert.equal((await h.payments()).length,0);
  });
}

if (postgres) test("PostgreSQL Custom transactions appear in scoped dashboard and complete history without a rent cycle", async()=>{
  const h=await customFixture("ACH","postgres"),{checkout}=await h.prepareCustom();assert.equal((await h.start(checkout)).status,200);
  const a=await h.current(checkout),intent=h.intentFor(a);h.settle(a,intent);await h.webhook(a,intent);
  await h.db.payment.update({where:{id:a.payment.id},data:{createdAt:new Date("2026-10-25T12:00:00Z")}});
  const manager={displayName:"Test Manager",email:"manager@example.test"};
  h.mocks["@/lib/auth"]={requireManager:async()=>({manager,business:h.business})};
  h.mocks["./ManagerDashboardClient"]={__esModule:true,default:()=>null};
  h.mocks["./ManagerHistoryClient"]={__esModule:true,default:()=>null};
  h.mocks["next/navigation"].redirect=url=>{throw Error("Unexpected redirect "+url);};
  const oldData={...a.payment};delete oldData.id;delete oldData.updatedAt;delete oldData.createdAt;
  Object.assign(oldData,{checkoutAttemptId:null,stripeCheckoutSessionId:null,stripePaymentIntentId:null,stripeChargeId:null,createdAt:new Date("2026-09-15"),status:"FAILED"});
  const old=await h.db.payment.create({data:oldData});
  const current=await h.load("app/manager/dashboard/page.tsx").default();
  assert.equal(current.props.payments.length,1);assert.equal(current.props.payments[0].id,a.payment.id);assert.equal(current.props.payments[0].paymentType,"Custom");
  assert.equal(current.props.payments[0].reference,"101");assert.equal(current.props.payments[0].customerName,"Custom Payer");assert.equal(current.props.payments[0].amountCents,12345);
  const history=await h.load("app/manager/history/page.tsx").default();
  assert.equal(history.props.payments.length,2);assert.ok(history.props.payments.some(p=>p.id===old.id));
  for(const p of history.props.payments){assert.equal(p.sourceType,"CUSTOM_PAYMENT");assert.equal(p.sourceId,null);assert.equal(p.billingCycle,null);}
});
