import { prisma } from "./db";

export async function getRentFrayLedgerOutstandingCents(input: {
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string;
}): Promise<number> {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      propertyId: input.propertyId,
      unitId: input.unitId,
      tenantAssignmentId: input.tenantAssignmentId,
      voidedAt: null,
    },
    select: {
      entryType: true,
      amountCents: true,
      payment: {
        select: {
          status: true,
        },
      },
    },
  });

  const total = entries.reduce((sum, entry) => {
    const entryType = String(entry.entryType).toUpperCase();

    if (entryType === "CHARGE") return sum + Math.abs(entry.amountCents);
    if (entryType === "CREDIT") return sum - Math.abs(entry.amountCents);
    if (entryType === "ADJUSTMENT") return sum + entry.amountCents;

    if (entryType === "PAYMENT") {
      const status = String(entry.payment?.status ?? "").toUpperCase();
      return status === "PAID" ? sum - Math.abs(entry.amountCents) : sum;
    }

    return sum;
  }, 0);

  return Math.max(0, total);
}