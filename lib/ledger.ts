import { prisma } from "@/lib/prisma";
import { getBusinessDate } from "@/lib/rentDates";

export type LedgerSummary = {
  balanceCents: number;
  totalChargesCents: number;
  totalCreditsCents: number;
  totalPaidCents: number;
  balance: number;
  totalCharges: number;
  totalCredits: number;
  totalPaid: number;
  lastPaymentDate: Date | null;
  lastPaymentAmountCents: number | null;
  lastPaymentAmount: number | null;
  hasPendingPayment: boolean;
  pendingPaymentAmountCents: number;
};

type LedgerEntryType = "CHARGE" | "PAYMENT" | "CREDIT" | "ADJUSTMENT";
type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REVERSED";

type LedgerEntryRow = {
  id: string;
  amountCents: number;
  entryType: unknown;
  effectiveDate: Date;
  createdAt: Date;
  payment: {
    status: unknown;
  } | null;
};

function normalizeLedgerEntryType(value: unknown): LedgerEntryType | null {
  const type = String(value ?? "").trim().toUpperCase();

  switch (type) {
    case "CHARGE":
    case "PAYMENT":
    case "CREDIT":
    case "ADJUSTMENT":
      return type;
    default:
      return null;
  }
}

function normalizePaymentStatus(value: unknown): PaymentStatus | null {
  const status = String(value ?? "").trim().toUpperCase();

  switch (status) {
    case "UNPAID":
    case "PENDING":
    case "PAID":
    case "FAILED":
    case "REVERSED":
      return status;
    default:
      return null;
  }
}

function isChargeEntry(type: LedgerEntryType): boolean {
  return type === "CHARGE";
}

function isPaymentEntry(type: LedgerEntryType): boolean {
  return type === "PAYMENT";
}

function isCreditEntry(type: LedgerEntryType): boolean {
  return type === "CREDIT";
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function toSafeDate(value: unknown): Date | null {
  if (!value) return null;
  const date =
    value instanceof Date ? value : new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toSafeInteger(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.trunc(amount);
}

function shouldCountPaymentStatus(status: PaymentStatus | null): boolean {
  return status === "PAID";
}

/*
  Ledger rules:
  - CHARGE increases balance owed
  - PAYMENT reduces balance owed only when confirmed PAID
  - CREDIT reduces balance owed
  - ADJUSTMENT may be positive or negative
  - voided entries do not count
  - failed/reversed payments must not reduce balance
*/
function getSignedImpactCents(
  entryType: LedgerEntryType,
  amountCents: number,
  paymentStatus?: PaymentStatus | null
): number {
  const absAmount = Math.abs(toSafeInteger(amountCents));

  if (entryType === "CHARGE") return absAmount;
  if (entryType === "PAYMENT") {
    return paymentStatus === "PAID" ? -absAmount : 0;
  }
  if (entryType === "CREDIT") return -absAmount;
  if (entryType === "ADJUSTMENT") return toSafeInteger(amountCents);

  return 0;
}

export async function getUnitLedgerSummary(
  unitId: string,
  tenantAssignmentId?: string
): Promise<LedgerSummary> {
  const now = getBusinessDate();
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      property: {
        select: {
          billingCycleStartDate: true,
        },
      },
    },
  });

  const billingStart = unit?.property?.billingCycleStartDate
    ? new Date(unit.property.billingCycleStartDate)
    : null;

  const entries: LedgerEntryRow[] = await prisma.ledgerEntry.findMany({
    where: {
      unitId,
      voidedAt: null,
      ...(tenantAssignmentId
  ? {
      OR: [
        { tenantAssignmentId },
        { tenantAssignmentId: null },
      ],
    }
  : {}),
      effectiveDate: {
        lte: now,
      },
    },
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      amountCents: true,
      entryType: true,
      effectiveDate: true,
      createdAt: true,
      payment: {
        select: {
          status: true,
        },
      },
    },
  });

    const payments = await prisma.payment.findMany({
  where: {
    unitId,
    ...(tenantAssignmentId
  ? {
      OR: [
        { tenantAssignmentId },
        { tenantAssignmentId: null },
      ],
    }
  : {}),
  },
  select: {
    status: true,
    amountCents: true,
  },
});

  const visibleEntries: LedgerEntryRow[] = billingStart
    ? entries.filter((entry: LedgerEntryRow) => {
        const entryType = normalizeLedgerEntryType(entry.entryType);
        if (!entryType) return false;

        if (!isChargeEntry(entryType)) {
          return true;
        }

        const effectiveDate = toSafeDate(entry.effectiveDate);
        if (!effectiveDate) {
          return true;
        }

        return effectiveDate >= billingStart;
      })
    : entries;

  let balanceCents = 0;
  let totalChargesCents = 0;
  let totalCreditsCents = 0;
  let totalPaidCents = 0;

  let lastPaymentDate: Date | null = null;
  let lastPaymentCreatedAt: Date | null = null;
  let lastPaymentAmountCents: number | null = null;
  let hasPendingPayment = false;
  let pendingPaymentAmountCents = 0;

  for (const payment of payments) {
  const status = normalizePaymentStatus(payment.status);

  if (status === "PENDING") {
    hasPendingPayment = true;
    pendingPaymentAmountCents += Math.max(
      0,
      Math.abs(toSafeInteger(payment.amountCents))
    );
  }
}

  for (const entry of visibleEntries) {
    const entryType = normalizeLedgerEntryType(entry.entryType);
    if (!entryType) {
      continue;
    }

    const rawAmountCents = toSafeInteger(entry.amountCents);
    const paymentStatus = normalizePaymentStatus(entry.payment?.status);
    const signedImpactCents = getSignedImpactCents(
      entryType,
      rawAmountCents,
      paymentStatus
    );

    balanceCents += signedImpactCents;

    if (isChargeEntry(entryType)) {
      totalChargesCents += Math.abs(rawAmountCents);
    }

    if (isCreditEntry(entryType)) {
      totalCreditsCents += Math.abs(rawAmountCents);
    }

    

    if (isPaymentEntry(entryType) && shouldCountPaymentStatus(paymentStatus)) {
      const paymentAbsCents = Math.abs(rawAmountCents);
      totalPaidCents += paymentAbsCents;

      const effectiveDate = toSafeDate(entry.effectiveDate);
      const createdAt = toSafeDate(entry.createdAt);

      if (!effectiveDate || !createdAt) {
        continue;
      }

      const isLaterPayment =
        lastPaymentDate === null ||
        effectiveDate.getTime() > lastPaymentDate.getTime() ||
        (effectiveDate.getTime() === lastPaymentDate.getTime() &&
          (lastPaymentCreatedAt === null ||
            createdAt.getTime() > lastPaymentCreatedAt.getTime()));

      if (isLaterPayment) {
        lastPaymentDate = effectiveDate;
        lastPaymentCreatedAt = createdAt;
        lastPaymentAmountCents = paymentAbsCents;
      }
    }
  }

  return {
    balanceCents,
    totalChargesCents,
    totalCreditsCents,
    totalPaidCents,
    balance: centsToDollars(balanceCents),
    totalCharges: centsToDollars(totalChargesCents),
    totalCredits: centsToDollars(totalCreditsCents),
    totalPaid: centsToDollars(totalPaidCents),
    lastPaymentDate,
    lastPaymentAmountCents,
    lastPaymentAmount:
      lastPaymentAmountCents === null
        ? null
        : centsToDollars(lastPaymentAmountCents),
    hasPendingPayment,
    pendingPaymentAmountCents,
  };
}