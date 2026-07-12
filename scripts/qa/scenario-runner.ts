import {
  getAccountStatus,
  getTotalOutstandingCents,
  type QaAccountStatus,
} from "./account-model";
import { createQaAccount } from "./account-model";
import type { QaEvent } from "./events";
import { verifyAccountingInvariants } from "./invariants/accounting";
import { expect } from "./reporter";
import { replayEvents } from "./replay-engine";

export type QaScenarioExpectation = {
  name: string;
  unitNumber: string;
  events: QaEvent[];
  expectedOutstandingCents: number;
  expectedStatus: QaAccountStatus;
  expectedPendingCents?: number;
};

export function runScenarioExpectation(
  scenario: QaScenarioExpectation
): void {
  const account = replayEvents(
    createQaAccount(scenario.unitNumber),
    scenario.events
  );

  const outstanding = getTotalOutstandingCents(account);
  const status = getAccountStatus(account);

  expect(
    `${scenario.name} outstanding`,
    outstanding === scenario.expectedOutstandingCents,
    `expected ${scenario.expectedOutstandingCents}, actual ${outstanding}`
  );

  expect(
    `${scenario.name} status`,
    status === scenario.expectedStatus,
    `expected ${scenario.expectedStatus}, actual ${status}`
  );

  if (typeof scenario.expectedPendingCents === "number") {
    expect(
      `${scenario.name} pending amount`,
      account.pendingPaymentCents === scenario.expectedPendingCents,
      `expected ${scenario.expectedPendingCents}, actual ${account.pendingPaymentCents}`
    );
  }

  verifyAccountingInvariants({
    name: scenario.name,
    account,
  });
}