// Stripe Checkout payment mode allows at most 100 line items:
// https://docs.stripe.com/api/checkout/sessions/create#line_items
export const STRIPE_CHECKOUT_PAYMENT_MAX_LINE_ITEMS = 100;

export type StripeCheckoutLineItem = {
  quantity: 1;
  price_data: { currency: "usd"; unit_amount: number; product_data: { name: string } };
};

export function isStripeCheckoutTransportWithinLimit(items: readonly StripeCheckoutLineItem[]): boolean {
  return items.length > 0 && items.length <= STRIPE_CHECKOUT_PAYMENT_MAX_LINE_ITEMS;
}

// Transport projection only. Pricing, stored snapshots, receipts and Connect
// allocation remain authoritative in RFL. Zero-value snapshot rows are omitted.
// Overflow consolidates ONLY recurring charges. Base, platform fee and each
// late-fee row keep their existing representation. Unknown rows remain separate
// so the final guard can reject an unsupported future/malformed composition.
// Current pricing emits no other types: an overflowing legitimate snapshot
// therefore projects to at most five rows. Setup/readiness need no item-count
// ceiling; their existing financial/configuration limits remain sufficient.
export function normalizeStripeLineItems(storedLineItems: unknown): StripeCheckoutLineItem[] | null {
  if (!Array.isArray(storedLineItems) || storedLineItems.length === 0) return null;
  const entries: { item: StripeCheckoutLineItem; recurring: boolean }[] = [];
  for (const value of storedLineItems) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as { type?: unknown; label?: unknown; amountCents?: unknown };
    const name = typeof row.label === "string" ? row.label.trim() : "";
    if (!name || typeof row.amountCents !== "number" || !Number.isSafeInteger(row.amountCents) || row.amountCents < 0) return null;
    if (row.amountCents === 0) continue;
    entries.push({ recurring: row.type === "RECURRING_CHARGE", item: {
      quantity: 1, price_data: { currency: "usd", unit_amount: row.amountCents, product_data: { name } },
    } });
  }
  if (!entries.length) return null;
  if (entries.length <= STRIPE_CHECKOUT_PAYMENT_MAX_LINE_ITEMS) return entries.map(entry => entry.item);
  const recurring = entries.filter(entry => entry.recurring);
  if (recurring.length < 2) return entries.map(entry => entry.item);
  const amount = recurring.reduce((total, entry) => total + entry.item.price_data.unit_amount, 0);
  if (!Number.isSafeInteger(amount)) return null;
  const combined: StripeCheckoutLineItem = { quantity: 1, price_data: {
    currency: "usd", unit_amount: amount, product_data: { name: `Recurring charges (${recurring.length} items)` },
  } };
  let inserted = false;
  return entries.flatMap(entry => {
    if (!entry.recurring) return [entry.item];
    if (inserted) return [];
    inserted = true; return [combined];
  });
}
