import type { Business, Prisma } from "@prisma/client";
import { smsPhone, SMS_CONSENT_VERSION } from "@/lib/smsConsent";
export class SmsSettingsInvalid extends Error {}
export async function updateManagementSms(tx:Prisma.TransactionClient,business:Business,input:unknown){
  if(!input||typeof input!=="object")throw new SmsSettingsInvalid("Invalid settings.");
  const body=input as Record<string,unknown>;
  if(Object.keys(body).some(k=>!["enabled","phone","consent"].includes(k))||typeof body.enabled!=="boolean"||typeof body.consent!=="boolean")throw new SmsSettingsInvalid("Invalid settings.");
  if(!body.enabled){const result=await tx.business.update({where:{id:business.id},data:{paymentSmsEnabled:false}});await tx.auditLog.create({data:{businessId:business.id,actorType:"MANAGER",action:"PAYMENT_SMS_PREFERENCE_UPDATED",targetType:"BUSINESS",targetId:business.id,metadata:{enabled:false}}});return result;}
  const phone=smsPhone(body.phone);
  if(!phone)throw new SmsSettingsInvalid("Enter a valid U.S. mobile phone number.");
  const retained=business.paymentSmsEnabled===true&&business.smsConsentAt&&business.smsConsentVersion===SMS_CONSENT_VERSION&&business.smsConsentPhone===phone;
  if(!body.consent&&!retained)throw new SmsSettingsInvalid("Affirmative SMS consent is required to turn notifications on.");
  // An application preference must never clear a provider/application STOP.
  const result=await tx.business.update({where:{id:business.id},data:{paymentSmsEnabled:true,contactPhone:phone,
    ...(body.consent?{smsConsentPhone:phone,smsConsentAt:new Date(),smsConsentVersion:SMS_CONSENT_VERSION}:{})}});
  await tx.auditLog.create({data:{businessId:business.id,actorType:"MANAGER",action:"PAYMENT_SMS_PREFERENCE_UPDATED",targetType:"BUSINESS",targetId:business.id,metadata:{enabled:true,consentVersion:SMS_CONSENT_VERSION}}});
  return result;
}
