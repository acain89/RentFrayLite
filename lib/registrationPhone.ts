

export const REGISTRATION_PHONE_INVALID = "Enter a valid US cell phone number.";

export function normalizeRegistrationPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim();
  if (!/^[+()\d .-]{1,30}$/.test(phone)) return null;
  if (phone.includes("+") && !/^\+1[()\d .-]*$/.test(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? "+1" + national : null;
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
