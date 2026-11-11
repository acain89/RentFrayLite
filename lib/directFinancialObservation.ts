import type Stripe from "stripe";
import type { Payment, CheckoutSession } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { directPaymentMatchesCheckoutArchitecture } from "@/lib/paymentArchitectureSnapshot";
import { resolveStripePaymentContext, stripePaymentRequestOptions, validateStripePaymentIdentity, classifyStripeCredentialMode, type StripePaymentIdentity } from "@/lib/stripePaymentContext";

export class FinancialObservationError extends Error {
  constructor(public readonly code: string, public readonly waiting = false) { super(code); }
}
export function financialCheck(value: unknown, code: string): asserts value { if (!value) throw new FinancialObservationError(code); }
const id = (value: unknown): string | null => typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
const cents = (value: number) => Number.isSafeInteger(value);
export const FINANCIAL_READ: Stripe.RequestOptions = { timeout: 5000, maxNetworkRetries: 0 };

/** Immutable expected economics/identity only. No payer PII; actual provider
 * references and observations are captured separately once available. */
export type FinancialSnapshotPayment = Pick<Payment, "id" | "checkoutAttemptId" | "businessId" | "sourceType" | "sourceId" | "paymentMethod" | "stripePlatformAccountId" | "stripeConnectedAccountId" | "stripeMode" | "chargeModel" | "pricingVersion" | "stripeCheckoutSessionId" | "subtotalCents" | "platformFeeCents" | "totalChargedCents" | "expectedStripeProcessingFeeCents" | "rflApplicationFeeCents" | "businessProceedsCents">;
export function directFinancialSnapshot(p: FinancialSnapshotPayment) {
  return { paymentId: p.id, checkoutAttemptId: p.checkoutAttemptId, businessId: p.businessId, sourceType: p.sourceType, sourceId: p.sourceId,
    paymentMethod: p.paymentMethod, platformAccountId: p.stripePlatformAccountId, connectedAccountId: p.stripeConnectedAccountId, mode: p.stripeMode,
    chargeModel: p.chargeModel, pricingVersion: p.pricingVersion, checkoutSessionId: p.stripeCheckoutSessionId,
    obligationCents: p.subtotalCents, tenantSurchargeCents: p.platformFeeCents, tenantTotalCents: p.totalChargedCents,
    expectedProcessorFeeCents: p.expectedStripeProcessingFeeCents, expectedApplicationFeeCents: p.rflApplicationFeeCents,
    expectedManagementNetCents: p.businessProceedsCents };
}
function available(txn: Stripe.BalanceTransaction) {
  if (txn.status === "pending") throw new FinancialObservationError("FINANCIAL_DATA_PENDING", true);
  financialCheck(txn.status === "available" && txn.currency === "usd" && txn.exchange_rate == null &&
    [txn.amount,txn.fee,txn.net].every(cents) && txn.net === txn.amount - txn.fee, "BALANCE_TRANSACTION_INCONSISTENT");
}
function refundMetadata(refund: Stripe.FeeRefund) { return { id: refund.id, amountCents: refund.amount, operationId: refund.metadata?.rflReconciliationId ?? null,
  paymentId: refund.metadata?.rflPaymentId ?? null, platformId: refund.metadata?.rflPlatformAccountId ?? null,
  connectedId: refund.metadata?.rflConnectedAccountId ?? null, mode: refund.metadata?.rflMode ?? null }; }

/** Connected charge economics and credits are read in captured account scope.
 * ApplicationFee receipts/refund debits belong to the platform and are read
 * there. Balance transactions/FeeRefunds have no livemode field: their actual
 * authenticated scope plus verified parent fee establishes mode, never metadata. */
