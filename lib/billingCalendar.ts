// lib/billingCalendar.ts

/**
 * RentFrayLite billing calendar authority.
 *
 * SINGLE SOURCE OF TRUTH for:
 * - billing-cycle keys
 * - monthly due dates
 * - grace-period boundaries
 * - initial late-fee eligibility
 * - daily late-fee day counts
 * - month-length clamping
 *
 * All financial consumers must use this module instead of independently
 * calculating billing-cycle or late-fee dates.
 */

export type BillingCalendarRules = {
  dueDay: number;
  gracePeriodDays: number;
  dailyLateFeeMaxDays: number;
};

export type BillingCalendarState = {
  billingCycle: string;

  dueDay: number;
  dueDate: Date;

  gracePeriodDays: number;
  graceEndsAt: Date;

  isBeforeDueDate: boolean;
  isDue: boolean;
  isWithinGracePeriod: boolean;
  isPastGracePeriod: boolean;

  daysLateAfterGrace: number;

  initialLateFeeEligible: boolean;

  dailyLateFeeStartDate: Date;
  dailyLateFeeDays: number;

  evaluatedAt: Date;
};

const MILLISECONDS_PER_DAY = 86_400_000;

export function isValidBillingCycle(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date.`);
  }
}

function assertIntegerInRange(
  value: number,
  fieldName: string,
  minimum: number,
  maximum: number
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${fieldName} must be an integer from ${minimum} through ${maximum}.`
    );
  }
}

/**
 * Normalize a timestamp to UTC midnight.
 *
 * RFL financial calendar calculations deliberately use UTC calendar dates
 * so server timezone and daylight-saving changes cannot move a payment into
 * a different billing day.
 */
export function startOfUtcDay(value: Date): Date {
  assertValidDate(value, "value");

  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    )
  );
}

export function addUtcDays(value: Date, days: number): Date {
  assertValidDate(value, "value");

  if (!Number.isSafeInteger(days)) {
    throw new Error("days must be a safe integer.");
  }

  const result = startOfUtcDay(value);
  result.setUTCDate(result.getUTCDate() + days);

  return result;
}

export function differenceInUtcCalendarDays(
  laterDate: Date,
  earlierDate: Date
): number {
  const later = startOfUtcDay(laterDate);
  const earlier = startOfUtcDay(earlierDate);

  return Math.floor(
    (later.getTime() - earlier.getTime()) /
      MILLISECONDS_PER_DAY
  );
}

export function getUtcMonthLength(
  year: number,
  monthIndex: number
): number {
  if (!Number.isSafeInteger(year)) {
    throw new Error("year must be a safe integer.");
  }

  if (
    !Number.isSafeInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    throw new Error("monthIndex must be from 0 through 11.");
  }

  return new Date(
    Date.UTC(year, monthIndex + 1, 0)
  ).getUTCDate();
}

/**
 * A configured due day may be 29, 30, or 31.
 *
 * For shorter months, the due date becomes that month's final calendar day.
 * Example:
 * - dueDay 31 in February 2027 => February 28, 2027.
 */
export function clampDueDay(
  year: number,
  monthIndex: number,
  configuredDueDay: number
): number {
  assertIntegerInRange(
    configuredDueDay,
    "configuredDueDay",
    1,
    31
  );

  return Math.min(
    configuredDueDay,
    getUtcMonthLength(year, monthIndex)
  );
}

/**
 * Canonical RFL billing-cycle key.
 *
 * Example:
 * August 2026 => "2026-08"
 */
export function getBillingCycle(value: Date): string {
  assertValidDate(value, "value");

  const year = value.getUTCFullYear();
  const month = String(
    value.getUTCMonth() + 1
  ).padStart(2, "0");

  return `${year}-${month}`;
}

export function formatBillingCycleLabel(
  billingCycle: string
): string {
  const normalized = String(billingCycle ?? "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(normalized);

  if (!match) {
    return normalized;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (
    !Number.isSafeInteger(year) ||
    !Number.isSafeInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return normalized;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

/**
 * Sole authority for the current recurring-plan billing calendar.
 *
 * Existing RFL behavior intentionally treats gracePeriodDays as inclusive
 * of the due date:
 *
 * due date = Aug 1
 * gracePeriodDays = 5
 * grace ends = Aug 5
 * initial late fee becomes eligible = Aug 6
 * first daily late-fee day = Aug 7
 */
export function getBillingCalendar(
  rules: BillingCalendarRules,
  now: Date = new Date()
): BillingCalendarState {
  assertValidDate(now, "now");

  assertIntegerInRange(
    rules.dueDay,
    "dueDay",
    1,
    31
  );

  assertIntegerInRange(
    rules.gracePeriodDays,
    "gracePeriodDays",
    1,
    60
  );

  assertIntegerInRange(
    rules.dailyLateFeeMaxDays,
    "dailyLateFeeMaxDays",
    0,
    365
  );

  const evaluatedAt = startOfUtcDay(now);

  const year = evaluatedAt.getUTCFullYear();
  const monthIndex = evaluatedAt.getUTCMonth();

  const dueDay = clampDueDay(
    year,
    monthIndex,
    rules.dueDay
  );

  const dueDate = new Date(
    Date.UTC(year, monthIndex, dueDay)
  );

  /*
   * Grace days include the due date.
   *
   * Example:
   * due Aug 1 + 5 grace days => grace ends Aug 5.
   */
  const graceEndsAt = addUtcDays(
    dueDate,
    rules.gracePeriodDays - 1
  );

  /*
   * The initial late fee begins the calendar day after grace expires.
   */
  const initialLateFeeDate = addUtcDays(
    graceEndsAt,
    1
  );

  /*
   * Daily late fees begin the day after the initial late fee.
   */
  const dailyLateFeeStartDate = addUtcDays(
    initialLateFeeDate,
    1
  );

  const daysFromGraceEnd =
    differenceInUtcCalendarDays(
      evaluatedAt,
      graceEndsAt
    );

  const daysLateAfterGrace = Math.max(
    daysFromGraceEnd,
    0
  );

  const initialLateFeeEligible =
    evaluatedAt.getTime() >=
    initialLateFeeDate.getTime();

  const uncappedDailyLateFeeDays =
    initialLateFeeEligible
      ? Math.max(daysLateAfterGrace - 1, 0)
      : 0;

  const dailyLateFeeDays = Math.min(
    uncappedDailyLateFeeDays,
    rules.dailyLateFeeMaxDays
  );

  const evaluatedTime = evaluatedAt.getTime();
  const dueTime = dueDate.getTime();
  const graceEndTime = graceEndsAt.getTime();

  const isBeforeDueDate =
    evaluatedTime < dueTime;

  const isDue =
    evaluatedTime === dueTime;

  const isWithinGracePeriod =
    evaluatedTime >= dueTime &&
    evaluatedTime <= graceEndTime;

  const isPastGracePeriod =
    evaluatedTime > graceEndTime;

  return {
    billingCycle: getBillingCycle(evaluatedAt),

    dueDay,
    dueDate,

    gracePeriodDays: rules.gracePeriodDays,
    graceEndsAt,

    isBeforeDueDate,
    isDue,
    isWithinGracePeriod,
    isPastGracePeriod,

    daysLateAfterGrace,

    initialLateFeeEligible,

    dailyLateFeeStartDate,
    dailyLateFeeDays,

    evaluatedAt,
  };
}
