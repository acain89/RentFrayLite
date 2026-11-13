import { smsPhone } from "@/lib/smsConsent";

export const REGISTRATION_SMS_PHONE_REQUIRED = "Enter a cell phone number to receive text notifications.";
export const REGISTRATION_PHONE_INVALID = "Enter a valid US cell phone number.";

export function normalizeRegistrationPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim();
  if (phone.includes("+") && !/^\+1[()\d .-]*$/.test(phone)) return null;
  return smsPhone(phone);
}

export function formatRegistrationPhone(value: string): string {
  // Preserve invalid input for correction; never truncate it into a valid number.
  if (!/^[+()\d .-]{0,30}$/.test(value) ||
      (value.includes("+") && !/^\+1[()\d .-]*$/.test(value))) return value;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length > 10) return value;
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join("-");
}
