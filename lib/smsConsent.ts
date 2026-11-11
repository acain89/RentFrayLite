export const SMS_CONSENT_VERSION = "rfl-payment-sms-2026-10-v1";
export const TENANT_SMS_DISCLOSURE = "I agree to receive automated RentFrayLite payment-status texts at the number I provided for this transaction, including processing, success, failure, return, or dispute updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is optional and is not a condition of payment.";
export const MANAGEMENT_SMS_DISCLOSURE = "I am authorized to use this number and agree to receive automated RentFrayLite payment-status texts for this property. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is optional. Turn Payment SMS Notifications off at any time.";
export function smsPhone(value: unknown): string | null {
  if (typeof value !== "string" || !/^[+()\d .-]{1,30}$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  const number = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(number) ? "+1" + number : null;
}
export function checkoutSmsConsent(value: unknown, now = new Date()) {
  if (value !== undefined && typeof value !== "boolean") throw new Error("SMS consent must be true or false.");
  return {smsConsentAt: value === true ? now : null, smsConsentVersion: value === true ? SMS_CONSENT_VERSION : null};
}
