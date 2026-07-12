// lib/billingConfig.ts

/*
========================================================
PROCESSING FEE SYSTEM (SINGLE SOURCE OF TRUTH)
========================================================

Rules:
- ALL values in cents
- NO floats anywhere in financial calculations
- Used by BOTH backend + UI
- Must be the ONLY place fees are calculated
========================================================
*/

type FeeTier = {
  maxAmountCents: number;
  feeCents: number;
};

/*
========================================================
FEE TIERS (CENTS)
amountCents < maxAmountCents => feeCents
========================================================
*/

const FEE_TIERS: FeeTier[] = [
  { maxAmountCents: 10_000, feeCents: 295 }, // amounts under $100.00
  { maxAmountCents: 20_000, feeCents: 395 }, // amounts under $200.00
  { maxAmountCents: 30_000, feeCents: 495 }, // amounts under $300.00
  { maxAmountCents: 40_000, feeCents: 595 }, // amounts under $400.00
  { maxAmountCents: 50_000, feeCents: 695 }, // amounts under $500.00
  { maxAmountCents: 80_000, feeCents: 795 }, // amounts under $800.00
  { maxAmountCents: 90_000, feeCents: 895 }, // amounts under $900.00
];

const MAX_FEE_CENTS = 995; // $9.95

function assertValidCents(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${fieldName} passed to billingConfig`);
  }
}

/*
========================================================
GET PROCESSING FEE
========================================================
*/

export function getProcessingFeeCents(amountCents: number): number {
  assertValidCents(amountCents, "amountCents");

  for (const tier of FEE_TIERS) {
    if (amountCents < tier.maxAmountCents) {
      return tier.feeCents;
    }
  }

  return MAX_FEE_CENTS;
}

/*
========================================================
TOTAL WITH FEE
========================================================
*/

export function getTotalWithFeeCents(amountCents: number): {
  amountCents: number;
  feeCents: number;
  totalCents: number;
} {
  assertValidCents(amountCents, "amountCents");

  const feeCents = getProcessingFeeCents(amountCents);
  const totalCents = amountCents + feeCents;

  assertValidCents(totalCents, "totalCents");

  return {
    amountCents,
    feeCents,
    totalCents,
  };
}

/*
========================================================
DISPLAY HELPERS (STRING SAFE, NO FLOAT MATH)
========================================================
*/

export function formatCentsToDollars(cents: number): string {
  const normalized = Number.isInteger(cents) ? cents : Math.trunc(Number(cents) || 0);
  const sign = normalized < 0 ? "-" : "";
  const absoluteCents = Math.abs(normalized);
  const dollars = Math.trunc(absoluteCents / 100);
  const remainder = String(absoluteCents % 100).padStart(2, "0");

  return `${sign}${dollars}.${remainder}`;
}

export function formatBillingCycleLabel(billingCycle: string): string {
  const trimmed = String(billingCycle ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const [yearString, monthString] = trimmed.split("-");
  const year = Number(yearString);
  const month = Number(monthString);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return trimmed;
  }

  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}