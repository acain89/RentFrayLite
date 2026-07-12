type LedgerLikeEntry = {
  id: string;
  amountCents: number;
  entryType: string;
  effectiveDate?: Date | string;
  appliedAmountCents?: number | null;
};

type Allocation = {
  ledgerEntryId: string;
  appliedAmountCents: number;
};

type AllocationResult = {
  allocations: Allocation[];
  remainingCents: number;
  totalOpenChargeCents: number;
  isExactPaymentMatch: boolean;
};

type CanonicalLedgerEntryType =
  | "CHARGE"
  | "PAYMENT"
  | "CREDIT"
  | "ADJUSTMENT";

function toSafeInteger(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function normalizeLedgerEntryType(
  value: unknown
): CanonicalLedgerEntryType | null {
  const normalized = String(value ?? "").trim().toUpperCase();

  switch (normalized) {
    case "CHARGE":
    case "PAYMENT":
    case "CREDIT":
    case "ADJUSTMENT":
      return normalized;
    default:
      return null;
  }
}

function toDateMs(value: unknown): number {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function allocatePayment(
  paymentAmountCents: number,
  entries: LedgerLikeEntry[]
): AllocationResult {
  let remaining = Math.max(0, toSafeInteger(paymentAmountCents));

  const openCharges = entries
    .map((e) => {
      const type = normalizeLedgerEntryType(e.entryType);
      if (type !== "CHARGE") return null;

      const amount = Math.max(0, toSafeInteger(e.amountCents));
      const applied = Math.max(
        0,
        toSafeInteger(e.appliedAmountCents ?? 0)
      );

      const open = Math.max(0, amount - applied);
      if (open <= 0) return null;

      return {
        id: e.id,
        openAmountCents: open,
        effectiveDateMs: toDateMs(e.effectiveDate),
      };
    })
    .filter(Boolean as unknown as <T>(x: T | null) => x is T)
    .sort((a, b) => a.effectiveDateMs - b.effectiveDateMs);

  const totalOpenChargeCents = openCharges.reduce(
    (sum, c) => sum + c.openAmountCents,
    0
  );

  const allocations: Allocation[] = [];

  for (const charge of openCharges) {
    if (remaining <= 0) break;

    const applied = Math.min(charge.openAmountCents, remaining);

    allocations.push({
      ledgerEntryId: charge.id,
      appliedAmountCents: applied,
    });

    remaining -= applied;
  }

  return {
    allocations,
    remainingCents: remaining,
    totalOpenChargeCents,
    isExactPaymentMatch:
      paymentAmountCents > 0 &&
      paymentAmountCents === totalOpenChargeCents,
  };
}