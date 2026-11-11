import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const source = readFileSync(path.join(root, "lib/propertyBillingCalendar.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const calendar = {};
// No process, filesystem, environment, network or provider modules in this VM.
vm.runInNewContext(compiled, {
  exports: calendar, Date, Intl, RangeError, TypeError,
  require(name) { throw new Error(`Forbidden calendar dependency: ${name}`); },
}, { timeout: 1000 });
const { validatePropertyTimeZone, getPropertyLocalDate, getFirstStandardBillingDate,
  getMonthlyBillingBoundaries, getPropertyBillingCalendar, getStandardCheckoutEligibility } = calendar;
const date = value => new Date(value);
const at = (iso, gracePeriodDays = 3, dailyLateFeesEnabled = true, timeZone = "America/Chicago") =>
  getPropertyBillingCalendar({ now: date(iso), timeZone, gracePeriodDays, dailyLateFeesEnabled });

for (const grace of [3, 4, 5]) {
  test(`${grace}-day grace includes the due date and expires after its last local day`, () => {
    const b = getMonthlyBillingBoundaries("2026-10", grace);
    assert.equal(b.dueDate, "2026-10-01");
    assert.equal(b.graceLastDate, `2026-10-0${grace}`);
    assert.equal(b.graceExpiresOn, `2026-10-0${grace + 1}`);
    assert.equal(b.initialLateFeeStartsOn, b.graceExpiresOn);
    assert.equal(b.dailyLateFeeStartsOn, `2026-10-0${grace + 2}`);
    assert.equal(at("2026-10-01T05:00:00Z", grace).isWithinGracePeriod, true);
  });
  for (const [label, iso, initial, daily, count] of [
    ["last grace millisecond", `2026-10-0${grace + 1}T04:59:59.999Z`, false, false, 0],
    ["initial fee midnight", `2026-10-0${grace + 1}T05:00:00Z`, true, false, 0],
    ["before daily midnight", `2026-10-0${grace + 2}T04:59:59.999Z`, true, false, 0],
    ["daily fee midnight", `2026-10-0${grace + 2}T05:00:00Z`, true, true, 1],
    ["second daily day", `2026-10-0${grace + 3}T05:00:00Z`, true, true, 2],
  ]) test(`${grace}-day grace: ${label}`, () => {
    const result = at(iso, grace);
    assert.equal(result.initialLateFeeEligible, initial);
    assert.equal(result.dailyLateFeeEligible, daily);
    assert.equal(result.dailyLateFeeDays, count);
    assert.equal(result.isWithinGracePeriod, !initial);
  });
}

for (const [created, expected] of [
  ["2026-10-01T05:00:00Z", "2026-11-01"],
  ["2026-10-15T17:00:00Z", "2026-11-01"],
  ["2026-10-31T23:00:00Z", "2026-11-01"],
  ["2026-12-31T18:00:00Z", "2027-01-01"],
  ["2024-02-29T18:00:00Z", "2024-03-01"],
  ["2025-02-28T18:00:00Z", "2025-03-01"],
  // UTC November, but still October locally; first cycle must be November.
  ["2026-11-01T04:59:59.999Z", "2026-11-01"],
  ["2026-11-01T05:00:00Z", "2026-12-01"],
]) test(`creation ${created} produces strict next local 1st ${expected}`, () => {
  assert.equal(getFirstStandardBillingDate(date(created), "America/Chicago"), expected);
});

for (const [iso, zone, expected] of [
  ["2026-10-01T04:59:59.999Z", "America/Chicago", "2026-09-30"],
  ["2026-10-01T05:00:00Z", "America/Chicago", "2026-10-01"],
  ["2026-01-01T05:59:59.999Z", "America/Chicago", "2025-12-31"],
  ["2026-01-01T06:00:00Z", "America/Chicago", "2026-01-01"],
  ["2026-10-01T00:00:00Z", "Asia/Tokyo", "2026-10-01"],
  ["2026-09-30T15:00:00Z", "Asia/Tokyo", "2026-10-01"],
  ["2026-09-30T10:00:00Z", "Pacific/Kiritimati", "2026-10-01"],
  ["2026-10-01T06:59:59.999Z", "America/Phoenix", "2026-09-30"],
  ["2026-10-01T00:00:00Z", "UTC", "2026-10-01"],
  ["2024-03-01T05:59:59.999Z", "America/Chicago", "2024-02-29"],
  ["0099-01-15T00:00:00Z", "UTC", "0099-01-15"],
]) test(`local date ${iso} in ${zone}`, () => {
  assert.equal(getPropertyLocalDate(date(iso), zone), expected);
});

for (const [iso, expectedDate, dailyDays] of [
  ["2026-03-08T07:59:59.999Z", "2026-03-08", 4],
  ["2026-03-08T08:00:00Z", "2026-03-08", 4],
  ["2026-03-09T04:59:59.999Z", "2026-03-08", 4],
  ["2026-03-09T05:00:00Z", "2026-03-09", 5],
  ["2026-11-01T06:59:59.999Z", "2026-11-01", 0],
  ["2026-11-01T07:00:00Z", "2026-11-01", 0],
  ["2026-11-02T05:59:59.999Z", "2026-11-01", 0],
  ["2026-11-02T06:00:00Z", "2026-11-02", 0],
]) test(`DST date/count at ${iso}`, () => {
  const result = at(iso);
  assert.equal(result.localDate, expectedDate);
  assert.equal(result.dailyLateFeeDays, dailyDays);
});

test("disabled daily fees stay ineligible without changing initial eligibility", () => {
  const result = at("2026-10-20T12:00:00Z", 3, false);
  assert.equal(result.initialLateFeeEligible, true);
  assert.equal(result.dailyLateFeeEligible, false);
  assert.equal(result.dailyLateFeeDays, 0);
});
test("monthly rollover starts a fresh grace period", () => {
  assert.equal(at("2027-01-01T06:00:00Z").billingCycle, "2027-01");
  assert.equal(at("2027-01-01T06:00:00Z").initialLateFeeEligible, false);
  assert.equal(at("2027-01-01T06:00:00Z").dailyLateFeeDays, 0);
});
test("years below 100 are not treated as 1900-based dates", () => {
  assert.equal(getFirstStandardBillingDate(date("0099-12-15T00:00:00Z"), "UTC"), "0100-01-01");
});

for (const stored of ["2026-11-01", date("2026-11-01T00:00:00Z")]) {
  for (const [iso, eligible, reason] of [
    ["2026-11-01T04:59:59.999Z", false, "BEFORE_FIRST_CYCLE"],
    ["2026-11-01T05:00:00Z", true, "ELIGIBLE"],
    ["2027-01-01T06:00:00Z", true, "ELIGIBLE"],
  ]) test(`first-cycle eligibility ${typeof stored} at ${iso}`, () => {
    const property = { propertyTimeZone: "America/Chicago", firstStandardBillingDate: stored };
    const result = getStandardCheckoutEligibility(property, date(iso));
    assert.equal(result.eligible, eligible);
    assert.equal(result.reason, reason);
    assert.equal(result.firstStandardBillingDate, "2026-11-01");
  });
}

for (const property of [{}, { propertyTimeZone: null, firstStandardBillingDate: null },
  { propertyTimeZone: "America/Chicago" }, { firstStandardBillingDate: "2026-11-01" }]) {
  test(`missing legacy calendar facts remain unconfigured: ${JSON.stringify(property)}`, () => {
    const before = JSON.stringify(property);
    const result = getStandardCheckoutEligibility(property, date("2026-12-01T12:00:00Z"));
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "CALENDAR_UNCONFIGURED");
    assert.equal(JSON.stringify(property), before);
  });
}

for (const zone of ["", "Not/AZone", "+05:00", "-06:00", " America/Chicago ", null, undefined]) {
  test(`invalid or absent timezone rejected: ${String(zone)}`, () => assert.throws(() => validatePropertyTimeZone(zone), RangeError));
}
test("IANA aliases are accepted and explicit UTC is valid", () => {
  assert.equal(validatePropertyTimeZone("US/Central"), "America/Chicago");
  assert.equal(validatePropertyTimeZone("UTC"), "UTC");
});
for (const grace of [0, 1, 2, 6, 60, 3.5, NaN, "3", null]) {
  test(`invalid grace rejected: ${String(grace)}`, () => assert.throws(() => getMonthlyBillingBoundaries("2026-10", grace), RangeError));
}
for (const cycle of ["0000-01", "2026-00", "2026-13", "2026-1", "2026-10-01", "invalid"]) {
  test(`invalid cycle rejected: ${cycle}`, () => assert.throws(() => getMonthlyBillingBoundaries(cycle, 3), RangeError));
}
for (const first of ["2026-02-30", "2026-11-02", "0000-01-01", "2026-11-01T00:00:00Z", date("invalid"), date("2026-11-01T05:00:00Z")]) {
  test(`invalid stored first date rejected: ${String(first)}`, () => assert.throws(() => getStandardCheckoutEligibility({
    propertyTimeZone: "America/Chicago", firstStandardBillingDate: first,
  }, date("2026-12-01T12:00:00Z")), RangeError));
}
test("invalid instant and unsupported calendar overflow are rejected", () => {
  assert.throws(() => getPropertyLocalDate(date("invalid"), "UTC"), RangeError);
  assert.throws(() => getFirstStandardBillingDate(date("9999-12-15T00:00:00Z"), "UTC"), RangeError);
  assert.throws(() => getPropertyLocalDate(date("0000-01-01T00:00:00Z"), "UTC"), RangeError);
  assert.throws(() => getPropertyBillingCalendar({ now: date("2026-10-01"), timeZone: "UTC", gracePeriodDays: 3 }), TypeError);
});

test("schema and additive migration declare nullable fields without backfill", () => {
  const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  const sql = readFileSync(path.join(root, "prisma/migrations/20261025120000_add_business_billing_calendar/migration.sql"), "utf8");
  assert.match(schema, /propertyTimeZone\s+String\?/);
  assert.match(schema, /firstStandardBillingDate\s+DateTime\?\s+@db.Date/);
  assert.equal(sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(),
    'ALTER TABLE "Business" ADD COLUMN "propertyTimeZone" TEXT, ADD COLUMN "firstStandardBillingDate" DATE;');
});
test("calendar authority stays pure and legacy calendar/webhook logic stay independent", () => {
  const ast = ts.createSourceFile("calendar.ts", source, ts.ScriptTarget.Latest, true);
  assert.equal(ast.statements.some(node => ts.isImportDeclaration(node)), false);
  for (const file of ["lib/billingCalendar.ts", "lib/stripePaymentWebhook.ts"]) {
    assert.doesNotMatch(readFileSync(path.join(root, file), "utf8"), /propertyBillingCalendar|managementBillingSetup/, file);
  }
});
