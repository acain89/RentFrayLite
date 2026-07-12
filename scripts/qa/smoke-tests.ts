import { expect } from "./reporter";
import { unitScenarios } from "./scenarios";
import {
  createQaAccount,
  getPastDueCarryoverCents,
  getTotalOutstandingCents,
  postCyclePayment,
  postCycleRent,
} from "./account-model";
import {
  createInitialUnitModel,
  postPayment,
  postRent,
  startPendingPayment,
} from "./model";

export async function runSmokeTests(): Promise<void> {
  expect(
    "Loaded unit scenarios",
    unitScenarios.length === 8,
    `found ${unitScenarios.length}`
  );

  const demo = createInitialUnitModel("101", "2026-01");
  const billed = postRent(demo, 100, "January rent");
  const pending = startPendingPayment(billed, "Started ACH");
  const paid = postPayment(pending, 100, "ACH settled");

  expect("Financial model posts rent", billed.outstandingCents === 100);
  expect("Financial model tracks pending", pending.status === "PENDING");
  expect("Financial model clears payment", paid.outstandingCents === 0);
  expect("Financial model resolves paid status", paid.status === "PAID");

  let account = createQaAccount("101");

  account = postCycleRent(account, "2026-01", 100);
  account = postCycleRent(account, "2026-02", 100);
  account = postCycleRent(account, "2026-03", 100);

  expect(
    "Account model carries unpaid balances across cycles",
    getTotalOutstandingCents(account) === 300,
    `outstanding ${getTotalOutstandingCents(account)}`
  );

  account = postCyclePayment(account, "2026-04", 300);

  expect(
    "Account model clears multi-month balance after full payment",
    getTotalOutstandingCents(account) === 0,
    `outstanding ${getTotalOutstandingCents(account)}`
  );

  account = postCycleRent(account, "2026-05", 100);

  expect(
    "Account model starts clean after prior balance is paid",
    getTotalOutstandingCents(account) === 100,
    `outstanding ${getTotalOutstandingCents(account)}`
  );

  expect(
    "Account model separates past due carryover from current cycle",
    getPastDueCarryoverCents(account) === 0,
    `carryover ${getPastDueCarryoverCents(account)}`
  );
}