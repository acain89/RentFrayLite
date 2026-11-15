// ADMIN codes are six ASCII digits. Keep them as strings so leading zeroes
// survive; never trim, coerce numbers or normalize Unicode lookalikes.
export function isAdminCredential(value: unknown): value is string {
  return typeof value === "string" && value.length === 6 && /^[0-9]{6}$/.test(value);
}

export function requireAdminCredential(value: unknown): string {
  if (!isAdminCredential(value)) {
    throw new Error("SEED_ADMIN_CODE must contain exactly 6 numeric digits (0-9).");
  }
  return value;
}
