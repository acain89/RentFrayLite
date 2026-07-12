import { createQaAccount, type QaAccount } from "./account-model";
import { buildBehaviorEvents } from "./behavior";
import type { QaEvent } from "./events";
import type { SimulatedUnit } from "./property-simulator";
import { replayEvents } from "./replay-engine";

export type MonthSimulationResult = {
  cycle: string;
  monthIndex: number;
  accounts: Map<string, QaAccount>;
  events: QaEvent[];
};

export function runSimulatedMonth(input: {
  cycle: string;
  monthIndex: number;
  rentCents: number;
  units: SimulatedUnit[];
  previousAccounts?: Map<string, QaAccount>;
}): MonthSimulationResult {
  const accounts = new Map<string, QaAccount>();
  const events: QaEvent[] = [];

  for (const unit of input.units) {
    const startingAccount =
      input.previousAccounts?.get(unit.unitNumber) ??
      createQaAccount(unit.unitNumber);

    const unitEvents = buildBehaviorEvents(unit.behavior, {
      unitNumber: unit.unitNumber,
      cycle: input.cycle,
      monthIndex: input.monthIndex,
      rentCents: input.rentCents,
    });

    events.push(...unitEvents);

    accounts.set(
      unit.unitNumber,
      replayEvents(startingAccount, unitEvents)
    );
  }

  return {
    cycle: input.cycle,
    monthIndex: input.monthIndex,
    accounts,
    events,
  };
}