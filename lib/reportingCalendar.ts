import { getPropertyLocalDate, validatePropertyTimeZone } from "@/lib/propertyBillingCalendar";

/** Display compatibility only. Never persists or infers a historical timezone. */
export function reportingTimeZone(value: string | null): string {
  if (value === null) return "UTC";
  return validatePropertyTimeZone(value);
}

/** Presentation only; reuse one formatter within a render/report, not a cache. */
export function reportingTimestampFormatter(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: validatePropertyTimeZone(timeZone),
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
  return (value: Date | string) => formatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatReportingTimestamp(value: Date | string, timeZone: string): string {
  return reportingTimestampFormatter(timeZone)(value);
}

export function reportingDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Use a YYYY-MM-DD date.");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < "0001-01-01" || value > "9998-12-31") {
    throw new RangeError("Invalid report date.");
  }
  return date;
}

export function nextReportingDate(value: string): string {
  return new Date(reportingDate(value).getTime() + 86400000).toISOString().slice(0, 10);
}

/** First instant of a local calendar date. Binary search handles DST, including
 * midnight offset changes, without server-local Date getters or fixed offsets.
 * A skipped local date fails closed rather than shifting a report silently. */
export function reportingDayStart(value: string, timeZone: string): Date {
  const coordinate = reportingDate(value).getTime(), zone = validatePropertyTimeZone(timeZone);
  let lo = coordinate - 2 * 86400000, hi = coordinate + 2 * 86400000;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (getPropertyLocalDate(new Date(mid), zone) < value) lo = mid + 1;
    else hi = mid;
  }
  const start = new Date(lo);
  if (getPropertyLocalDate(start, zone) !== value) throw new RangeError("This local report date does not exist.");
  return start;
}

export function reportingMonthRange(cycle: string, timeZone: string) {
  const first = reportingDate(cycle + "-01"), year = first.getUTCFullYear(), month = first.getUTCMonth() + 1;
  const next = `${String(month === 12 ? year + 1 : year).padStart(4, "0")}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`;
  return { gte: reportingDayStart(cycle + "-01", timeZone), lt: reportingDayStart(next, timeZone) };
}
