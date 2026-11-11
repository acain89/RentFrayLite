import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";

export class CheckoutConsentInvalid extends Error {}

function cookieName(id: string) {
  return `rfl_checkout_${createHash("sha256").update(id).digest("hex").slice(0, 24)}`;
}

function signature(id: string, expires: string) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new CheckoutConsentInvalid("Checkout authorization unavailable.");
  return createHmac("sha256", secret).update(`rfl-checkout-consent-v2\0${id}\0${expires}`).digest("hex");
}

// Separate from payment-result access: this binding owns an unreserved quote
// for review/reservation and consent retention, and expires with the review flow.
export async function grantCheckoutConsentAccess(id: string) {
  const expires = String(Date.now() + 30 * 60 * 1000);
  (await cookies()).set(cookieName(id), `${expires}.${signature(id, expires)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 30 * 60,
  });
}

// Ownership does not imply SMS consent. Old unreserved cookies without a signed
// expiry must restart; reserved payments retain their separate result binding.
export async function hasCheckoutQuoteAccess(id: string): Promise<boolean> {
  const token = (await cookies()).get(cookieName(id))?.value ?? "";
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!match || Number(match[1]) <= Date.now()) return false;
  try {
    return timingSafeEqual(Buffer.from(match[2], "hex"), Buffer.from(signature(id, match[1]), "hex"));
  } catch (error) {
    if (error instanceof CheckoutConsentInvalid) return false;
    throw error;
  }
}

type CheckoutIdentity = {
  businessId: string; accountCode: string; sourceType: "CUSTOM_PAYMENT" | "RECURRING_PLAN";
  planId: string | null; billingCycle: string | null;
  unitNumber: string; firstName: string; lastName: string; phone: string;
  subtotalCents: number;
};

export async function retainedCheckoutConsent(tx: Prisma.TransactionClient, id: string, expected: CheckoutIdentity) {
  if (!await hasCheckoutQuoteAccess(id)) {
    throw new CheckoutConsentInvalid("Invalid checkout authorization. Please begin again.");
  }
  // Callers hold the business lock, shared with checkout reservation. Never
  // transfer from a payment attempt or accept client-supplied consent evidence.
  const source = await tx.checkoutSession.findUnique({ where: { id } });
  if (!source || source.expiresAt <= new Date() || source.paymentId || source.stripeCheckoutSessionId ||
      !["CREATED", "REVIEWED"].includes(source.status) ||
      Object.entries(expected).some(([key, value]) => source[key as keyof typeof source] !== value)) {
    throw new CheckoutConsentInvalid("Checkout no longer matches this payment. Please begin again.");
  }
  return { smsConsentAt: source.smsConsentAt, smsConsentVersion: source.smsConsentVersion };
}
