import bcrypt from "bcryptjs";

export async function verifyManagementPassword(
  rawPassword: string,
  storedHash: string
): Promise<boolean> {
  if (!storedHash) return false;

  if (storedHash.startsWith("plain:")) {
    return storedHash === `plain:${rawPassword}`;
  }

  return bcrypt.compare(rawPassword, storedHash);
}