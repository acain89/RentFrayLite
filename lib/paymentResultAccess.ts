import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

function cookieName(stripeSessionId: string): string {
  return `rfl_result_${createHash("sha256").update(stripeSessionId).digest("hex").slice(0, 24)}`;
}

function signAccess(stripeSessionId: string, checkoutSessionId: string): string {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Payment result access is unavailable.");
  return createHmac("sha256", secret)
    .update(`rfl-payment-result-v1\0${stripeSessionId}\0${checkoutSessionId}`)
    .digest("hex");
}

// A separate cookie per checkout supports multiple payments/tabs. The URL alone
// cannot authorize receipt access, and no database ID or secret is in the cookie.
export async function grantPaymentResultAccess(
  stripeSessionId: string,
  checkoutSessionId: string
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(cookieName(stripeSessionId), signAccess(stripeSessionId, checkoutSessionId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // The original signed binding also authorizes cancellation resumption at
    // /api/public/checkout/start; it stays HttpOnly and scoped to this checkout.
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function getPaymentResultAccessToken(stripeSessionId: string): Promise<string | undefined> {
  return (await cookies()).get(cookieName(stripeSessionId))?.value;
}

export function verifyPaymentResultAccessToken(
  token: string,
  stripeSessionId: string,
  checkoutSessionId: string
): boolean {
  if (!/^[a-f0-9]{64}$/.test(token) || !process.env.STRIPE_SECRET_KEY) return false;
  return timingSafeEqual(
    Buffer.from(token, "hex"),
    Buffer.from(signAccess(stripeSessionId, checkoutSessionId), "hex")
  );
}
