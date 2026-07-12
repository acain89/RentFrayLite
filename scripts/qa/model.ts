export type QaUnitStatus =
  | "PAID"
  | "PENDING"
  | "FAILED"
  | "GRACE"
  | "DELINQUENT"
  | "UNPAID";

export type QaUnitFinancialModel = {
  unitNumber: string;
  cycle: string;

  rentCents: number;
  lateFeeCents: number;
  recurringChargeCents: number;
  processingFeeCents: number;

  paymentCents: number;
  creditCents: number;

  outstandingCents: number;

  hasPendingPayment: boolean;
  hasFailedPayment: boolean;

  status: QaUnitStatus;

  ledgerMemo: string[];
};

export function createInitialUnitModel(
  unitNumber: string,
  cycle: string
): QaUnitFinancialModel {
  return {
    unitNumber,
    cycle,

    rentCents: 0,
    lateFeeCents: 0,
    recurringChargeCents: 0,
    processingFeeCents: 0,

    paymentCents: 0,
    creditCents: 0,

    outstandingCents: 0,

    hasPendingPayment: false,
    hasFailedPayment: false,

    status: "PAID",

    ledgerMemo: [],
  };
}

export function postRent(
  model: QaUnitFinancialModel,
  amountCents: number,
  memo: string
): QaUnitFinancialModel {
  const nextOutstanding = model.outstandingCents + amountCents;

  return {
    ...model,
    rentCents: model.rentCents + amountCents,
    outstandingCents: nextOutstanding,
    status: resolveStatus({
      outstandingCents: nextOutstanding,
      hasPendingPayment: model.hasPendingPayment,
      hasFailedPayment: model.hasFailedPayment,
    }),
    ledgerMemo: [...model.ledgerMemo, memo],
  };
}

export function postLateFee(
  model: QaUnitFinancialModel,
  amountCents: number,
  memo: string
): QaUnitFinancialModel {
  const nextOutstanding = model.outstandingCents + amountCents;

  return {
    ...model,
    lateFeeCents: model.lateFeeCents + amountCents,
    outstandingCents: nextOutstanding,
    status: resolveStatus({
      outstandingCents: nextOutstanding,
      hasPendingPayment: model.hasPendingPayment,
      hasFailedPayment: model.hasFailedPayment,
    }),
    ledgerMemo: [...model.ledgerMemo, memo],
  };
}

export function postRecurringCharge(
  model: QaUnitFinancialModel,
  amountCents: number,
  memo: string
): QaUnitFinancialModel {
  const nextOutstanding = model.outstandingCents + amountCents;

  return {
    ...model,
    recurringChargeCents: model.recurringChargeCents + amountCents,
    outstandingCents: nextOutstanding,
    status: resolveStatus({
      outstandingCents: nextOutstanding,
      hasPendingPayment: model.hasPendingPayment,
      hasFailedPayment: model.hasFailedPayment,
    }),
    ledgerMemo: [...model.ledgerMemo, memo],
  };
}

export function postCredit(
  model: QaUnitFinancialModel,
  amountCents: number,
  memo: string
): QaUnitFinancialModel {
  const nextOutstanding = Math.max(0, model.outstandingCents - amountCents);

  return {
    ...model,
    creditCents: model.creditCents + amountCents,
    outstandingCents: nextOutstanding,
    status: resolveStatus({
      outstandingCents: nextOutstanding,
      hasPendingPayment: model.hasPendingPayment,
      hasFailedPayment: model.hasFailedPayment,
    }),
    ledgerMemo: [...model.ledgerMemo, memo],
  };
}

export function postPayment(
  model: QaUnitFinancialModel,
  amountCents: number,
  memo: string
): QaUnitFinancialModel {
  const nextOutstanding = Math.max(0, model.outstandingCents - amountCents);

  return {
    ...model,
    paymentCents: model.paymentCents + amountCents,
    outstandingCents: nextOutstanding,
    hasPendingPayment: false,
    hasFailedPayment: false,
    status: resolveStatus({
      outstandingCents: nextOutstanding,
      hasPendingPayment: false,
      hasFailedPayment: false,
    }),
    ledgerMemo: [...model.ledgerMemo, memo],
  };
}

export function startPendingPayment(
  model: QaUnitFinancialModel,
  memo: string
): QaUnitFinancialModel {
  return {
    ...model,
    hasPendingPayment: true,
    hasFailedPayment: false,
    status: "PENDING",
    ledgerMemo: [...model.ledgerMemo, memo],
  };
}

export function failPayment(
  model: QaUnitFinancialModel,
  memo: string
): QaUnitFinancialModel {
  return {
    ...model,
    hasPendingPayment: false,
    hasFailedPayment: true,
    status: "FAILED",
    ledgerMemo: [...model.ledgerMemo, memo],
  };
}

export function resolveStatus(input: {
  outstandingCents: number;
  hasPendingPayment: boolean;
  hasFailedPayment: boolean;
}): QaUnitStatus {
  if (input.hasPendingPayment) return "PENDING";
  if (input.hasFailedPayment) return "FAILED";
  if (input.outstandingCents <= 0) return "PAID";
  return "UNPAID";
}