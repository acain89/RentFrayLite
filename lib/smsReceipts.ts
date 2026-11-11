import { prisma } from "@/lib/prisma";
import { dispatchPaymentSms, recoverInterruptedSms, twilioSmsProvider } from "@/lib/smsDelivery";
export type SmsDispatchResult={status:"SENT"|"SKIPPED"|"FAILED";receiptId:string;reason?:string;providerMessageId?:string};
/** Historical receipts have no affirmative consent evidence. Preserve them, but
 * never dispatch them through the obsolete one-success-per-payment sender. */
export async function dispatchSmsReceipt(receiptId:string):Promise<SmsDispatchResult>{
  const receipt=await prisma.smsReceipt.findUnique({where:{id:receiptId}});
  if(!receipt||receipt.status!=="QUEUED")return {status:"SKIPPED",receiptId,reason:"NOT_QUEUED"};
  const notification=await prisma.smsNotification.findFirst({where:{paymentId:receipt.paymentId,recipientType:"TENANT",eventType:"SUCCESSFUL"},orderBy:{createdAt:"desc"}});
  if(notification&&["QUEUED","SENDING","AMBIGUOUS"].includes(notification.status))return {status:"SKIPPED",receiptId,reason:"HANDLED_BY_OUTBOX"};
  const sent=notification&&["SENT","DELIVERED"].includes(notification.status)&&notification.providerMessageId;
  await prisma.smsReceipt.updateMany({where:{id:receiptId,status:"QUEUED"},data:sent?{status:"SENT",providerMessageId:notification.providerMessageId,sentAt:notification.sentAt??notification.deliveredAt,failureMessage:null}:{status:"FAILED",failureMessage:notification?"SMS_NOT_SENT":"LEGACY_CONSENT_UNVERIFIED"}});
  return {status:"SKIPPED",receiptId,reason:notification?"HANDLED_BY_OUTBOX":"LEGACY_CONSENT_UNVERIFIED"};
}
export async function processQueuedSmsReceipts(limit=20):Promise<SmsDispatchResult[]>{
  await recoverInterruptedSms(prisma);
  await prisma.smsReceipt.updateMany({where:{status:"SENDING",updatedAt:{lt:new Date(Date.now()-120000)}},data:{status:"FAILED",failureMessage:"LEGACY_DISPATCH_UNCONFIRMED"}});
  const rows=await prisma.smsNotification.findMany({where:{status:"QUEUED",nextAttemptAt:{lte:new Date()}},orderBy:{createdAt:"asc"},take:Math.min(Math.max(Math.trunc(limit)||1,1),100),select:{id:true}});
  // Provider construction is lazy, inside dispatch, so missing config never
  // escapes with raw Twilio details or leaves an unreserved delivery attempt.
  const provider={create:(input:Parameters<ReturnType<typeof twilioSmsProvider>["create"]>[0])=>twilioSmsProvider().create(input)};
  const results:SmsDispatchResult[]=[];
  for(const row of rows){const r=await dispatchPaymentSms(prisma,provider,row.id);results.push({receiptId:row.id,status:r.status as SmsDispatchResult["status"],...("reason" in r?{reason:r.reason}: {})});}
  const legacy=await prisma.smsReceipt.findMany({where:{status:"QUEUED"},take:Math.min(Math.max(Math.trunc(limit)||1,1),100),select:{id:true}});
  for(const row of legacy)results.push(await dispatchSmsReceipt(row.id));
  return results;
}
