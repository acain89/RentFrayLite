import {
  getAccountStatus,
  getPastDueCarryoverCents,
  getTotalOutstandingCents,
  type QaAccount,
} from "../account-model";
import { expect } from "../reporter";

export function verifyPropertyInvariants(input: {
  name: string;
  accounts: Map<string, QaAccount>;
}): void {
  const accounts = Array.from(input.accounts.values());

  const totalOutstanding = accounts.reduce(
    (sum, account) => sum + getTotalOutstandingCents(account),
    0
  );

  const totalPastDue = accounts.reduce(
    (sum, account) => sum + getPastDueCarryoverCents(account),
    0
  );

  const paidUnits = accounts.filter(
    (account) => getAccountStatus(account) === "PAID"
  ).length;

  const unpaidUnits = accounts.filter(
    (account) => getAccountStatus(account) === "UNPAID"
  ).length;

  const pendingUnits = accounts.filter(
    (account) => getAccountStatus(account) === "PENDING"
  ).length;

  expect(
    `${input.name} invariant: property has accounts`,
    accounts.length > 0,
    `accounts ${accounts.length}`
  );

  expect(
    `${input.name} invariant: outstanding is never negative`,
    totalOutstanding >= 0,
    `outstanding ${totalOutstanding}`
  );

  expect(
    `${input.name} invariant: past due never exceeds outstanding`,
    totalPastDue <= totalOutstanding,
    `pastDue ${totalPastDue}, outstanding ${totalOutstanding}`
  );

  expect(
    `${input.name} invariant: status counts do not exceed unit count`,
    paidUnits + unpaidUnits + pendingUnits <= accounts.length,
    `paid ${paidUnits}, unpaid ${unpaidUnits}, pending ${pendingUnits}, accounts ${accounts.length}`
  );
}