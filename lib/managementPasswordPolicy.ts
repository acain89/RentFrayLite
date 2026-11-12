/** Shared browser/server policy for newly chosen management passwords only. */
export const MANAGEMENT_PASSWORD_MIN_LENGTH = 8;
export const MANAGEMENT_PASSWORD_MAX_LENGTH = 72;
export const MANAGEMENT_PASSWORD_REQUIREMENT = "Use at least 8 characters excluding outer whitespace, with an uppercase letter (A-Z), a lowercase letter (a-z), and a digit (0-9). Special characters are optional. Maximum 72 UTF-8 bytes; NUL and malformed Unicode are not supported.";

export function managementPasswordChecks(value: unknown) {
  const text = typeof value === "string" && value.length <= MANAGEMENT_PASSWORD_MAX_LENGTH ? value : "";
  // Count UTF-8 bytes without a Node-only dependency in client bundles.
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return {
    minimumLength: Array.from(text.trim()).length >= MANAGEMENT_PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(text),
    lowercase: /[a-z]/.test(text),
    digit: /[0-9]/.test(text),
    safeEncoding: typeof value === "string" && value.length <= MANAGEMENT_PASSWORD_MAX_LENGTH && bytes <= 72 &&
      !text.includes("\0") && !/[\uD800-\uDFFF]/u.test(text),
  };
}

export function isNewManagementPassword(value: unknown): value is string {
  const checks = managementPasswordChecks(value);
  return checks.minimumLength && checks.uppercase && checks.lowercase && checks.digit && checks.safeEncoding;
}
