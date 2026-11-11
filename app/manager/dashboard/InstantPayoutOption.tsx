import { instantPayoutExecutionEnabled } from "@/lib/instantPayoutPolicy";
import type { InstantPayoutReadiness } from "@/lib/instantPayoutReadiness";

/** Prepared management view; intentionally unmounted. No route or action.
 * Activation requires reviewed server evidence, amount entry/requote, a fresh
 * confirmation, and a separately approved execution handler. */
export default function InstantPayoutOption({ report }: { report: InstantPayoutReadiness }) {
  if (!instantPayoutExecutionEnabled() || !report.eligible) return null;
  const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return <section aria-label="Instant Payout">
    <h2>Instant Payout</h2>
    <p>Eligible settled funds: {dollars(report.availableCents)}</p>
    <p>Selected amount: {dollars(report.quote.selectedAmountCents)}</p>
    <p>RFL fee (2.5%): {dollars(report.quote.feeCents)}</p>
    <p>Estimated amount received: {dollars(report.quote.estimatedReceivedCents)}</p>
    <p>Arrival time is not guaranteed.</p>
    <button type="button" disabled>Confirm Instant Payout</button>
  </section>;
}
