import type { QaAccount } from "./account-model";
import { runSimulatedMonth, type MonthSimulationResult } from "./month-runner";
import {
  buildSimulatedProperty,
  type PropertySimulatorPreset,
} from "./property-simulator";

export type YearSimulationResult = {
  months: MonthSimulationResult[];
  finalAccounts: Map<string, QaAccount>;
};

function cycleForMonth(monthIndex: number): string {
  const year = 2026 + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;

  return `${year}-${String(month).padStart(2, "0")}`;
}

export function runSimulatedYear(input?: {
  months?: number;
  rentCents?: number;
  unitCount?: number;
  preset?: PropertySimulatorPreset;
}): YearSimulationResult {
  const monthsToRun = input?.months ?? 12;
  const rentCents = input?.rentCents ?? 100;
  const units = buildSimulatedProperty({
    unitCount: input?.unitCount ?? 20,
    preset: input?.preset ?? "default",
  });

  const months: MonthSimulationResult[] = [];
  let accounts: Map<string, QaAccount> | undefined;

  for (let monthIndex = 0; monthIndex < monthsToRun; monthIndex++) {
    const result = runSimulatedMonth({
      cycle: cycleForMonth(monthIndex),
      monthIndex,
      rentCents,
      units,
      previousAccounts: accounts,
    });

    months.push(result);
    accounts = result.accounts;
  }

  return {
    months,
    finalAccounts: accounts ?? new Map<string, QaAccount>(),
  };
}