import { Buffer } from "node:buffer";

// bcrypt accepts at most 72 UTF-8 bytes. Preserve whitespace and Unicode exactly;
// reject overflow rather than silently authenticating only a credential prefix.
// NUL repetition can reproduce a shorter bcrypt key; reject it and lossy UTF-8.
export function isStrongAdminCredential(value: unknown): value is string {
  return typeof value === "string" && value.length <= 72 &&
    Array.from(value.trim()).length >= 16 && Buffer.byteLength(value, "utf8") <= 72 && value.trim().length > 0 &&
    !value.includes("\0") && Buffer.from(value, "utf8").toString("utf8") === value;
}

export function requireStrongAdminCredential(value: unknown): string {
  if (!isStrongAdminCredential(value)) {
    throw new Error("SEED_ADMIN_CODE must contain at least 16 characters excluding outer whitespace and at most 72 UTF-8 bytes; legacy six-digit codes, NUL characters, and malformed Unicode are not permitted.");
  }
  return value;
}
