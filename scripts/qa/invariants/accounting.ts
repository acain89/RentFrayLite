import {
  getAccountStatus,
  getPastDueCarryoverCents,
  getTotalOutstandingCents,
  type QaAccount,
} from "../account-model";
import { expect } from "../reporter";

export function verifyAccountingInvariants(input: {
  name: string;
  account: QaAccount;
}): void {
  const outstanding = getTotalOutstandingCents(input.account);
  const pastDue = getPastDueCarryoverCents(input.account);
  const status = getAccountStatus(input.account);

  expect(
    `${input.name} invariant: outstanding is never negative`,
    outstanding >= 0,
    `outstanding ${outstanding}`
  );

  expect(
    `${input.name} invariant: past due never exceeds outstanding`,
    pastDue <= outstanding,
    `pastDue ${pastDue}, outstanding ${outstanding}`
  );

  expect(
    `${input.name} invariant: pending is never negative`,
    input.account.pendingPaymentCents >= 0,
    `pending ${input.account.pendingPaymentCents}`
  );

  expect(
    `${input.name} invariant: failed payment is never negative`,
    input.account.failedPaymentCents >= 0,
    `failed ${input.account.failedPaymentCents}`
  );

  if (status === "PAID") {
    expect(
      `${input.name} invariant: paid means zero outstanding`,
      outstanding === 0,
      `status ${status}, outstanding ${outstanding}`
    );
  }

  if (status === "PENDING") {
    expect(
      `${input.name} invariant: pending status has pending amount`,
      input.account.pendingPaymentCents > 0,
      `status ${status}, pending ${input.account.pendingPaymentCents}`
    );
  }

  if (status === "UNPAID") {
    expect(
      `${input.name} invariant: unpaid means positive outstanding`,
      outstanding > 0,
      `status ${status}, outstanding ${outstanding}`
    );
  }

  expect(
    `${input.name} invariant: pending amount does not exceed outstanding`,
    input.account.pendingPaymentCents <= outstanding || outstanding === 0,
    `pending ${input.account.pendingPaymentCents}, outstanding ${outstanding}`
  );
}