export async function observeDirectEconomics(stripe: Stripe, p: Payment, checkout: CheckoutSession, identity: StripePaymentIdentity) {
  financialCheck(p.chargeModel === "DIRECT" && p.pricingVersion === "RFL_DIRECT_V1", "NOT_DIRECT_PAYMENT");
  if (["CREATED","CHECKOUT_STARTED","PENDING"].includes(p.status)) throw new FinancialObservationError("PAYMENT_NOT_SETTLED", true);
  financialCheck(p.status === "PAID" && !!p.paidAt, "FINANCIAL_EVENT_REVIEW");
  financialCheck(checkout.paymentId === p.id && directPaymentMatchesCheckoutArchitecture(p,checkout) &&
    checkout.paymentMethod === p.paymentMethod && isDeepStrictEqual(checkout.lineItems,p.lineItemsSnapshot), "LOCAL_OWNERSHIP_MISMATCH");
  const context = resolveStripePaymentContext(p,identity), scoped = { ...FINANCIAL_READ, ...stripePaymentRequestOptions(context) };
  const [platform,balance,connectedBalance] = await Promise.all([stripe.accounts.retrieve(FINANCIAL_READ),stripe.balance.retrieve({},FINANCIAL_READ),stripe.balance.retrieve({},scoped)]);
  validateStripePaymentIdentity(identity,{platformAccountId:platform.id,livemode:balance.livemode,credentialMode:classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY??"")});
  financialCheck(connectedBalance.livemode === balance.livemode,"MODE_MISMATCH");
  financialCheck(p.stripePaymentIntentId && p.stripeChargeId && p.stripeCheckoutSessionId,"PROVIDER_IDENTITY_MISSING");
  const [session,intent,charge] = await Promise.all([
    stripe.checkout.sessions.retrieve(p.stripeCheckoutSessionId,{},scoped),stripe.paymentIntents.retrieve(p.stripePaymentIntentId,{},scoped),stripe.charges.retrieve(p.stripeChargeId,{},scoped),
  ]);
  const metadata = {product:"RentFrayLite",sourceType:p.sourceType,accountCode:checkout.accountCode,billingCycle:p.billingCycle??"",paymentId:p.id,checkoutSessionId:checkout.id,checkoutAttemptId:checkout.id,businessId:p.businessId,chargeModel:"DIRECT",pricingVersion:"RFL_DIRECT_V1",
    stripePlatformAccountId:context.platformAccountId,stripeConnectedAccountId:context.connectedAccountId,stripeMode:context.mode};
  financialCheck([session,intent,charge].every(object=>object.livemode === (context.mode === "live")),"MODE_MISMATCH");
  financialCheck(Object.entries(metadata).every(([key,value])=>session.metadata?.[key]===value&&intent.metadata?.[key]===value),"PROVIDER_METADATA_MISMATCH");
  financialCheck(session.id===p.stripeCheckoutSessionId&&session.mode==="payment"&&session.client_reference_id===p.id&&session.currency==="usd"&&session.amount_total===p.totalChargedCents&&id(session.payment_intent)===intent.id&&
    intent.id===p.stripePaymentIntentId&&intent.status==="succeeded"&&intent.amount===p.totalChargedCents&&intent.amount_received===p.totalChargedCents&&intent.currency==="usd"&&
    intent.application_fee_amount===p.rflApplicationFeeCents&&!intent.transfer_data&&!intent.on_behalf_of&&id(intent.latest_charge)===charge.id&&
    charge.id===p.stripeChargeId&&id(charge.payment_intent)===intent.id&&charge.status==="succeeded"&&charge.paid&&charge.captured&&charge.amount===p.totalChargedCents&&charge.amount_captured===p.totalChargedCents&&charge.currency==="usd"&&
    charge.payment_method_details?.type===(p.paymentMethod==="ACH"?"us_bank_account":"card"),"CHARGE_OWNERSHIP_MISMATCH");
  financialCheck(!charge.refunded&&charge.amount_refunded===0,"FINANCIAL_EVENT_REVIEW");
  if(charge.disputed||p.disputedAt){const disputes=await stripe.disputes.list({charge:charge.id,limit:100},scoped);financialCheck(disputes.has_more===false&&disputes.data.length>0&&disputes.data.every(d=>id(d.charge)===charge.id&&id(d.payment_intent)===intent.id&&d.livemode===(context.mode==="live")&&["won","warning_closed","prevented"].includes(d.status)),"FINANCIAL_EVENT_REVIEW");}
  const chargeTxnId=id(charge.balance_transaction),feeId=id(charge.application_fee);
  if(!chargeTxnId||!feeId)throw new FinancialObservationError("FINANCIAL_DATA_MISSING",true);
  const [txn,fee]=await Promise.all([stripe.balanceTransactions.retrieve(chargeTxnId,{},scoped),stripe.applicationFees.retrieve(feeId,{},FINANCIAL_READ)]);
  available(txn);
  financialCheck(txn.id===chargeTxnId&&id(txn.source)===charge.id&&["charge","payment"].includes(txn.type)&&txn.amount===p.totalChargedCents,"CHARGE_BALANCE_MISMATCH");
  financialCheck(fee.id===feeId&&fee.livemode===(context.mode==="live")&&id(fee.account)===context.connectedAccountId&&id(fee.charge)===charge.id&&!fee.originating_transaction&&
    /^ca_[A-Za-z0-9]+$/.test(id(fee.application)??"")&&fee.currency==="usd"&&fee.amount===p.rflApplicationFeeCents&&cents(fee.amount_refunded)&&fee.amount_refunded>=0&&fee.amount_refunded<=fee.amount,"APPLICATION_FEE_OWNERSHIP_MISMATCH");
  let processor=0,application=0;
  for(const detail of txn.fee_details){financialCheck(detail.currency==="usd"&&cents(detail.amount)&&detail.amount>=0,"FEE_BREAKDOWN_INVALID");if(detail.type==="stripe_fee")processor+=detail.amount;else if(detail.type==="application_fee"){financialCheck(!detail.application||detail.application===id(fee.application),"APPLICATION_FEE_OWNERSHIP_MISMATCH");application+=detail.amount;}else throw new FinancialObservationError("UNSUPPORTED_PROCESSING_COST");}
  financialCheck(cents(processor)&&application===fee.amount&&txn.fee===processor+application,"FEE_BREAKDOWN_INCOMPLETE");
  const feeTxnId=id(fee.balance_transaction);if(!feeTxnId)throw new FinancialObservationError("FINANCIAL_DATA_MISSING",true);
  const feeTxn=await stripe.balanceTransactions.retrieve(feeTxnId,{},FINANCIAL_READ);available(feeTxn);
  financialCheck(feeTxn.id===feeTxnId&&feeTxn.type==="application_fee"&&id(feeTxn.source)===fee.id&&feeTxn.amount===fee.amount&&feeTxn.fee===0&&feeTxn.net===fee.amount,"APPLICATION_FEE_RECEIPT_MISMATCH");
  const list=await stripe.applicationFees.listRefunds(fee.id,{limit:100},FINANCIAL_READ);financialCheck(list.has_more===false,"REFUND_HISTORY_INCOMPLETE");
  let credits=0;const refunds=[];
  for(const refund of list.data){financialCheck(refund.object==="fee_refund"&&id(refund.fee)===fee.id&&refund.currency==="usd"&&cents(refund.amount)&&refund.amount>0,"FEE_REFUND_OWNERSHIP_MISMATCH");
    const debitId=id(refund.balance_transaction);if(!debitId)throw new FinancialObservationError("CORRECTION_DATA_PENDING",true);
    const [debit,creditList]=await Promise.all([stripe.balanceTransactions.retrieve(debitId,{},FINANCIAL_READ),stripe.balanceTransactions.list({source:refund.id,limit:100},scoped)]);
    available(debit);financialCheck(debit.id===debitId&&debit.type==="application_fee_refund"&&id(debit.source)===refund.id&&debit.amount===-refund.amount&&debit.fee===0&&debit.net===-refund.amount,"FEE_REFUND_DEBIT_MISMATCH");
    if(!creditList.data.length)throw new FinancialObservationError("CORRECTION_DATA_PENDING",true);
    financialCheck(creditList.has_more===false&&creditList.data.length===1,"FEE_REFUND_CREDIT_AMBIGUOUS");const credit=creditList.data[0];available(credit);
    financialCheck(credit.type==="application_fee_refund"&&id(credit.source)===refund.id&&credit.amount===refund.amount&&credit.fee===0&&credit.net===refund.amount,"FEE_REFUND_CREDIT_MISMATCH");credits+=credit.net;
    refunds.push({...refundMetadata(refund),platformDebitId:debit.id,connectedCreditId:credit.id});
  }
  financialCheck(cents(credits)&&credits===fee.amount_refunded&&new Set(refunds.map(r=>r.id)).size===refunds.length,"FEE_REFUND_TOTAL_MISMATCH");
  refunds.sort((a,b)=>a.id.localeCompare(b.id));
  return {observedAt:new Date().toISOString(),base:{intentId:intent.id,chargeId:charge.id,chargeTransactionId:txn.id,applicationFeeId:fee.id,applicationId:id(fee.application),applicationFeeTransactionId:feeTxn.id,
    grossCents:txn.amount,processorFeeCents:processor,applicationFeeCents:application,chargeNetCents:txn.net},refunds,refundedCents:credits,
    managementNetCents:txn.net+credits,remainingApplicationFeeCents:fee.amount-fee.amount_refunded};
}
export type DirectEconomics = Awaited<ReturnType<typeof observeDirectEconomics>>;
