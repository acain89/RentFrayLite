import { verifyPropertyInvariants } from "./invariants/property";
import {
  buildAuditRunSummary,
  buildSimulationSummary,
  printAuditRunSummary,
  printYearSimulationReport,
  type SimulationSummary,
} from "./report-generator";
import { expect, printFinalReport } from "./reporter";
import { writeAuditOutput } from "./audit-output";
import { runRentFrayIntegrationTests } from "./rentfray-integration-tests";
import { runScenarioTests } from "./scenario-tests";
import { runSmokeTests } from "./smoke-tests";
import { runSimulatedYear } from "./year-runner";
import type { PropertySimulatorPreset } from "./property-simulator";

const ALL_PRESETS = [
  "default",
  "small-landlord",
  "average-apartment",
  "high-delinquency",
] as const;

function getArgValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function getNumberArg(name: string, fallback: number): number {
  const raw = getArgValue(name);
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function getPresetArg(): PropertySimulatorPreset {
  const raw = getArgValue("preset");

  switch (raw) {
    case "default":
    case "small-landlord":
    case "average-apartment":
    case "high-delinquency":
      return raw;
    default:
      return "default";
  }
}

async function main(): Promise<void> {
  const stress = hasFlag("stress");

const months = stress ? 60 : getNumberArg("months", 24);
const units = stress ? 100 : getNumberArg("units", 20);
const preset = stress ? "high-delinquency" : getPresetArg();

  console.log("=====================================================");
  console.log("RentFray Financial Audit");
  console.log("=====================================================\n");

  console.log(`Audit months: ${months}`);
  console.log(`Audit units: ${units}`);
  console.log(`Audit preset: ${preset}\n`);

  await runSmokeTests();
  await runScenarioTests();
  await runRentFrayIntegrationTests();

  const presetsToRun = hasFlag("all-presets") ? ALL_PRESETS : [preset];

  const simulationSummaries: SimulationSummary[] = [];
  const presetsRun = [...presetsToRun];

for (const presetToRun of presetsToRun) {
  const simulation = runSimulatedYear({
    months,
    rentCents: 100,
    unitCount: units,
    preset: presetToRun,
  });

  printYearSimulationReport(simulation);

  verifyPropertyInvariants({
    name: `${months}-month ${presetToRun} simulator`,
    accounts: simulation.finalAccounts,
  });

  const summary = buildSimulationSummary(simulation);
  simulationSummaries.push(summary);
  expect(
    `Audit ${presetToRun} simulated ${months} months`,
    summary.monthsSimulated === months
  );

  expect(
    `Audit ${presetToRun} verified ${units} simulated units`,
    summary.finalUnits === units
  );

  expect(
    `Audit ${presetToRun} includes paid units`,
    summary.paidUnits > 0,
    `paid ${summary.paidUnits}`
  );

expect(
  `Audit ${presetToRun} unpaid count is valid`,
  summary.unpaidUnits >= 0,
  `unpaid ${summary.unpaidUnits}`
);

expect(
  `Audit ${presetToRun} outstanding balance is valid`,
  summary.totalOutstandingCents >= 0,
  `outstanding ${summary.totalOutstandingCents}`
);

expect(
  `Audit ${presetToRun} past-due balance is valid`,
  summary.pastDueCarryoverCents >= 0,
  `pastDue ${summary.pastDueCarryoverCents}`
);

expect(
  `Audit ${presetToRun} unit accounting balances`,
  summary.paidUnits +
    summary.unpaidUnits +
    summary.pendingUnits ===
    summary.finalUnits,
  `paid ${summary.paidUnits}, unpaid ${summary.unpaidUnits}, pending ${summary.pendingUnits}, units ${summary.finalUnits}`
);

  expect(
    `Audit ${presetToRun} pending count is valid`,
    summary.pendingUnits >= 0,
    `pending ${summary.pendingUnits}`
  );
}

const auditSummary = buildAuditRunSummary(simulationSummaries);

printAuditRunSummary(auditSummary);

writeAuditOutput({
  months,
  units,
  presets: presetsRun,
  stress,
  allPresets: hasFlag("all-presets"),
  summaries: simulationSummaries,
  auditSummary,
});

  printFinalReport();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});