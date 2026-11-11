/** Code-only activation gate. No environment, request or database override. */
export function instantPayoutExecutionEnabled(): false { return false; }

export const INSTANT_PAYOUT_PRICING_VERSION = "RFL_INSTANT_250_BPS_V1";

/** Selected amount is the gross management budget, not the Stripe payout amount.
 * Round 1/40 of that budget to the nearest cent, ties up. No minimum fee.
 * Additional Stripe costs are unknown and deliberately excluded from this quote.
 */
export function quoteInstantPayout(selectedAmountCents: number) {
  if (!Number.isSafeInteger(selectedAmountCents) || selectedAmountCents < 1 || selectedAmountCents > 2147483647) {
    throw new RangeError("A positive integer-cent payout amount is required.");
  }
  const feeCents = Math.floor(selectedAmountCents / 40) + (selectedAmountCents % 40 >= 20 ? 1 : 0);
  return Object.freeze({ pricingVersion: INSTANT_PAYOUT_PRICING_VERSION, selectedAmountCents, feeCents,
    estimatedReceivedCents: selectedAmountCents - feeCents, stripeCostCents: null });
}

export type InstantPayoutQuote = ReturnType<typeof quoteInstantPayout>;

/** This stage has no Stripe mutation transport, including in test mode. */
export async function executeInstantPayout(): Promise<never> {
  throw new Error("Instant Payouts are disabled pending Stripe eligibility and fee-collection verification.");
}
