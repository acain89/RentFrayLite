/**
 * Finalized RFL calendar authority for explicitly configured properties.
 * ISO date strings below represent property-local dates, never UTC instants.
 * UTC is used only as an integer day coordinate for Gregorian date arithmetic.
 * Existing billingCalendar.ts and historical financial snapshots stay unchanged.
 */
export type GracePeriodDays = 3 | 4 | 5;
export type CalendarDate = string;

const DAY_MS = 86_400_000;

function requireInstant(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new RangeError("A valid timestamp is required.");
  }
}

function dayCoordinate(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const coordinate = date.getTime() / DAY_MS;
  if (!Number.isSafeInteger(coordinate)) throw new RangeError("Unsupported calendar date.");
  return coordinate;
}

function formatDate(year: number, month: number, day: number): CalendarDate {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("Calendar years must be from 0001 through 9999.");
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: CalendarDate): { year: number; month: number; day: number; coordinate: number } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError("A YYYY-MM-DD calendar date is required.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const coordinate = dayCoordinate(year, month, day);
  const roundTrip = new Date(coordinate * DAY_MS);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 ||
      roundTrip.getUTCFullYear() !== year || roundTrip.getUTCMonth() + 1 !== month || roundTrip.getUTCDate() !== day) {
    throw new RangeError("Invalid Gregorian calendar date.");
  }
  return { year, month, day, coordinate };
}

/** Validate against the runtime's IANA timezone database; return its canonical name. */
export function validatePropertyTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim() || /^[+-]/.test(value)) {
    throw new RangeError("An explicit named IANA property timezone is required.");
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new RangeError("Invalid IANA property timezone.");
  }
}

export function getPropertyLocalDate(instant: Date, timeZone: string): CalendarDate {
  requireInstant(instant);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validatePropertyTimeZone(timeZone), calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit", era: "short",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value;
  if (part("era") !== "AD") throw new RangeError("Unsupported calendar era.");
  const result = formatDate(Number(part("year")), Number(part("month")), Number(part("day")));
  parseDate(result);
  return result;
}

/** Strictly the next month's 1st, even when creation occurs on the local 1st. */
export function getFirstStandardBillingDate(createdAt: Date, timeZone: string): CalendarDate {
  const { year, month } = parseDate(getPropertyLocalDate(createdAt, timeZone));
  return formatDate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1);
}

export function getMonthlyBillingBoundaries(billingCycle: string, gracePeriodDays: GracePeriodDays) {
  if (typeof billingCycle !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingCycle)) {
    throw new RangeError("A YYYY-MM billing cycle is required.");
  }
  if (gracePeriodDays !== 3 && gracePeriodDays !== 4 && gracePeriodDays !== 5) {
    throw new RangeError("Grace period must be 3, 4, or 5 calendar days.");
  }
  const { year, month } = parseDate(`${billingCycle}-01`);
  return {
    billingCycle,
    dueDate: formatDate(year, month, 1),
    graceLastDate: formatDate(year, month, gracePeriodDays),
    // Grace expires at the start of this local date, not at UTC midnight.
    graceExpiresOn: formatDate(year, month, gracePeriodDays + 1),
    initialLateFeeStartsOn: formatDate(year, month, gracePeriodDays + 1),
    dailyLateFeeStartsOn: formatDate(year, month, gracePeriodDays + 2),
  };
}

export function getPropertyBillingCalendar(input: {
  timeZone: string;
  gracePeriodDays: GracePeriodDays;
  dailyLateFeesEnabled: boolean;
  now: Date;
}) {
  if (typeof input.dailyLateFeesEnabled !== "boolean") throw new TypeError("Daily fee enablement must be explicit.");
  const localDate = getPropertyLocalDate(input.now, input.timeZone);
  const boundaries = getMonthlyBillingBoundaries(localDate.slice(0, 7), input.gracePeriodDays);
  const dailyLateFeeDays = input.dailyLateFeesEnabled
    ? Math.max(0, parseDate(localDate).coordinate - parseDate(boundaries.dailyLateFeeStartsOn).coordinate + 1)
    : 0;
  return {
    ...boundaries,
    localDate,
    daysLateAfterGrace: Math.max(0, parseDate(localDate).coordinate - parseDate(boundaries.graceLastDate).coordinate),
    isWithinGracePeriod: localDate <= boundaries.graceLastDate,
    initialLateFeeEligible: localDate >= boundaries.initialLateFeeStartsOn,
    dailyLateFeeEligible: dailyLateFeeDays > 0,
    // Calendar count only; a future pricing consumer must apply any configured cap.
    dailyLateFeeDays,
  };
}

function storedFirstDate(value: CalendarDate | Date): CalendarDate {
  let result: CalendarDate;
  if (value instanceof Date) {
    requireInstant(value);
    // SQL DATE is transported by Prisma at UTC midnight. Never timezone-convert it.
    if (value.getUTCHours() || value.getUTCMinutes() || value.getUTCSeconds() || value.getUTCMilliseconds()) {
      throw new RangeError("Stored billing date must be a SQL DATE representation.");
    }
    result = formatDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  } else {
    result = value;
  }
  if (parseDate(result).day !== 1) throw new RangeError("First billing date must be the 1st.");
  return result;
}

export type StandardCheckoutEligibility =
  | { eligible: false; reason: "CALENDAR_UNCONFIGURED" }
  | { eligible: boolean; reason: "BEFORE_FIRST_CYCLE" | "ELIGIBLE"; localDate: CalendarDate; firstStandardBillingDate: CalendarDate };

/** Missing facts remain unknown; callers must explicitly distinguish legacy state. */
export function getStandardCheckoutEligibility(property: {
  propertyTimeZone?: string | null;
  firstStandardBillingDate?: CalendarDate | Date | null;
}, now: Date): StandardCheckoutEligibility {
  if (property.propertyTimeZone == null || property.firstStandardBillingDate == null) {
    return { eligible: false, reason: "CALENDAR_UNCONFIGURED" };
  }
  const localDate = getPropertyLocalDate(now, property.propertyTimeZone);
  const firstStandardBillingDate = storedFirstDate(property.firstStandardBillingDate);
  const eligible = localDate >= firstStandardBillingDate;
  return { eligible, reason: eligible ? "ELIGIBLE" : "BEFORE_FIRST_CYCLE", localDate, firstStandardBillingDate };
}
