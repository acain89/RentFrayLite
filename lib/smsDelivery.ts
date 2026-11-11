import { Prisma, type PrismaClient } from "@prisma/client";
import twilio from "twilio";
import { smsPhone, SMS_CONSENT_VERSION } from "@/lib/smsConsent";
import { smsPhoneHash } from "@/lib/smsNotifications";
import { boundedRawBody } from "@/lib/boundedRawBody";
import { CUSTOMER_REFUND_REPORT_SELECT, loadReportingDisputeOutcome, projectPaymentOutcome } from "@/lib/paymentReportingOutcome";
export class SmsCallbackInvalid extends Error {}
type Environment = Record<string,string|undefined>;
export type SmsProvider = {create(input:{to:string;from:string;body:string;statusCallback:string}):Promise<{sid:string}>};
const TX={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:10000,timeout:20000};
export function smsOrigin(env:Environment) {
  const origin=new URL(env.NEXT_PUBLIC_BASE_URL ?? "");
  if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash||["localhost","127.0.0.1","::1"].includes(origin.hostname))throw new Error("SMS_CALLBACK_CONFIGURATION");
  return origin.origin;
}
function configuration(env:Environment){
  const origin=smsOrigin(env),from=smsPhone(env.TWILIO_PHONE_NUMBER);
  if(!from||!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID??"")||!env.TWILIO_AUTH_TOKEN)throw new Error("SMS_PROVIDER_CONFIGURATION");
  return {origin,from};
}
export function twilioSmsProvider(env:Environment=process.env):SmsProvider {
  configuration(env);
  const client=twilio(env.TWILIO_ACCOUNT_SID!,env.TWILIO_AUTH_TOKEN!,{autoRetry:false,maxRetries:0,timeout:8000,logLevel:"error"});
  return {create:input=>client.messages.create(input)};
}
export async function suppressPhone(tx:Prisma.TransactionClient,phone:string,reasonCode:string){
  const phoneHash=smsPhoneHash(phone);
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"sms:"+phoneHash},0))::text`);
  await tx.smsSuppression.upsert({where:{phoneHash},create:{phoneHash,reasonCode},update:{reasonCode}});
  await tx.smsNotification.updateMany({where:{phoneHash,status:"QUEUED"},data:{status:"SUPPRESSED",reasonCode:"OPTED_OUT"}});
}
/** A committed claim is the dispatch reservation. Expired claims NEVER requeue:
 * Twilio may have accepted the original request. Signed callbacks can recover it. */
export async function recoverInterruptedSms(db:PrismaClient,now=new Date()){
  return db.smsNotification.updateMany({where:{status:"SENDING",claimedAt:{lt:new Date(now.getTime()-120000)}},data:{status:"AMBIGUOUS",reasonCode:"WORKER_INTERRUPTED"}});
}
export async function dispatchPaymentSms(db:PrismaClient,provider:SmsProvider,id:string,env:Environment=process.env){
  const now=new Date();
  const claimed=await db.smsNotification.updateMany({where:{id,status:"QUEUED",nextAttemptAt:{lte:now}},data:{status:"SENDING",claimedAt:now,attempts:{increment:1},reasonCode:null}});
  if(claimed.count!==1)return {id,status:"SKIPPED"};
  let attempted=false;
  try{
    const config=configuration(env);
    return await db.$transaction(async tx=>{
      const n=await tx.smsNotification.findUnique({where:{id}});if(!n||n.status!=="SENDING")return {id,status:"SKIPPED"};
      // Same suppression lock as inbound STOP, then Business -> Payment locks.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"sms:"+n.phoneHash},0))::text`);
      const initial=await tx.payment.findUniqueOrThrow({where:{id:n.paymentId}});
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id"=${initial.businessId} FOR NO KEY UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id"=${n.paymentId} FOR UPDATE`);
      const p=await tx.payment.findUniqueOrThrow({where:{id:n.paymentId}}),business=await tx.business.findUniqueOrThrow({where:{id:p.businessId}});
      const checkout=p.checkoutAttemptId?await tx.checkoutSession.findUnique({where:{id:p.checkoutAttemptId}}):null;
      let reason:string|null=null;
      if(smsPhone(n.phone)!==n.phone||smsPhoneHash(n.phone)!==n.phoneHash)reason="INVALID_PHONE";
      else if(!n.consentAt||n.consentVersion!==SMS_CONSENT_VERSION)reason="CONSENT_ABSENT";
      else if(n.recipientType==="TENANT"&&(!checkout||checkout.paymentId!==p.id||smsPhone(checkout.phone)!==n.phone||smsPhone(p.payerPhone)!==n.phone||checkout.smsConsentVersion!==n.consentVersion||checkout.smsConsentAt?.getTime()!==n.consentAt.getTime()))reason="CONSENT_CHANGED";
      else if(n.recipientType==="MANAGEMENT"&&(business.paymentSmsEnabled!==true||business.smsConsentPhone!==n.phone||smsPhone(business.contactPhone)!==n.phone||business.smsConsentVersion!==n.consentVersion||business.smsConsentAt?.getTime()!==n.consentAt.getTime()))reason="MANAGEMENT_DISABLED_OR_UNCONSENTED";
      else if(await tx.smsSuppression.findUnique({where:{phoneHash:n.phoneHash}}))reason="OPTED_OUT";
      else if(p.status!==n.paymentState)reason="SUPERSEDED_PAYMENT_STATE";
      else if(!["TENANT","MANAGEMENT"].includes(n.recipientType))reason="INVALID_RECIPIENT";
      if(!reason){
        // The Payment lock also serializes refund/dispute observation writers.
        // Read durable facts here, never a provider or an enqueue-time snapshot.
        const customerRefunds=await tx.customerRefundObservation.findMany({where:{paymentId:p.id},select:CUSTOMER_REFUND_REPORT_SELECT});
        const outcome=projectPaymentOutcome({...p,customerRefunds,disputeOutcome:await loadReportingDisputeOutcome(tx,p)});
        if(customerRefunds.length&&outcome.refundState==="UNKNOWN")reason="REFUND_OUTCOME_UNVERIFIED";
        else if(["FULL","PARTIAL","PENDING"].includes(outcome.refundState))reason="SUPERSEDED_REFUND_OUTCOME";
        else if(n.paymentState==="DISPUTED"&&outcome.disputeOutcome!=="ACTIVE")reason="SUPERSEDED_DISPUTE_OUTCOME";
        else if(n.paymentState==="PAID"&&outcome.disputeOutcome&&outcome.disputeOutcome!=="WON")reason="SUPERSEDED_DISPUTE_OUTCOME";
      }
      if(reason){await tx.smsNotification.update({where:{id},data:{status:"SUPPRESSED",reasonCode:reason}});return {id,status:"SKIPPED"};}
      const callback=config.origin+"/api/twilio/status?notification="+encodeURIComponent(id)+"&token="+encodeURIComponent(n.callbackToken);
      attempted=true;
      const message=await provider.create({to:n.phone,from:config.from,body:n.body,statusCallback:callback});
      if(!/^SM[0-9a-f]{32}$/i.test(message.sid))throw new Error("PROVIDER_RESPONSE_UNCONFIRMED");
      await tx.smsNotification.update({where:{id},data:{status:"SENT",providerMessageId:message.sid,sentAt:new Date(),reasonCode:null}});
      // Keep the existing success receipt surface truthful without rewriting sent history.
      if(n.recipientType==="TENANT"&&n.eventType==="SUCCESSFUL")await tx.smsReceipt.updateMany({where:{paymentId:p.id,status:"QUEUED"},data:{status:"SENT",providerMessageId:message.sid,sentAt:new Date(),failureMessage:null}});
      return {id,status:"SENT"};
    },TX);
  }catch(error){
    const e=error as {status?:number;code?:number};
    const n=await db.smsNotification.findUnique({where:{id}});if(!n)return {id,status:"FAILED"};
    const opted=attempted&&e.status===400&&e.code===21610;
    const retry=(!attempted||e.status===429)&&n.attempts<3;
    const definitive=attempted&&e.status!=null&&e.status>=400&&e.status<500;
    const status=opted?"SUPPRESSED":retry?"QUEUED":!attempted||definitive?"FAILED":"AMBIGUOUS";
    const reasonCode=opted?"OPTED_OUT":retry?"SAFE_RETRY_PENDING":status==="AMBIGUOUS"?"PROVIDER_ACCEPTANCE_UNCONFIRMED":"DISPATCH_REJECTED";
    await db.$transaction(async tx=>{
      if(opted)await suppressPhone(tx,n.phone,"TWILIO_21610");
      await tx.smsNotification.updateMany({where:{id,status:"SENDING"},data:{status,reasonCode,nextAttemptAt:new Date(Date.now()+60000*Math.max(1,n.attempts))}});
    },TX);
    return {id,status:retry?"SKIPPED":"FAILED",reason:reasonCode};
  }
}
/** Canonical configured origin, never forwarded Host. Validate every form field,
 * including unknown future Twilio fields, using the official signature verifier. */
export async function verifiedTwilioForm(request:Request,path:string,env:Environment=process.env){
  const config=configuration(env),url=new URL(request.url);
  if(url.pathname!==path||!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))throw new SmsCallbackInvalid("INVALID_CALLBACK");
  if(!request.headers.get("x-twilio-signature")||Number(request.headers.get("content-length")??0)>16384)throw new SmsCallbackInvalid("INVALID_CALLBACK");
  let raw:string;
  try { raw=new TextDecoder("utf-8",{fatal:true}).decode(await boundedRawBody(request,16384)); }
  catch { throw new SmsCallbackInvalid("INVALID_CALLBACK"); }
  const form=new URLSearchParams(raw),params:Record<string,string>={};
  for(const [k,v]of form){if(Object.hasOwn(params,k))throw new SmsCallbackInvalid("INVALID_CALLBACK");params[k]=v;}
  if(params.AccountSid!==env.TWILIO_ACCOUNT_SID||!twilio.validateRequest(env.TWILIO_AUTH_TOKEN!,request.headers.get("x-twilio-signature")??"",config.origin+path+url.search,params))throw new SmsCallbackInvalid("INVALID_SIGNATURE");
  return {params,url,config};
}
export async function applySmsStatus(db:PrismaClient,request:Request,env:Environment=process.env){
  const {params,url,config}=await verifiedTwilioForm(request,"/api/twilio/status",env);
  const id=url.searchParams.get("notification"),token=url.searchParams.get("token");
  if(!id||!token||!/^SM[0-9a-f]{32}$/i.test(params.MessageSid??""))throw new SmsCallbackInvalid("INVALID_CALLBACK");
  return db.$transaction(async tx=>{
    const initial=await tx.smsNotification.findUnique({where:{id}});if(!initial||initial.callbackToken!==token)throw new SmsCallbackInvalid("UNKNOWN_CALLBACK");
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"sms:"+initial.phoneHash},0))::text`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SmsNotification" WHERE "id"=${id} FOR UPDATE`);
    const n=await tx.smsNotification.findUniqueOrThrow({where:{id}});
    if(n.callbackToken!==token||(n.providerMessageId&&n.providerMessageId!==params.MessageSid)||params.To!==n.phone||params.From!==config.from)throw new SmsCallbackInvalid("CALLBACK_OWNERSHIP_MISMATCH");
    if(!["SENDING","AMBIGUOUS","SENT","DELIVERED","FAILED"].includes(n.status))throw new SmsCallbackInvalid("UNRESERVED_CALLBACK");
    if(params.ErrorCode==="21610")await suppressPhone(tx,n.phone,"TWILIO_21610");
    if(n.status==="DELIVERED")return;
    const state=params.MessageStatus;
    if(state==="delivered")await tx.smsNotification.update({where:{id},data:{status:"DELIVERED",providerMessageId:params.MessageSid,deliveredAt:new Date(),reasonCode:null}});
    else if(["failed","undelivered"].includes(state))await tx.smsNotification.update({where:{id},data:{status:"FAILED",providerMessageId:params.MessageSid,reasonCode:params.ErrorCode==="21610"?"OPTED_OUT":"PROVIDER_DELIVERY_FAILED"}});
    else if(["queued","accepted","sending","sent"].includes(state)&&n.status!=="FAILED")await tx.smsNotification.update({where:{id},data:{status:"SENT",providerMessageId:params.MessageSid,reasonCode:null}});
  },TX);
}
export async function applySmsOptOut(db:PrismaClient,request:Request,env:Environment=process.env){
  const {params,config}=await verifiedTwilioForm(request,"/api/twilio/inbound",env);
  const phone=smsPhone(params.From);if(!phone||params.To!==config.from||!/^SM[0-9a-f]{32}$/i.test(params.MessageSid??""))throw new SmsCallbackInvalid("INVALID_INBOUND");
  const word=(params.OptOutType??params.Body??"").trim().toUpperCase();
  if(["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT","REVOKE","OPTOUT"].includes(word))await db.$transaction(tx=>suppressPhone(tx,phone,"RECIPIENT_STOP"),TX);
  // Advanced Opt-Out already replies when OptOutType is present; avoid a second reply.
  // Fixed text only, never reflect user input or invent a public support URL.
  if(word==="HELP"&&!params.OptOutType)return "<Response><Message>RentFrayLite payment-status texts. Contact your property manager for help. Reply STOP to opt out.</Message></Response>";
  // START never resurrects old transaction consent or replays old messages.
  return "<Response/>";
}
