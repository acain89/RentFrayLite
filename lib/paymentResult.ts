import { prisma } from "@/lib/prisma";
import { logOperationalError } from "@/lib/operationalLogging";
import { projectSmsDelivery, SMS_REPORT_SELECT, TENANT_RECEIPT_NOTIFICATION } from "@/lib/smsDeliveryReporting";
import { CUSTOMER_REFUND_REPORT_SELECT, loadReportingDisputeOutcome, projectPaymentOutcome } from "@/lib/paymentReportingOutcome";
import {
  getPaymentResultAccessToken,
  verifyPaymentResultAccessToken,
} from "@/lib/paymentResultAccess";

// Only storage operations enter this boundary. Replace the exception without a
// cause so framework render logging cannot serialize private query details.
async function resultStorage<T>(reference: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logOperationalError("payment_result_failed", error, reference);
    throw new Error("Payment result unavailable. Please try again.");
  }
}

// Read-only: the signed webhook remains the authority for payment status and
// receipt creation. Visiting a return URL never reconciles or advances status.
export async function getPaymentResult(accountCodeInput: unknown, stripeSessionIdInput: unknown) {
  if (typeof accountCodeInput !== "string" || typeof stripeSessionIdInput !== "string") return null;
  const accountCode = accountCodeInput.trim().toUpperCase();
  const stripeSessionId = stripeSessionIdInput.trim();
  if (!accountCode || accountCode.length > 100 || !/^cs_[A-Za-z0-9_]{1,250}$/.test(stripeSessionId)) return null;

  const token = await getPaymentResultAccessToken(stripeSessionId);
  if (!token) return null;

  const checkout = await resultStorage(stripeSessionId, () => prisma.checkoutSession.findUnique({
    where: { stripeCheckoutSessionId: stripeSessionId },
    select: { id: true, businessId: true, accountCode: true, paymentId: true },
  }));
  if (
    !checkout?.paymentId ||
    checkout.accountCode.toUpperCase() !== accountCode ||
    !verifyPaymentResultAccessToken(token, stripeSessionId, checkout.id)
  ) return null;

  const paymentId = checkout.paymentId;
  const payment = await resultStorage(paymentId, () => prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true, businessId: true, stripeCheckoutSessionId: true,
      status: true, paymentMethod: true, itemDescription: true, referenceLabel: true,
      subtotalCents: true, platformFeeCents: true, totalChargedCents: true,
      lineItemsSnapshot: true, createdAt: true, checkoutStartedAt: true,
      pendingAt: true, paidAt: true, failedAt: true, expiredAt: true,
      returnedAt: true, disputedAt: true,
      customerRefunds: { select: CUSTOMER_REFUND_REPORT_SELECT },
      business: { select: { id: true, name: true, accountCode: true, propertyTimeZone: true } },
      smsReceipt: { select: { status: true } },
      smsNotifications: { where: TENANT_RECEIPT_NOTIFICATION, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: SMS_REPORT_SELECT },
    },
  }));
  if (
    !payment ||
    payment.id !== checkout.paymentId ||
    payment.stripeCheckoutSessionId !== stripeSessionId ||
    payment.businessId !== checkout.businessId ||
    payment.business.id !== checkout.businessId ||
    payment.business.accountCode?.toUpperCase() !== accountCode
  ) return null;

  const outcome = projectPaymentOutcome({ ...payment, disputeOutcome: await resultStorage(payment.id, () => loadReportingDisputeOutcome(prisma, payment)) });
  const smsDelivery = projectSmsDelivery(payment.smsNotifications?.[0], payment.smsReceipt);
  return { payment, outcome, smsDelivery, accountCode, stripeSessionId };
}
