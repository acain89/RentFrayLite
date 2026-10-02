import { BusinessStatus, Prisma } from "@prisma/client";

// Recheck after locking: an earlier readiness observation cannot authorize
// ownership after administrator deactivation or deletion.
export async function lockActiveCheckoutBusiness(tx: Prisma.TransactionClient, businessId: string) {
  // NO KEY UPDATE serializes administrators and checkout writers without
  // blocking webhook audit inserts' foreign-key KEY SHARE lock.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR NO KEY UPDATE`);
  const business = await tx.business.findUnique({ where: { id: businessId } });
  return business?.isActive && business.status !== BusinessStatus.DISABLED ? business : null;
}
