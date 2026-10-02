import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isActiveManagerSession, type SessionAuthority } from "@/lib/sessionAuthority";

export type ManagerMutationIdentity = Pick<SessionAuthority, "id" | "managerId" | "businessId" | "tokenHash">;

export class ManagerMutationUnauthorized extends Error {
  constructor() { super("Authentication required."); }
}

// Business first agrees with checkout/deactivation. NO KEY UPDATE permits
// credential-reset and webhook audit FK KEY SHARE locks; FOR UPDATE would invert
// Business/Manager locks against credential reset's Manager -> audit insertion.
export async function withManagerMutation<T>(
  identity: ManagerMutationIdentity,
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async tx => {
    if (!identity.managerId || !identity.businessId) throw new ManagerMutationUnauthorized();
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${identity.businessId} FOR NO KEY UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Manager" WHERE "id" = ${identity.managerId} FOR NO KEY UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Session" WHERE "id" = ${identity.id} FOR UPDATE`);
    const current = await tx.session.findUnique({ where: { id: identity.id }, include: {
      manager: { include: { business: true } }, business: true, adminAccess: true,
    } });
    const now = async () => (await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`))[0].now;
    if (!current || current.tokenHash !== identity.tokenHash || current.managerId !== identity.managerId ||
      current.businessId !== identity.businessId || !isActiveManagerSession(current) || current.expiresAt <= await now()) {
      throw new ManagerMutationUnauthorized();
    }
    const result = await mutate(tx);
    // Roll back long mutations that crossed expiry. Credential mutations may
    // intentionally delete their own session; locks still serialize revocation.
    if (current.expiresAt <= await now()) throw new ManagerMutationUnauthorized();
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
}
