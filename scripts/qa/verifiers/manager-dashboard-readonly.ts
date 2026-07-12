import { getCycleCollectedCents, getCycleExpectedCents, type QaAccount } from "../account-model";
import { prisma } from "../db";
import { expect } from "../reporter";

function normalizeEntryType(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeChargeType(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizePaymentStatus(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export async function verifyManagerReadonlySnapshot(input: {
  name: string;
  qaAccount: QaAccount;
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string;
  billingCycle: string;
}): Promise<void> {
  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      propertyId: input.propertyId,
      unitId: input.unitId,
      tenantAssignmentId: input.tenantAssignmentId,
      billingCycle: input.billingCycle,
      voidedAt: null,
    },
    select: {
      entryType: true,
      chargeType: true,
      amountCents: true,
      payment: {
        select: {
          status: true,
        },
      },
    },
  });

  const currentCycleExpectedCents = ledgerEntries.reduce((sum, entry) => {
    const entryType = normalizeEntryType(entry.entryType);
    const chargeType = normalizeChargeType(entry.chargeType);

    if (chargeType === "PROCESSING_FEE") return sum;
    if (entryType === "PAYMENT") return sum;

    if (entryType === "CHARGE") return sum + Math.abs(entry.amountCents);
    if (entryType === "CREDIT") return sum - Math.abs(entry.amountCents);
    if (entryType === "ADJUSTMENT") return sum + entry.amountCents;

    return sum;
  }, 0);

  const currentCycleCollectedCents = ledgerEntries.reduce((sum, entry) => {
    const entryType = normalizeEntryType(entry.entryType);
    const paymentStatus = normalizePaymentStatus(entry.payment?.status);

    if (entryType !== "PAYMENT") return sum;
    if (paymentStatus !== "PAID") return sum;

    return sum + Math.abs(entry.amountCents);
  }, 0);

  const qaExpectedCents = getCycleExpectedCents(
    input.qaAccount,
    input.billingCycle
  );

  const qaCollectedCents = getCycleCollectedCents(
    input.qaAccount,
    input.billingCycle
  );

  expect(
    `${input.name} manager current-cycle expected`,
    currentCycleExpectedCents === qaExpectedCents,
    `RentFray ${currentCycleExpectedCents}, QA ${qaExpectedCents}`
  );

  expect(
    `${input.name} manager current-cycle collected`,
    currentCycleCollectedCents === qaCollectedCents,
    `RentFray ${currentCycleCollectedCents}, QA ${qaCollectedCents}`
  );

  expect(
    `${input.name} manager current-cycle difference`,
    currentCycleCollectedCents - currentCycleExpectedCents ===
      qaCollectedCents - qaExpectedCents,
    `RentFray ${
      currentCycleCollectedCents - currentCycleExpectedCents
    }, QA ${qaCollectedCents - qaExpectedCents}`
  );
}