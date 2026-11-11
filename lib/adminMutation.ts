import { Prisma, SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionAuthority } from "@/lib/sessionAuthority";

export class AdminMutationUnauthorized extends Error {
  constructor() { super("Unauthorized."); }
}

// Same order as admin issuance/deletion: AdminAccess -> Session -> Business.
// Manager writers use Business -> Manager -> their own (non-admin) Session.
// Holding these rows serializes revocation; database time also catches expiry
// while waiting for locks or doing work, which row locks cannot prevent.
export async function withAdminMutation<T>(
  identity: SessionAuthority,
  businessId: string,
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (identity.type !== SessionType.ADMIN || !identity.adminAccess ||
      identity.adminAccessId !== identity.adminAccess.id || identity.managerId || identity.businessId) {
    throw new AdminMutationUnauthorized();
  }
  const admin = identity.adminAccess;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AdminAccess" WHERE "id" = ${admin.id} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Session" WHERE "id" = ${identity.id} FOR UPDATE`);
    // Keep checkout/deactivation and manager credential writers in one order.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR NO KEY UPDATE`);
    const authorize = async () => {
      const principal = await tx.adminAccess.findUnique({ where: { id: admin.id } });
      const session = await tx.session.findUnique({ where: { id: identity.id } });
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
      if (!principal?.isActive || principal.codeHash !== admin.codeHash || !session ||
          session.type !== SessionType.ADMIN || session.adminAccessId !== admin.id ||
          session.tokenHash !== identity.tokenHash || session.managerId || session.businessId ||
          session.expiresAt <= clock.now) throw new AdminMutationUnauthorized();
    };
    await authorize();
    const result = await mutate(tx);
    await authorize();
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
}
