
// /lib/rentDates.ts

type NullableDate = Date | null;

export type RentDateConfig = {
  dueDay: number;
  gracePeriodDays: number;
  lateFeeEnabled: boolean;
  lateFeeInitialCents: number;
  lateFeeDailyCents: number;
  maxLateFeeDays: number;
  now?: Date;
  billingCycleStartDate?: Date | null;
};

export type RentDateSummary = {
  billingCycle: string;
  dueDate: string;
  graceEndsOn: string;
  initialLateFeeDate: string | null;
  dailyLateFeeStartDate: string | null;
  dailyLateFeeLastDate: string | null;
  isDelinquent: boolean;
};

export type EffectiveBillingSettings = {
  dueDay: number;
  gracePeriodDays: number;
  lateFeeEnabled: boolean;
  lateFeeInitialCents: number;
  lateFeeDailyCents: number;
  maxLateFeeDays: number;
};

/* -------------------- */
/* TIMEZONE UTILITIES   */
/* -------------------- */

const CHICAGO_TZ = "America/Chicago";

export function getBusinessDate(now: Date = new Date()): Date {
  const { year, month, day } = getChicagoParts(now);

  return new Date(
    year,
    month - 1,
    day,
    0,
    0,
    0,
    0
  );
}

function getChicagoParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  parts.forEach((p) => {
    if (p.type !== "literal") map[p.type] = p.value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function clampDay(year: number, month: number, day: number): number {
  const max = daysInMonth(year, month);
  return Math.max(1, Math.min(day, max));
}

function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/* -------------------- */
/* CONFIG RESOLUTION    */
/* -------------------- */

export function resolveEffectiveBillingSettings(input: {
  tier?: {
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeInitialCents: number;
    lateFeeDailyCents: number;
    maxLateFeeDays: number;
  } | null;
  propertySettings?: {
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeEnabled: boolean;
    lateFeeFlatCents?: number | null;
  } | null;
}): EffectiveBillingSettings {
  const tier = input.tier;
  const ps = input.propertySettings;

  if (tier) {
    return {
      dueDay: sanitizeInt(tier.rentDueDay, 1),
      gracePeriodDays: sanitizeInt(tier.gracePeriodDays, 0),
      lateFeeEnabled:
        tier.lateFeeInitialCents > 0 || tier.lateFeeDailyCents > 0,
      lateFeeInitialCents: sanitizeInt(tier.lateFeeInitialCents, 0),
      lateFeeDailyCents: sanitizeInt(tier.lateFeeDailyCents, 0),
      maxLateFeeDays: sanitizeInt(tier.maxLateFeeDays, 0),
    };
  }

  return {
    dueDay: sanitizeInt(ps?.rentDueDay ?? 1, 1),
    gracePeriodDays: sanitizeInt(ps?.gracePeriodDays ?? 0, 0),
    lateFeeEnabled: Boolean(ps?.lateFeeEnabled),
    lateFeeInitialCents: sanitizeInt(ps?.lateFeeFlatCents ?? 0, 0),
    lateFeeDailyCents: 0,
    maxLateFeeDays: 0,
  };
}

function sanitizeInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

/* -------------------- */
/* CORE AUTHORITY       */
/* -------------------- */

export function getRentDateSummary(
  config: RentDateConfig
): RentDateSummary {
  const now = config.now ?? new Date();

  const { year, month, day } = getChicagoParts(now);

  // Determine correct billing cycle based on due date
  const isBeforeDueDay = day < config.dueDay;

  const cycleMonth = isBeforeDueDay
    ? month === 1
      ? 12
      : month - 1
    : month;

  const cycleYear =
    isBeforeDueDay && month === 1 ? year - 1 : year;

  const safeDueDay = clampDay(
    cycleYear,
    cycleMonth,
    config.dueDay
  );

  const dueDate = new Date(
    cycleYear,
    cycleMonth - 1,
    safeDueDay
  );

     // 🔒 HARD START DATE LOCK
  // If the calculated billing cycle would begin before the property's
  // official billing start date, move the first cycle forward to the first
  // valid due date on or after that start date.
  if (config.billingCycleStartDate) {
    const start = getBusinessDate(config.billingCycleStartDate);

    if (dueDate < start) {
      let startYear = start.getFullYear();
      let startMonth = start.getMonth() + 1;

      let safeStartDueDay = clampDay(startYear, startMonth, config.dueDay);

      let newDueDate = new Date(
        startYear,
        startMonth - 1,
        safeStartDueDay
      );

      if (newDueDate < start) {
        if (startMonth === 12) {
          startMonth = 1;
          startYear += 1;
        } else {
          startMonth += 1;
        }

        safeStartDueDay = clampDay(startYear, startMonth, config.dueDay);

        newDueDate = new Date(
          startYear,
          startMonth - 1,
          safeStartDueDay
        );
      }

      const newGraceEnds = addDays(
        newDueDate,
        Math.max(0, config.gracePeriodDays)
      );

      return {
        billingCycle: `${startYear}-${String(startMonth).padStart(2, "0")}`,
        dueDate: toDateOnlyString(newDueDate),
        graceEndsOn: toDateOnlyString(newGraceEnds),
        initialLateFeeDate:
          config.lateFeeEnabled && config.lateFeeInitialCents > 0
            ? toDateOnlyString(addDays(newGraceEnds, 1))
            : null,
        dailyLateFeeStartDate:
          config.lateFeeEnabled &&
          config.lateFeeDailyCents > 0 &&
          config.maxLateFeeDays > 0
            ? toDateOnlyString(
                addDays(
                  config.lateFeeInitialCents > 0
                    ? addDays(newGraceEnds, 1)
                    : newGraceEnds,
                  1
                )
              )
            : null,
        dailyLateFeeLastDate: null,
        isDelinquent: false,
      };
    }
  }

const graceEnds = addDays(
  dueDate,
  Math.max(0, config.gracePeriodDays)
);

  let initialLateFeeDate: NullableDate = null;
  let dailyLateFeeStartDate: NullableDate = null;
  let dailyLateFeeLastDate: NullableDate = null;

  if (config.lateFeeEnabled) {
    if (config.lateFeeInitialCents > 0) {
      initialLateFeeDate = addDays(graceEnds, 1);
    }

    if (
      config.lateFeeDailyCents > 0 &&
      config.maxLateFeeDays > 0
    ) {
      const start =
        initialLateFeeDate ?? addDays(graceEnds, 1);

      dailyLateFeeStartDate = addDays(start, 1);
      dailyLateFeeLastDate = addDays(
        dailyLateFeeStartDate,
        config.maxLateFeeDays - 1
      );
    }
  }

  const today = getBusinessDate(now);

  const isDelinquent = today > graceEnds;

  return {
    billingCycle: `${cycleYear}-${String(cycleMonth).padStart(2, "0")}`,
    dueDate: toDateOnlyString(dueDate),
    graceEndsOn: toDateOnlyString(graceEnds),
    initialLateFeeDate: initialLateFeeDate
      ? toDateOnlyString(initialLateFeeDate)
      : null,
    dailyLateFeeStartDate: dailyLateFeeStartDate
      ? toDateOnlyString(dailyLateFeeStartDate)
      : null,
    dailyLateFeeLastDate: dailyLateFeeLastDate
      ? toDateOnlyString(dailyLateFeeLastDate)
      : null,
    isDelinquent,
  };
}