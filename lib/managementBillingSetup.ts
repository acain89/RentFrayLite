import { getFirstStandardBillingDate, validatePropertyTimeZone } from "@/lib/propertyBillingCalendar";

export const PROPERTY_TIME_ZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona (no daylight saving time)" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "America/Adak", label: "Aleutian" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
] as const;

export function isSupportedPropertyTimeZone(value: unknown): boolean {
  try {
    const canonical = validatePropertyTimeZone(value);
    return PROPERTY_TIME_ZONE_OPTIONS.some(option => option.value === canonical);
  } catch {
    return false;
  }
}

/** New accounts only. Call with the original database-created timestamp. */
export function getNewBusinessCalendar(createdAt: Date, selectedTimeZone: string) {
  if (!isSupportedPropertyTimeZone(selectedTimeZone)) throw new RangeError("Choose a supported U.S. property timezone.");
  const propertyTimeZone = validatePropertyTimeZone(selectedTimeZone);
  const localDate = getFirstStandardBillingDate(createdAt, propertyTimeZone);
  return { propertyTimeZone, firstStandardBillingDate: new Date(`${localDate}T00:00:00.000Z`) };
}

/** SQL DATE label: do not convert this date-only value into the property timezone. */
export function getFirstBillingDateLabel(value: Date): string {
  if (!Number.isFinite(value.getTime()) || value.getUTCDate() !== 1 ||
      value.getUTCHours() || value.getUTCMinutes() || value.getUTCSeconds() || value.getUTCMilliseconds()) {
    throw new RangeError("Invalid stored first billing date.");
  }
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(value);
}
