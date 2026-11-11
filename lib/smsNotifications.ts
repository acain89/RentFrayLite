import { createHash, randomUUID } from "node:crypto";
import type { Business, CheckoutSession, Payment, Prisma } from "@prisma/client";
import { smsPhone, SMS_CONSENT_VERSION } from "@/lib/smsConsent";
export const smsPhoneHash = (phone: string) => createHash("sha256").update("rfl-payment-sms:" + phone).digest("hex");
export function smsEvent(state: string) { return state === "PENDING" ? "PENDING" : state === "PAID" ? "SUCCESSFUL" : ["FAILED","RETURNED","DISPUTED"].includes(state) ? "FAILED" : null; }
const clean = (s: string | null, max: number) => (s ?? "").replace(/[\r\n\x00-\x1f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
export function paymentSmsBody(p: Payment, state: string, recipient: string) {
  const amount = "$" + (p.totalChargedCents / 100).toFixed(2), unit = clean(p.referenceLabel,30) || "unspecified";
  const outcome = state === "RETURNED" ? "was returned" : state === "DISPUTED" ? "is disputed" : state === "PENDING" ? "is processing" : state === "PAID" ? "was successful" : "failed";
  const text = recipient === "TENANT" ? `RentFrayLite: Your ${amount} payment for unit ${unit} ${outcome}.` : `RentFrayLite: ${amount} payment ${state === "RETURNED" ? "returned" : state === "DISPUTED" ? "disputed" : state === "PENDING" ? "pending" : state === "PAID" ? "successful" : "failed"}. Unit ${unit}, ${clean(p.payerFirstName,40)} ${clean(p.payerLastName,40)}.`;
  return text + (recipient === "TENANT" && state === "FAILED" ? " Please return to RFL to try again." : "") + " Reply STOP to opt out.";
}
/** Existing authenticated webhook holds the Payment lock. Only actual applied
 * transitions call this; per-transition keys allow later failures/recoveries. */
export async function queuePaymentSms(tx: Prisma.TransactionClient, p: Payment, checkout: CheckoutSession, business: Business, state: string, transitionKey: string) {
  const eventType = smsEvent(state); if (!eventType) return;
  for (const recipientType of ["TENANT","MANAGEMENT"]) {
    const raw = recipientType === "TENANT" ? p.payerPhone : business.contactPhone;
    const phone = smsPhone(raw);
    const consentAt = recipientType === "TENANT" ? checkout.smsConsentAt : business.smsConsentAt;
    const consentVersion = recipientType === "TENANT" ? checkout.smsConsentVersion : business.smsConsentVersion;
    let reasonCode: string | null = !phone ? "INVALID_PHONE" : !consentAt || consentVersion !== SMS_CONSENT_VERSION ? "CONSENT_ABSENT" : null;
    if (recipientType === "MANAGEMENT" && (business.paymentSmsEnabled !== true || business.smsConsentPhone !== phone)) reasonCode = "MANAGEMENT_DISABLED_OR_UNCONSENTED";
    const phoneHash = smsPhoneHash(phone ?? "invalid");
    if (phone && await tx.smsSuppression.findUnique({where:{phoneHash}})) reasonCode = "OPTED_OUT";
    await tx.smsNotification.upsert({where:{paymentId_recipientType_transitionKey:{paymentId:p.id,recipientType,transitionKey}},
      create:{paymentId:p.id,recipientType,transitionKey,eventType,paymentState:state,phone:phone ?? "",phoneHash,body:paymentSmsBody(p,state,recipientType),
        consentAt:consentAt ?? null,consentVersion:consentVersion ?? null,status:reasonCode ? "SUPPRESSED" : "QUEUED",reasonCode,callbackToken:randomUUID()},update:{}});
  }
}
