import { prisma } from "@/lib/prisma";
import {
  getPaymentResultAccessToken,
  verifyPaymentResultAccessToken,
} from "@/lib/paymentResultAccess";

// Read-only: the signed webhook remains the authority for payment status and
// receipt creation. Visiting a return URL never reconciles or advances status.
export async function getPaymentResult(accountCodeInput: unknown, stripeSessionIdInput: unknown) {
  if (typeof accountCodeInput !== "string" || typeof stripeSessionIdInput !== "string") return null;
  const accountCode = accountCodeInput.trim().toUpperCase();
  const stripeSessionId = stripeSessionIdInput.trim();
  if (!accountCode || accountCode.length > 100 || !/^cs_[A-Za-z0-9_]{1,250}$/.test(stripeSessionId)) return null;

  const token = await getPaymentResultAccessToken(stripeSessionId);
  if (!token) return null;

  const checkout = await prisma.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId: stripeSessionId },
    select: { id: true, businessId: true, accountCode: true, paymentId: true },
  });
  if (
    !checkout?.paymentId ||
    checkout.accountCode.toUpperCase() !== accountCode ||
    !verifyPaymentResultAccessToken(token, stripeSessionId, checkout.id)
  ) return null;

  const payment = await prisma.payment.findUnique({
    where: { id: checkout.paymentId },
    select: {
      id: true, businessId: true, stripeCheckoutSessionId: true,
      status: true, paymentMethod: true, itemDescription: true, referenceLabel: true,
      subtotalCents: true, platformFeeCents: true, totalChargedCents: true,
      lineItemsSnapshot: true, createdAt: true, checkoutStartedAt: true,
      pendingAt: true, paidAt: true, failedAt: true, expiredAt: true,
      returnedAt: true, disputedAt: true,
      business: { select: { id: true, name: true, accountCode: true } },
      smsReceipt: { select: { status: true } },
    },
  });
  if (
    !payment ||
    payment.id !== checkout.paymentId ||
    payment.stripeCheckoutSessionId !== stripeSessionId ||
    payment.businessId !== checkout.businessId ||
    payment.business.id !== checkout.businessId ||
    payment.business.accountCode?.toUpperCase() !== accountCode
  ) return null;

  return { payment, accountCode, stripeSessionId };
}
