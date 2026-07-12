export type QaLedgerKind =
  | "RENT"
  | "LATE_FEE"
  | "RECURRING_CHARGE"
  | "PROCESSING_FEE"
  | "PAYMENT"
  | "CREDIT"
  | "ADJUSTMENT";

export type QaLedgerEntry = {
  cycle: string;
  kind: QaLedgerKind;
  amountCents: number;
  memo: string;
};

export type QaBillingCycle = {
  cycle: string;
  rentCents: number;
  lateFeeCents: number;
  recurringChargeCents: number;
  processingFeeCents: number;
  paymentCents: number;
  creditCents: number;
  adjustmentCents: number;
};

export type QaAccountStatus =
  | "PAID"
  | "PENDING"
  | "FAILED"
  | "UNPAID"
  | "DELINQUENT";

export type QaAccount = {
  unitNumber: string;
  currentCycle: string;
  ledger: QaLedgerEntry[];
  pendingPaymentCents: number;
  failedPaymentCents: number;
};

export function createQaAccount(unitNumber: string): QaAccount {
  return {
    unitNumber,
    currentCycle: "2026-01",
    ledger: [],
    pendingPaymentCents: 0,
    failedPaymentCents: 0,
  };
}

export function setCurrentCycle(
  account: QaAccount,
  cycle: string
): QaAccount {
  return {
    ...account,
    currentCycle: cycle,
  };
}

export function addLedgerEntry(
  account: QaAccount,
  entry: QaLedgerEntry
): QaAccount {
  return {
    ...account,
    ledger: [...account.ledger, entry],
  };
}

export function postCycleRent(
  account: QaAccount,
  cycle: string,
  amountCents: number
): QaAccount {
  return addLedgerEntry(setCurrentCycle(account, cycle), {
    cycle,
    kind: "RENT",
    amountCents,
    memo: `${cycle} rent`,
  });
}

export function postCycleLateFee(
  account: QaAccount,
  cycle: string,
  amountCents: number
): QaAccount {
  return addLedgerEntry(setCurrentCycle(account, cycle), {
    cycle,
    kind: "LATE_FEE",
    amountCents,
    memo: `${cycle} late fee`,
  });
}

export function postCyclePayment(
  account: QaAccount,
  cycle: string,
  amountCents: number
): QaAccount {
  return {
    ...addLedgerEntry(setCurrentCycle(account, cycle), {
      cycle,
      kind: "PAYMENT",
      amountCents: -Math.abs(amountCents),
      memo: `${cycle} payment`,
    }),
    pendingPaymentCents: 0,
    failedPaymentCents: 0,
  };
}

export function startCyclePendingPayment(
  account: QaAccount,
  cycle: string,
  amountCents: number
): QaAccount {
  return {
    ...setCurrentCycle(account, cycle),
    pendingPaymentCents: amountCents,
    failedPaymentCents: 0,
  };
}

export function failCyclePayment(
  account: QaAccount,
  cycle: string,
  amountCents: number
): QaAccount {
  return {
    ...setCurrentCycle(account, cycle),
    pendingPaymentCents: 0,
    failedPaymentCents: amountCents,
  };
}

export function getCycleSummary(
  account: QaAccount,
  cycle: string
): QaBillingCycle {
  const entries = account.ledger.filter((entry) => entry.cycle === cycle);

  return entries.reduce<QaBillingCycle>(
    (summary, entry) => {
      switch (entry.kind) {
        case "RENT":
          summary.rentCents += entry.amountCents;
          break;
        case "LATE_FEE":
          summary.lateFeeCents += entry.amountCents;
          break;
        case "RECURRING_CHARGE":
          summary.recurringChargeCents += entry.amountCents;
          break;
        case "PROCESSING_FEE":
          summary.processingFeeCents += entry.amountCents;
          break;
        case "PAYMENT":
          summary.paymentCents += Math.abs(entry.amountCents);
          break;
        case "CREDIT":
          summary.creditCents += Math.abs(entry.amountCents);
          break;
        case "ADJUSTMENT":
          summary.adjustmentCents += entry.amountCents;
          break;
      }

      return summary;
    },
    {
      cycle,
      rentCents: 0,
      lateFeeCents: 0,
      recurringChargeCents: 0,
      processingFeeCents: 0,
      paymentCents: 0,
      creditCents: 0,
      adjustmentCents: 0,
    }
  );
}

export function getCycleExpectedCents(
  account: QaAccount,
  cycle: string
): number {
  const summary = getCycleSummary(account, cycle);

  return Math.max(
    0,
    summary.rentCents +
      summary.lateFeeCents +
      summary.recurringChargeCents +
      summary.adjustmentCents -
      summary.creditCents
  );
}

export function getCycleCollectedCents(
  account: QaAccount,
  cycle: string
): number {
  return getCycleSummary(account, cycle).paymentCents;
}

export function getCycleRemainingCents(
  account: QaAccount,
  cycle: string
): number {
  return Math.max(
    0,
    getCycleExpectedCents(account, cycle) -
      getCycleCollectedCents(account, cycle)
  );
}

export function getTotalOutstandingCents(account: QaAccount): number {
  return Math.max(
    0,
    account.ledger.reduce((sum, entry) => sum + entry.amountCents, 0)
  );
}

export function getPastDueCarryoverCents(account: QaAccount): number {
  const total = getTotalOutstandingCents(account);
  const current = getCycleRemainingCents(account, account.currentCycle);

  return Math.max(0, total - current);
}

export function getAccountStatus(account: QaAccount): QaAccountStatus {
  if (account.pendingPaymentCents > 0) return "PENDING";
  if (account.failedPaymentCents > 0) return "FAILED";
  if (getTotalOutstandingCents(account) <= 0) return "PAID";
  return "UNPAID";
}