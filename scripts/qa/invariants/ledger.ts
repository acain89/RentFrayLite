import { prisma } from "../db";
import { expect } from "../reporter";

export async function verifyLedgerInvariants(input: {
  name: string;
  propertyId: string;
}): Promise<void> {
  const duplicateRentGroups = await prisma.ledgerEntry.groupBy({
    by: ["unitId", "tenantAssignmentId", "billingCycle", "chargeType"],
    where: {
      propertyId: input.propertyId,
      entryType: "CHARGE",
      chargeType: "RENT",
      voidedAt: null,
    },
    _count: { id: true },
    having: {
      id: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  expect(
    `${input.name} invariant: no duplicate rent charges per unit/cycle`,
    duplicateRentGroups.length === 0,
    `duplicates ${duplicateRentGroups.length}`
  );

  const orphanPaymentLedgerCount = await prisma.ledgerEntry.count({
    where: {
      propertyId: input.propertyId,
      entryType: "PAYMENT",
      paymentId: null,
      voidedAt: null,
    },
  });

  expect(
    `${input.name} invariant: payment ledger entries have payment records`,
    orphanPaymentLedgerCount === 0,
    `orphans ${orphanPaymentLedgerCount}`
  );

  const processingFeeRentCycleCount = await prisma.ledgerEntry.count({
    where: {
      propertyId: input.propertyId,
      chargeType: "PROCESSING_FEE",
      entryType: {
        not: "CHARGE",
      },
      voidedAt: null,
    },
  });

  expect(
    `${input.name} invariant: processing fees are charge entries only`,
    processingFeeRentCycleCount === 0,
    `bad processing fee rows ${processingFeeRentCycleCount}`
  );

  const invalidAmountCount = await prisma.ledgerEntry.count({
    where: {
      propertyId: input.propertyId,
      amountCents: 0,
      voidedAt: null,
    },
  });

  expect(
    `${input.name} invariant: no zero-dollar ledger rows`,
    invalidAmountCount === 0,
    `zero rows ${invalidAmountCount}`
  );
}