// lib/proration.ts

export type ProrationResult = {
  fullMonthRent: number;
  dailyRate: number;
  daysInMonth: number;
  billableDays: number;
  proratedRent: number;
};

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function getProrationSummary(
  moveInDate: Date,
  monthlyRent: number
): ProrationResult {
  const year = moveInDate.getFullYear();
  const month = moveInDate.getMonth();

  const daysInMonth = getDaysInMonth(moveInDate);

  const moveInDay = moveInDate.getDate();

  const billableDays = daysInMonth - moveInDay + 1;

  const dailyRate = monthlyRent / daysInMonth;

  const proratedRent = Number((dailyRate * billableDays).toFixed(2));

  return {
    fullMonthRent: monthlyRent,
    dailyRate: Number(dailyRate.toFixed(4)),
    daysInMonth,
    billableDays,
    proratedRent,
  };
}