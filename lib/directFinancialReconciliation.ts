import { randomUUID } from "node:crypto";
import { assertNoCustomerRefunds, readRefundParent } from "@/lib/customerRefundObservation";
import { hasUnknownArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type Payment, type PrismaClient, type DirectFinancialReconciliation } from "@prisma/client";
import type Stripe from "stripe";
import { planManagementNetReconciliation } from "@/lib/rflDirectPricing";
import { resolveStripePaymentContext, validateStripePaymentIdentity, classifyStripeCredentialMode, type StripePaymentIdentity } from "@/lib/stripePaymentContext";
import { directFinancialSnapshot, observeDirectEconomics, FinancialObservationError, financialCheck, FINANCIAL_READ, type DirectEconomics } from "@/lib/directFinancialObservation";
const TX={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:10000,timeout:30000};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Called under the existing webhook Payment lock. No provider calls or money
 * movement. Original expected facts and any correction reservation are retained. */
export async function queueDirectReconciliation(tx:Prisma.TransactionClient,p:Payment) {
  if(p.chargeModel!=="DIRECT")return null;
  const unsupported=p.pricingVersion!=="RFL_DIRECT_V1";
  const blocked=unsupported||["RETURNED","DISPUTED"].includes(p.status);
  return tx.directFinancialReconciliation.upsert({where:{paymentId:p.id},create:{paymentId:p.id,status:blocked?"EXCEPTION":"WAITING_DATA",
    reasonCode:unsupported?"UNSUPPORTED_ARCHITECTURE":blocked?"FINANCIAL_EVENT_REVIEW":null,expectedSnapshot:json(directFinancialSnapshot(p))},update:blocked?{status:"EXCEPTION",reasonCode:unsupported?"UNSUPPORTED_ARCHITECTURE":"FINANCIAL_EVENT_REVIEW"}:{}});
}
async function locked<T>(db:PrismaClient,paymentId:string,fn:(tx:Prisma.TransactionClient,p:Payment)=>Promise<T>) {
  return db.$transaction(async tx=>{await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`);
    const p=await tx.payment.findUnique({where:{id:paymentId}});financialCheck(p,"PAYMENT_MISSING");return fn(tx,p);},TX);
}
function unchanged(p:Payment,row:DirectFinancialReconciliation,identity:StripePaymentIdentity) {
  resolveStripePaymentContext(p,identity);financialCheck(p.chargeModel==="DIRECT"&&p.pricingVersion==="RFL_DIRECT_V1"&&isDeepStrictEqual(directFinancialSnapshot(p),row.expectedSnapshot),"EXPECTED_SNAPSHOT_CHANGED");
}
function ownedRefund(row:DirectFinancialReconciliation,observation:DirectEconomics,p:Payment) {
  const ours=observation.refunds.filter(r=>r.operationId===row.id);
  financialCheck(ours.length<=1,"MULTIPLE_CORRECTIONS");const refund=ours[0];if(!refund)return null;
  financialCheck(row.reservedAt&&refund.amountCents===row.correctionCents&&refund.paymentId===p.id&&refund.platformId===p.stripePlatformAccountId&&
    refund.connectedId===p.stripeConnectedAccountId&&refund.mode===p.stripeMode&&(!row.stripeRefundId||row.stripeRefundId===refund.id),"CORRECTION_OWNERSHIP_MISMATCH");return refund;
}

/** Trusted internal worker, no public route/scheduler. A reservation permits at
 * most ONE applicationFee.createRefund invocation, ever. Crashes/timeouts recover
 * by reading the original fee's refund records; an ambiguous operation is never
 * replayed blindly, even after Stripe idempotency retention has expired. */
export async function reconcileDirectPayment(db:PrismaClient,stripe:Stripe,paymentId:string,identity:StripePaymentIdentity) {
  const token=randomUUID();
  const claim=await locked(db,paymentId,async(tx,p)=>{
    if(p.chargeModel!=="DIRECT")return {kind:"LEGACY_SKIPPED" as const};
    let row=await queueDirectReconciliation(tx,p);financialCheck(row,"RECONCILIATION_MISSING");
    if(p.pricingVersion!=="RFL_DIRECT_V1")return {kind:"DONE" as const,row};
    if(row.leaseUntil&&row.leaseUntil>new Date())return {kind:"BUSY" as const};
    try { await assertNoCustomerRefunds(tx, p.id); } catch (error) {
      if (!(error instanceof FinancialObservationError) || error.code !== "CUSTOMER_REFUND_REVIEW") throw error;
      row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{status:"EXCEPTION",reasonCode:"CUSTOMER_REFUND_REVIEW",refreshRequested:false}});
      return {kind:"DONE" as const,row};
    }
    // Ownership problems remain durable even when no provider call is possible.
    try{unchanged(p,row,identity);}catch{row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{status:"EXCEPTION",reasonCode:"EXPECTED_SNAPSHOT_CHANGED"}});return {kind:"DONE" as const,row};}
    if (["CREATED","CHECKOUT_STARTED","PENDING"].includes(p.status)) { row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{status:"WAITING_DATA",reasonCode:"PAYMENT_NOT_SETTLED"}}); return {kind:"DONE" as const,row}; }
    row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{leaseToken:token,leaseUntil:new Date(Date.now()+5*60000),refreshRequested:false}});
    return {kind:"CLAIMED" as const,row,p};
  });
  if(claim.kind!=="CLAIMED")return claim;
  let row=claim.row;const p=claim.p;
  const save=async(data:Prisma.DirectFinancialReconciliationUpdateInput,finish=false)=>locked(db,p.id,async(tx,current)=>{
    const fresh=await tx.directFinancialReconciliation.findUnique({where:{id:row.id}});financialCheck(fresh&&fresh.leaseToken===token,"WORKER_LEASE_LOST");
    unchanged(current,fresh,identity);
    if (data.reservedAt || data.status === "CORRECTED" || data.status === "RECONCILED") await assertNoCustomerRefunds(tx, p.id);
    if(data.status==="CORRECTED"||data.status==="RECONCILED")financialCheck(current.status==="PAID"&&current.stripeChargeId===p.stripeChargeId&&current.stripePaymentIntentId===p.stripePaymentIntentId,"FINANCIAL_EVENT_REVIEW");
    row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{...data,...(finish?{leaseToken:null,leaseUntil:null,...(fresh.refreshRequested?{status:"WAITING_DATA",reasonCode:"DATA_CHANGED_RECHECK_REQUIRED"}:{})}:{})}});return row;
  });
  const observe=async()=>{const current=await db.payment.findUnique({where:{id:p.id}});financialCheck(current,"PAYMENT_MISSING");unchanged(current,row,identity);
    financialCheck(current.checkoutAttemptId,"ATTEMPT_MISSING");const checkout=await db.checkoutSession.findUnique({where:{id:current.checkoutAttemptId}});financialCheck(checkout,"CHECKOUT_MISSING");return observeDirectEconomics(stripe,current,checkout,identity);};
  try{
    let observation=await observe();
    if(row.initialObservation){const original=row.initialObservation as unknown as DirectEconomics;financialCheck(isDeepStrictEqual(original.base,observation.base),"FINALIZED_ECONOMICS_CHANGED");}
    else await save({initialObservation:json(observation),applicationFeeId:observation.base.applicationFeeId});
    await save({latestObservation:json(observation),actualProcessorFeeCents:observation.base.processorFeeCents,observedManagementNetCents:observation.managementNetCents});
    if(!row.reservedAt){
      const plan=planManagementNetReconciliation({managementOwedCents:p.subtotalCents,actualManagementNetCents:observation.managementNetCents,remainingApplicationFeeCents:observation.remainingApplicationFeeCents});
      if(plan.applicationFeeRefundCents===0){const final=await save({status:plan.unresolvedShortfallCents?"EXCEPTION":"RECONCILED",reasonCode:plan.unresolvedShortfallCents?"INSUFFICIENT_RFL_FEE":null,unresolvedShortfallCents:plan.unresolvedShortfallCents},true);return {kind:"DONE" as const,row:final};}
      // Commit before POST; rollback of the later execution transaction cannot
      // erase the reservation or make another worker eligible to create again.
      await save({status:"REQUIRED",reasonCode:null,correctionCents:plan.applicationFeeRefundCents,reservedAt:new Date(),idempotencyKey:`rfl-management-net-v1-${row.id}`,unresolvedShortfallCents:plan.unresolvedShortfallCents});
      await locked(db,p.id,async(tx,current)=>{
        const fresh=await tx.directFinancialReconciliation.findUnique({where:{id:row.id}});financialCheck(fresh&&fresh.leaseToken===token,"WORKER_LEASE_LOST");unchanged(current,fresh,identity);
        financialCheck(fresh.correctionCents===row.correctionCents&&fresh.idempotencyKey===row.idempotencyKey&&fresh.applicationFeeId===row.applicationFeeId&&isDeepStrictEqual(fresh.expectedSnapshot,row.expectedSnapshot),"CORRECTION_RESERVATION_CHANGED");
        financialCheck(current.status==="PAID"&&current.stripeChargeId===p.stripeChargeId&&current.stripePaymentIntentId===p.stripePaymentIntentId,"FINANCIAL_EVENT_REVIEW");
        await assertNoCustomerRefunds(tx, p.id);
        // Necessary last budget read and bounded POST under the Payment lock:
        // webhook state changes cannot race this execution. Stripe itself also
        // enforces the fee's remaining refundable amount atomically.
        const fee=await stripe.applicationFees.retrieve(fresh.applicationFeeId!,{},FINANCIAL_READ);
        financialCheck(fee.id===fresh.applicationFeeId&&fee.account===p.stripeConnectedAccountId&&fee.charge===p.stripeChargeId&&fee.livemode===(p.stripeMode==="live")&&fee.currency==="usd"&&fee.amount===p.rflApplicationFeeCents&&fee.amount_refunded===observation.refundedCents&&fee.amount-fee.amount_refunded>=fresh.correctionCents,"FEE_BUDGET_CHANGED");
        const metadata={rflReconciliationId:fresh.id,rflPaymentId:p.id,rflPlatformAccountId:p.stripePlatformAccountId!,rflConnectedAccountId:p.stripeConnectedAccountId!,rflMode:p.stripeMode!,rflOperation:"management-net-v1"};
        await assertNoCustomerRefunds(tx, p.id);
        const refund=await stripe.applicationFees.createRefund(fee.id,{amount:fresh.correctionCents,metadata},{...FINANCIAL_READ,idempotencyKey:fresh.idempotencyKey!});
        financialCheck(refund.object==="fee_refund"&&refund.id.startsWith("fr_")&&refund.fee===fee.id&&refund.amount===fresh.correctionCents&&refund.currency==="usd"&&Object.entries(metadata).every(([k,v])=>refund.metadata?.[k]===v),"CORRECTION_RESPONSE_UNVERIFIED");
        row=await tx.directFinancialReconciliation.update({where:{id:fresh.id},data:{stripeRefundId:refund.id}});
      });
      observation=await observe();
      financialCheck(isDeepStrictEqual((row.initialObservation as unknown as DirectEconomics).base,observation.base),"FINALIZED_ECONOMICS_CHANGED");
    }
    const confirmed=ownedRefund(row,observation,p);financialCheck(confirmed,"CORRECTION_UNCONFIRMED");
    const shortfall=Math.max(0,p.subtotalCents-observation.managementNetCents);
    const final=await save({status:shortfall?"EXCEPTION":"CORRECTED",reasonCode:shortfall?"INSUFFICIENT_RFL_FEE":null,stripeRefundId:confirmed.id,
      confirmedCorrectionCents:confirmed.amountCents,unresolvedShortfallCents:shortfall,latestObservation:json(observation),observedManagementNetCents:observation.managementNetCents},true);
    return {kind:"DONE" as const,row:final};
  }catch(error){
    const code=error instanceof FinancialObservationError?error.code:"PROVIDER_OR_PERSISTENCE_UNCONFIRMED";
    const waiting=error instanceof FinancialObservationError&&error.waiting&&!row.reservedAt;
    // If the database itself is unavailable this update may also fail. The
    // committed reservation/lease survives; expiry permits read-only recovery.
    await locked(db,p.id,async(tx)=>{const fresh=await tx.directFinancialReconciliation.findUnique({where:{id:row.id}});financialCheck(fresh&&fresh.leaseToken===token,"WORKER_LEASE_LOST");
      row=await tx.directFinancialReconciliation.update({where:{id:row.id},data:{status:waiting?"WAITING_DATA":"EXCEPTION",reasonCode:code,leaseToken:null,leaseUntil:null}});});
    return {kind:"DONE" as const,row};
  }
}

export const DIRECT_FINANCIAL_EVENTS = new Set(["application_fee.created","application_fee.refunded","application_fee.refund.updated"]);
/** Authenticated platform fee events only observe/enqueue; never execute corrections.
 * Verified legacy fees are audited separately; unknown ownership stays quarantined. */
export async function queueDirectFinancialEvent(db:PrismaClient,stripe:Stripe,event:Stripe.Event) {
  const object=event.data.object as unknown as {id:string;fee?:string|{id:string}};
  const feeId=event.type==="application_fee.refund.updated"?(typeof object.fee==="string"?object.fee:object.fee?.id):object.id;
  financialCheck(feeId&&/^fee_[A-Za-z0-9_]+$/.test(feeId)&&event.account==null,"FINANCIAL_EVENT_OWNERSHIP_MISMATCH");
  const fee=await stripe.applicationFees.retrieve(feeId,{},FINANCIAL_READ);
  const chargeId=typeof fee.charge==="string"?fee.charge:fee.charge.id;
  const byCharge=await db.payment.findUnique({where:{stripeChargeId:chargeId}});
  const originalId=typeof fee.originating_transaction==="string"?fee.originating_transaction:fee.originating_transaction?.id;
  const byOriginal=originalId?await db.payment.findUnique({where:{stripeChargeId:originalId}}):null;
  financialCheck(!byCharge||!byOriginal||byCharge.id===byOriginal.id,"FINANCIAL_EVENT_OWNERSHIP_MISMATCH");
  const p=byCharge??byOriginal;
  if(p&&(p.chargeModel==="LEGACY_DESTINATION"||hasUnknownArchitecture(p))){
    const parent=await readRefundParent(db,stripe,p,event,p.stripeChargeId!);
    const destination=typeof parent.intent.transfer_data?.destination==="string"?parent.intent.transfer_data.destination:parent.intent.transfer_data?.destination?.id;
    const feeAccount=typeof fee.account==="string"?fee.account:fee.account.id;
    const chargeFee=typeof parent.charge.application_fee==="string"?parent.charge.application_fee:parent.charge.application_fee?.id;
    financialCheck(fee.id===feeId&&fee.livemode===event.livemode&&fee.currency==="usd"&&fee.amount===p.platformFeeCents&&
      Number.isSafeInteger(fee.amount_refunded)&&fee.amount_refunded>=0&&fee.amount_refunded<=fee.amount&&
      feeAccount===destination&&chargeFee===fee.id&&(chargeId===p.stripeChargeId||originalId===p.stripeChargeId),"FINANCIAL_EVENT_OWNERSHIP_MISMATCH");
    await locked(db,p.id,async(tx,current)=>{
      financialCheck(isDeepStrictEqual(directFinancialSnapshot(current),directFinancialSnapshot(p)),"EXPECTED_SNAPSHOT_CHANGED");
      const where={actorType:"STRIPE_WEBHOOK",targetType:"PAYMENT",targetId:p.id,metadata:{path:["stripeEventId"],equals:event.id}};
      if(await tx.auditLog.findFirst({where}))return;
      await tx.auditLog.create({data:{id:"stripe-financial-event-"+event.id,businessId:p.businessId,actorType:"STRIPE_WEBHOOK",action:"LEGACY_APPLICATION_FEE_OBSERVED",targetType:"PAYMENT",targetId:p.id,
        metadata:{stripeEventId:event.id,stripeEventType:event.type,applicationFeeId:fee.id,amountCents:fee.amount,refundedCents:fee.amount_refunded,stripeMode:parent.identity.mode}}});
    });
    return;
  }
  financialCheck(p&&p.chargeModel==="DIRECT"&&p.pricingVersion==="RFL_DIRECT_V1","FINANCIAL_EVENT_OWNERSHIP_MISMATCH");
  const mode=classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY??"");financialCheck((mode==="live"||mode==="test")&&event.livemode===(mode==="live")&&fee.livemode===event.livemode,"MODE_MISMATCH");
  const identity={platformAccountId:p.stripePlatformAccountId!,mode};resolveStripePaymentContext(p,identity);
  const [platform,balance]=await Promise.all([stripe.accounts.retrieve(FINANCIAL_READ),stripe.balance.retrieve({},FINANCIAL_READ)]);
  validateStripePaymentIdentity(identity,{platformAccountId:platform.id,livemode:balance.livemode,credentialMode:mode});
  financialCheck((typeof fee.account==="string"?fee.account:fee.account.id)===p.stripeConnectedAccountId&&fee.currency==="usd"&&fee.amount===p.rflApplicationFeeCents&&!fee.originating_transaction,"FINANCIAL_EVENT_OWNERSHIP_MISMATCH");
  await locked(db,p.id,async(tx,current)=>{
    financialCheck(isDeepStrictEqual(directFinancialSnapshot(current),directFinancialSnapshot(p)),"EXPECTED_SNAPSHOT_CHANGED");
    const where={actorType:"STRIPE_WEBHOOK",targetType:"PAYMENT",targetId:p.id,metadata:{path:["stripeEventId"],equals:event.id}};
    if(await tx.auditLog.findFirst({where}))return;
    await queueDirectReconciliation(tx,current);
    await tx.directFinancialReconciliation.update({where:{paymentId:p.id},data:{status:["RETURNED","DISPUTED"].includes(current.status)?"EXCEPTION":"WAITING_DATA",reasonCode:"STRIPE_FINANCIAL_UPDATE",refreshRequested:true}});
    await tx.auditLog.create({data:{id:"stripe-financial-event-"+event.id,businessId:p.businessId,actorType:"STRIPE_WEBHOOK",action:"DIRECT_FINANCIAL_RECONCILIATION_QUEUED",targetType:"PAYMENT",targetId:p.id,
      metadata:{stripeEventId:event.id,stripeEventType:event.type}}});
  });
}
