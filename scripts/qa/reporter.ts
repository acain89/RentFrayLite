import type { QaResult } from "./types";

export const results: QaResult[] = [];

export function pass(name: string, detail?: string): void {
  results.push({ name, passed: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

export function fail(name: string, detail?: string): void {
  results.push({ name, passed: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

export function expect(name: string, condition: boolean, detail?: string): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

export function printFinalReport(): void {
  console.log("\n=====================================================");
  const failed = results.filter((result) => !result.passed);

  if (failed.length === 0) {
    console.log("OVERALL RESULT: PASS");
  } else {
    console.log("OVERALL RESULT: FAIL");
    for (const item of failed) {
      console.log(`- ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
    }
    process.exitCode = 1;
  }

  console.log("=====================================================");
}