import fs from "node:fs";
import path from "node:path";
import type { AuditRunSummary, SimulationSummary } from "./report-generator";
import { results } from "./reporter";

export type AuditOutputInput = {
  months: number;
  units: number;
  presets: readonly string[];
  stress: boolean;
  allPresets: boolean;
  summaries: SimulationSummary[];
  auditSummary: AuditRunSummary;
};

export function writeAuditOutput(input: AuditOutputInput): void {
  const outputDir = path.join(process.cwd(), "scripts", "qa", "output");

  fs.mkdirSync(outputDir, { recursive: true });

  const failed = results.filter((result) => !result.passed);

  const payload = {
    generatedAt: new Date().toISOString(),
    overallResult: failed.length === 0 ? "PASS" : "FAIL",
    cli: {
      months: input.months,
      units: input.units,
      presets: input.presets,
      stress: input.stress,
      allPresets: input.allPresets,
    },
    totals: input.auditSummary,
    presetSummaries: input.summaries,
    assertionCount: results.length,
    failedCount: failed.length,
    failures: failed,
  };

  fs.writeFileSync(
    path.join(outputDir, "latest.json"),
    JSON.stringify(payload, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "latest-summary.json"),
    JSON.stringify(
      {
        generatedAt: payload.generatedAt,
        overallResult: payload.overallResult,
        assertionCount: payload.assertionCount,
        failedCount: payload.failedCount,
        totals: payload.totals,
      },
      null,
      2
    )
  );

  console.log("\nAudit JSON written:");
  console.log("scripts/qa/output/latest.json");
  console.log("scripts/qa/output/latest-summary.json");
}