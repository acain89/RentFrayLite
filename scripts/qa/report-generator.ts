import {
  getAccountStatus,
  getPastDueCarryoverCents,
  getTotalOutstandingCents,
  type QaAccount,
} from "./account-model";
import type { YearSimulationResult } from "./year-runner";

export type SimulationSummary = {
  monthsSimulated: number;
  finalUnits: number;
  totalOutstandingCents: number;
  pastDueCarryoverCents: number;
  paidUnits: number;
  unpaidUnits: number;
  pendingUnits: number;
  eventCount: number;
};

export type AuditRunSummary = {
  presetsRun: number;
  totalMonthsSimulated: number;
  totalUnitsSimulated: number;
  totalFinancialEvents: number;
  totalOutstandingCents: number;
  totalPastDueCarryoverCents: number;
  totalPaidUnits: number;
  totalUnpaidUnits: number;
  totalPendingUnits: number;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function sumAccounts(
  accounts: Map<string, QaAccount>,
  selector: (account: QaAccount) => number
): number {
  return Array.from(accounts.values()).reduce(
    (sum, account) => sum + selector(account),
    0
  );
}

export function buildSimulationSummary(
  result: YearSimulationResult
): SimulationSummary {
  const accounts = Array.from(result.finalAccounts.values());

  return {
    monthsSimulated: result.months.length,
    finalUnits: result.finalAccounts.size,
    eventCount: result.months.reduce(
      (sum, month) => sum + month.events.length,
      0
    ),
    totalOutstandingCents: sumAccounts(
      result.finalAccounts,
      getTotalOutstandingCents
    ),
    pastDueCarryoverCents: sumAccounts(
      result.finalAccounts,
      getPastDueCarryoverCents
    ),
    paidUnits: accounts.filter((account) => getAccountStatus(account) === "PAID")
      .length,
    unpaidUnits: accounts.filter(
      (account) => getAccountStatus(account) === "UNPAID"
    ).length,
    pendingUnits: accounts.filter(
      (account) => getAccountStatus(account) === "PENDING"
    ).length,
  };
}

export function buildAuditRunSummary(
  summaries: SimulationSummary[]
): AuditRunSummary {
  return summaries.reduce<AuditRunSummary>(
    (total, summary) => ({
      presetsRun: total.presetsRun + 1,
      totalMonthsSimulated:
        total.totalMonthsSimulated + summary.monthsSimulated,
      totalUnitsSimulated: total.totalUnitsSimulated + summary.finalUnits,
      totalFinancialEvents: total.totalFinancialEvents + summary.eventCount,
      totalOutstandingCents:
        total.totalOutstandingCents + summary.totalOutstandingCents,
      totalPastDueCarryoverCents:
        total.totalPastDueCarryoverCents + summary.pastDueCarryoverCents,
      totalPaidUnits: total.totalPaidUnits + summary.paidUnits,
      totalUnpaidUnits: total.totalUnpaidUnits + summary.unpaidUnits,
      totalPendingUnits: total.totalPendingUnits + summary.pendingUnits,
    }),
    {
      presetsRun: 0,
      totalMonthsSimulated: 0,
      totalUnitsSimulated: 0,
      totalFinancialEvents: 0,
      totalOutstandingCents: 0,
      totalPastDueCarryoverCents: 0,
      totalPaidUnits: 0,
      totalUnpaidUnits: 0,
      totalPendingUnits: 0,
    }
  );
}

export function printAuditRunSummary(summary: AuditRunSummary): void {
  console.log("\n=====================================================");
  console.log("RentFray Audit Summary");
  console.log("=====================================================");
  console.log(`Presets run: ${summary.presetsRun}`);
  console.log(`Total months simulated: ${summary.totalMonthsSimulated}`);
  console.log(`Total units simulated: ${summary.totalUnitsSimulated}`);
  console.log(`Financial events replayed: ${summary.totalFinancialEvents}`);
  console.log(`Paid units: ${summary.totalPaidUnits}`);
  console.log(`Unpaid units: ${summary.totalUnpaidUnits}`);
  console.log(`Pending units: ${summary.totalPendingUnits}`);
  console.log(
    `Total outstanding: ${dollars(summary.totalOutstandingCents)}`
  );
  console.log(
    `Past due carryover: ${dollars(summary.totalPastDueCarryoverCents)}`
  );
  console.log("=====================================================");
}

export function printYearSimulationReport(result: YearSimulationResult): void {
  const summary = buildSimulationSummary(result);

  console.log("\n=====================================================");
  console.log("Financial Simulator Report");
  console.log("=====================================================");

  console.log(`Months simulated: ${summary.monthsSimulated}`);
  console.log(`Final units: ${summary.finalUnits}`);
  console.log(`Financial events: ${summary.eventCount}`);
  console.log(`Total outstanding: ${dollars(summary.totalOutstandingCents)}`);
  console.log(`Past due carryover: ${dollars(summary.pastDueCarryoverCents)}`);
  console.log(`Paid units: ${summary.paidUnits}`);
  console.log(`Unpaid units: ${summary.unpaidUnits}`);
  console.log(`Pending units: ${summary.pendingUnits}`);

  console.log("\nFinal unit states:");
  for (const [unitNumber, account] of result.finalAccounts.entries()) {
    console.log(
      `Unit ${unitNumber} | ${getAccountStatus(account)} | Outstanding ${dollars(
        getTotalOutstandingCents(account)
      )} | Past due ${dollars(getPastDueCarryoverCents(account))}`
    );
  }

  console.log("=====================================================");
}