import { createQaAccount, getTotalOutstandingCents } from "./account-model";
import {
  failedThenRetry,
  lateFeesThenPays,
  manualOnly,
  partialEveryMonth,
  paysEveryMonth,
  pendingAcrossCycle,
  skipsFourMonthsThenPays,
  skipsSixMonthsThenPays,
  skipsTwelveMonthsThenPays,
  skipsThreeMonthsThenPays,
  mixedChargesScenario,
moveInAfterDueDateScenario,
moveOutWithBalanceScenario,
rentIncreaseNextCycleScenario,
vacantUnitScenario,
} from "./event-scenarios";
import { expect } from "./reporter";
import { replayEvents } from "./replay-engine";
import { runScenarioExpectation } from "./scenario-runner";

export async function runScenarioTests(): Promise<void> {
  expect(
    "Scenario always-pay clears balance",
    getTotalOutstandingCents(
      replayEvents(createQaAccount("101"), paysEveryMonth)
    ) === 0
  );

  expect(
    "Scenario three-month skip clears after full payment",
    getTotalOutstandingCents(
      replayEvents(createQaAccount("103"), skipsThreeMonthsThenPays)
    ) === 0
  );

  expect(
    "Scenario four-month skip clears after full payment",
    getTotalOutstandingCents(
      replayEvents(createQaAccount("104"), skipsFourMonthsThenPays)
    ) === 0
  );

  expect(
    "Scenario partial payments retain balance",
    getTotalOutstandingCents(
      replayEvents(createQaAccount("105"), partialEveryMonth)
    ) === 100
  );

  const pendingAccount = replayEvents(
    createQaAccount("107"),
    pendingAcrossCycle
  );

  expect(
    "Scenario pending across cycle remains pending",
    pendingAccount.pendingPaymentCents === 100
  );

  expect(
    "Scenario pending across cycle keeps full outstanding balance",
    getTotalOutstandingCents(pendingAccount) === 200,
    `outstanding ${getTotalOutstandingCents(pendingAccount)}`
  );

  runScenarioExpectation({
    name: "Always pay",
    unitNumber: "101",
    events: paysEveryMonth,
    expectedOutstandingCents: 0,
    expectedStatus: "PAID",
  });

runScenarioExpectation({
  name: "Six-month skip then full pay",
  unitNumber: "121",
  events: skipsSixMonthsThenPays,
  expectedOutstandingCents: 0,
  expectedStatus: "PAID",
});

runScenarioExpectation({
  name: "Vacant unit",
  unitNumber: "127",
  events: vacantUnitScenario,
  expectedOutstandingCents: 0,
  expectedStatus: "PAID",
});

runScenarioExpectation({
  name: "Move-in after due date first billed next cycle",
  unitNumber: "123",
  events: moveInAfterDueDateScenario,
  expectedOutstandingCents: 0,
  expectedStatus: "PAID",
});

runScenarioExpectation({
  name: "Move-out with remaining balance",
  unitNumber: "124",
  events: moveOutWithBalanceScenario,
  expectedOutstandingCents: 200,
  expectedStatus: "UNPAID",
});

runScenarioExpectation({
  name: "Rent increase next cycle",
  unitNumber: "125",
  events: rentIncreaseNextCycleScenario,
  expectedOutstandingCents: 0,
  expectedStatus: "PAID",
});

runScenarioExpectation({
  name: "Mixed rent recurring fee late fee credit then pay",
  unitNumber: "126",
  events: mixedChargesScenario,
  expectedOutstandingCents: 0,
  expectedStatus: "PAID",
});

runScenarioExpectation({
  name: "Twelve-month skip then full pay",
  unitNumber: "122",
  events: skipsTwelveMonthsThenPays,
  expectedOutstandingCents: 0,
  expectedStatus: "PAID",
});

  runScenarioExpectation({
    name: "Three-month skip then full pay",
    unitNumber: "103",
    events: skipsThreeMonthsThenPays,
    expectedOutstandingCents: 0,
    expectedStatus: "PAID",
  });

  runScenarioExpectation({
    name: "Four-month skip then full pay",
    unitNumber: "104",
    events: skipsFourMonthsThenPays,
    expectedOutstandingCents: 0,
    expectedStatus: "PAID",
  });

  runScenarioExpectation({
    name: "Partial every month",
    unitNumber: "105",
    events: partialEveryMonth,
    expectedOutstandingCents: 100,
    expectedStatus: "UNPAID",
  });

  runScenarioExpectation({
    name: "Pending across cycle",
    unitNumber: "107",
    events: pendingAcrossCycle,
    expectedOutstandingCents: 200,
    expectedStatus: "PENDING",
    expectedPendingCents: 100,
  });

  runScenarioExpectation({
    name: "Failed then retry",
    unitNumber: "106",
    events: failedThenRetry,
    expectedOutstandingCents: 0,
    expectedStatus: "PAID",
  });

  runScenarioExpectation({
    name: "Late fees then pays",
    unitNumber: "109",
    events: lateFeesThenPays,
    expectedOutstandingCents: 0,
    expectedStatus: "PAID",
  });

  runScenarioExpectation({
    name: "Manual only",
    unitNumber: "108",
    events: manualOnly,
    expectedOutstandingCents: 0,
    expectedStatus: "PAID",
  });
}