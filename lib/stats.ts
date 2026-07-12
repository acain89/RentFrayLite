// lib/stats.ts

function getUtcDayOfMonth(date: Date): number {
  return date.getUTCDate();
}

function getUtcMonthKey(date: Date): number {
  return date.getUTCFullYear() * 100 + (date.getUTCMonth() + 1);
}

function getWeekSeed(date: Date): number {
  const start = Date.UTC(2026, 3, 1); // Apr 1, 2026 baseline
  const now = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const diffDays = Math.floor((now - start) / 86400000);
  return Math.max(0, Math.floor(diffDays / 7));
}

export function getSeededLivePropertyCount(
  realCount: number,
  now: Date = new Date()
): number {
  const baseline = 18;
  const weeklyGrowth = getWeekSeed(now); // +1 property per week
  const seededCount = baseline + weeklyGrowth;

  return Math.max(realCount, seededCount);
}

export function getSeededTenantsPaidToday(
  realCount: number,
  now: Date = new Date()
): number {
  const day = getUtcDayOfMonth(now);

  let seededCount = 0;

  if (day === 1) seededCount = 96;
  else if (day === 2) seededCount = 82;
  else if (day === 3) seededCount = 67;
  else if (day === 4) seededCount = 44;
  else if (day === 5) seededCount = 29;
  else if (day >= 6 && day <= 10) seededCount = 14;
  else if (day >= 11 && day <= 15) seededCount = 8;
  else if (day >= 16 && day <= 20) seededCount = 5;
  else if (day >= 21 && day <= 25) seededCount = 3;
  else seededCount = 4; // end-of-month catch-up payers

  return Math.max(realCount, seededCount);
}

export function getSeededMonthlyProcessedCents(
  realCents: number,
  now: Date = new Date()
): number {
  const monthKey = getUtcMonthKey(now);
  const day = getUtcDayOfMonth(now);

  // baseline monthly target that grows slowly over time with property growth
  const baselineProperties = getSeededLivePropertyCount(0, now);
  const targetMonthlyCents = baselineProperties * 185000; // about $1,850 per property

  // realistic rent-collection curve across the month
  let pct = 0;

  if (day === 1) pct = 0.22;
  else if (day === 2) pct = 0.41;
  else if (day === 3) pct = 0.57;
  else if (day === 4) pct = 0.68;
  else if (day === 5) pct = 0.75;
  else if (day <= 7) pct = 0.81;
  else if (day <= 10) pct = 0.86;
  else if (day <= 15) pct = 0.91;
  else if (day <= 20) pct = 0.95;
  else if (day <= 25) pct = 0.97;
  else pct = 0.99;

  // tiny deterministic monthly variation so it feels alive but stable
  const monthVariation = (monthKey % 7) * 12500;

  const seededCents = Math.round(targetMonthlyCents * pct) + monthVariation;

  return Math.max(realCents, seededCents);
}