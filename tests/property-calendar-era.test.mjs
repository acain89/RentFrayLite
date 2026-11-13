import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { managementBillingHarness } from "./helpers/management-billing-harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
const source = readFileSync(path.join(root, "lib/propertyBillingCalendar.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const nativeFormatter = Intl.DateTimeFormat;
// Emulate an ISO-calendar era representation; this is not a claim about Render's unrecorded ICU output.
function formatterWithIsoEra(era) {
  return new Proxy(nativeFormatter, { construct(target, args) {
    const formatter = Reflect.construct(target, args);
    if (args[1]?.calendar !== "iso8601") return formatter;
    return new Proxy(formatter, { get(target, key) {
      if (key === "formatToParts") return value => target.formatToParts(value)
        .filter(part => era !== null || part.type !== "era")
        .map(part => part.type === "era" ? { ...part, value: era } : part);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  } });
}
function loadCalendar(DateTimeFormat = nativeFormatter) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date, Intl: { DateTimeFormat }, RangeError, TypeError,
    require(name) { throw Error(`Forbidden calendar dependency: ${name}`); },
  }, { timeout: 1000 });
  return exports;
}
for (const era of ["CE", null]) {
  test(`Gregorian date extraction does not depend on ISO era ${era}`, () => {
    const c = loadCalendar(formatterWithIsoEra(era));
    assert.equal(c.getPropertyLocalDate(new Date("2026-10-15T12:00:00Z"), "America/Chicago"), "2026-10-15");
    assert.equal(c.getFirstStandardBillingDate(new Date("2026-10-15T12:00:00Z"), "America/Chicago"), "2026-11-01");
  });
  test(`registration succeeds with ISO era ${era}`, async () => {
    Intl.DateTimeFormat = formatterWithIsoEra(era);
    try {
      const h = managementBillingHarness();
      const response = await h.load("app/api/setup/route.ts").POST(h.request({
        businessName: "Test Property", ownerName: "Test Manager", email: "manager@example.test", password: "Isolated-passphrase1", confirmPassword: "Isolated-passphrase1",
        acceptedTerms: true, propertyTimeZone: "America/Chicago",
      }));
      assert.equal(response.status, 201);
      const [business] = h.state().businesses;
      assert.equal(business.propertyTimeZone, "America/Chicago");
      assert.equal(business.firstStandardBillingDate.toISOString(), "2026-11-01T00:00:00.000Z");
      assert.equal(h.state().managers.length, 1);
    } finally { Intl.DateTimeFormat = nativeFormatter; }
  });
}
const calendar = loadCalendar();
for (const zone of ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Adak", "Pacific/Honolulu"]) {
  test(`supported timezone preserved: ${zone}`, () => {
    assert.equal(calendar.getPropertyLocalDate(new Date("2026-10-15T12:00:00Z"), zone), "2026-10-15");
    assert.equal(calendar.getFirstStandardBillingDate(new Date("2026-10-15T12:00:00Z"), zone), "2026-11-01");
  });
}
for (const [instant, date, first] of [
  ["2026-03-01T05:59:59.999Z", "2026-02-28", "2026-03-01"],
  ["2026-03-01T06:00:00Z", "2026-03-01", "2026-04-01"],
  ["2026-03-08T07:59:59.999Z", "2026-03-08", "2026-04-01"],
  ["2026-03-08T08:00:00Z", "2026-03-08", "2026-04-01"],
  ["2026-11-01T06:59:59.999Z", "2026-11-01", "2026-12-01"],
  ["2026-11-01T07:00:00Z", "2026-11-01", "2026-12-01"],
  ["2027-01-01T05:59:59.999Z", "2026-12-31", "2027-01-01"],
  ["2027-01-01T06:00:00Z", "2027-01-01", "2027-02-01"],
]) test(`Chicago local boundary ${instant}`, () => {
  assert.equal(calendar.getPropertyLocalDate(new Date(instant), "America/Chicago"), date);
  assert.equal(calendar.getFirstStandardBillingDate(new Date(instant), "America/Chicago"), first);
});
test("BCE and invalid instants/timezones remain rejected", () => {
  assert.throws(() => calendar.getPropertyLocalDate(new Date("0000-01-01T12:00:00Z"), "UTC"), /Unsupported calendar era/);
  assert.throws(() => calendar.getPropertyLocalDate(new Date(NaN), "America/Chicago"), /valid timestamp/);
  assert.throws(() => calendar.getPropertyLocalDate(new Date(), "bad/zone"), /Invalid IANA/);
  assert.equal(calendar.getPropertyLocalDate(new Date("0001-01-01T12:00:00Z"), "America/Chicago"), "0001-01-01");
});
