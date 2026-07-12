import { getRentDateSummary } from "@/lib/rentDates";

type RentPreviewInput = {
  billingDay: number;
  marketRent: number;
  ledgerEntries: {
    type: string;
    effectiveDate: Date | string;
    amount: number;
  }[];
};

function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnly(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  return new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
}

function getNextBillingDate(currentDueDate: Date, billingDay: number): Date {
  const nextYear =
    currentDueDate.getMonth() === 11
      ? currentDueDate.getFullYear() + 1
      : currentDueDate.getFullYear();

  const nextMonth =
    currentDueDate.getMonth() === 11 ? 0 : currentDueDate.getMonth() + 1;

  const lastDayOfNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, billingDay), lastDayOfNextMonth);

  return toDateOnly(new Date(nextYear, nextMonth, safeDay));
}

export function getRentPreview({
  billingDay,
  marketRent,
  ledgerEntries,
}: RentPreviewInput) {
  const today = toDateOnly(new Date());

  const rentDates = getRentDateSummary({
    dueDay: billingDay,
    gracePeriodDays: 0,
    lateFeeEnabled: false,
    lateFeeInitialCents: 0,
    lateFeeDailyCents: 0,
    maxLateFeeDays: 0,
    now: today,
  });

  const cycleStart = parseDateOnly(rentDates.dueDate);
  const nextBillingDate = getNextBillingDate(cycleStart, billingDay);

  const hasChargeThisCycle = ledgerEntries.some((entry) => {
    if (entry.type !== "RENT_CHARGE") return false;

    const d = toDateOnly(new Date(entry.effectiveDate));
    return d >= cycleStart && d < nextBillingDate;
  });

  const upcomingCharge = hasChargeThisCycle
    ? null
    : {
        type: "RENT_CHARGE",
        amount: Number(marketRent || 0),
        effectiveDate: nextBillingDate,
      };

  return {
    cycleStart,
    nextBillingDate,
    hasChargeThisCycle,
    upcomingCharge,
    evaluatedAt: today,
  };
}