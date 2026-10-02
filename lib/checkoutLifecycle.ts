import { CheckoutSessionStatus, PaymentStatus, Prisma } from "@prisma/client";
import type { Payment, PrismaClient } from "@prisma/client";
import { canTransitionPaymentStatus } from "@/lib/paymentStatus";

type CheckoutWrite = { kind: "started" | "failed" | "advanced" | "unchanged"; payment: Payment };
const TRANSACTION_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 };

// Stripe awaits happen outside this transaction. All lifecycle decisions happen
// AFTER acquiring the same Payment row lock used by webhook reconciliation.
export async function writeCheckoutLifecycle(
  prisma: PrismaClient, paymentId: string, checkoutId: string,
  action: { kind: "started"; stripeCheckoutId: string } | { kind: "failed"; message: string }
): Promise<CheckoutWrite> {
  return prisma.$transaction(async (tx): Promise<CheckoutWrite> => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`);
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    const checkout = await tx.checkoutSession.findUnique({ where: { id: checkoutId } });
    if (!payment || !checkout || checkout.paymentId !== payment.id || checkout.businessId !== payment.businessId ||
      checkout.planId !== payment.sourceId || checkout.billingCycle !== payment.billingCycle ||
      checkout.unitNumber !== payment.referenceLabel) throw new Error("Checkout ownership changed before persistence");

    // Never modify timestamps, failure details, or Stripe IDs of advanced states.
    if (payment.paidAt || (payment.status !== PaymentStatus.CREATED && payment.status !== PaymentStatus.CHECKOUT_STARTED)) {
      return { kind: "advanced", payment };
    }
    if (action.kind === "started" &&
      ((payment.stripeCheckoutSessionId && payment.stripeCheckoutSessionId !== action.stripeCheckoutId) ||
       (checkout.stripeCheckoutSessionId && checkout.stripeCheckoutSessionId !== action.stripeCheckoutId))) {
      throw new Error("Stripe Checkout ownership cannot be replaced");
    }
    if (action.kind === "started" && payment.status === PaymentStatus.CHECKOUT_STARTED &&
      checkout.status === CheckoutSessionStatus.CHECKOUT_STARTED &&
      payment.stripeCheckoutSessionId === action.stripeCheckoutId && checkout.stripeCheckoutSessionId === action.stripeCheckoutId) {
      return { kind: "started", payment }; // Idempotent persistence: no timestamp rewrite.
    }
    // Only an unstarted reservation may be advanced by this route. A failed
    // create/read is not evidence that a started or processing payment failed.
    if (payment.status !== PaymentStatus.CREATED || checkout.status !== CheckoutSessionStatus.REVIEWED ||
      (action.kind === "failed" && (payment.stripeCheckoutSessionId || checkout.stripeCheckoutSessionId))) {
      return { kind: "unchanged", payment };
    }
    const status = action.kind === "started" ? PaymentStatus.CHECKOUT_STARTED : PaymentStatus.FAILED;
    if (!canTransitionPaymentStatus(payment.status, status)) return { kind: "unchanged", payment };
    const now = new Date();
    const data: Prisma.PaymentUpdateManyMutationInput = action.kind === "started"
      ? { status, stripeCheckoutSessionId: action.stripeCheckoutId, checkoutStartedAt: payment.checkoutStartedAt ?? now }
      : { status, failedAt: payment.failedAt ?? now, failureMessage: action.message };
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.CREATED, paidAt: null, stripeCheckoutSessionId: payment.stripeCheckoutSessionId }, data,
    });
    if (updated.count !== 1) throw new Error("Payment changed during checkout persistence");
    if (action.kind === "started") {
      const ownedCheckout = await tx.checkoutSession.updateMany({
        where: { id: checkout.id, paymentId: payment.id, businessId: payment.businessId,
          status: CheckoutSessionStatus.REVIEWED, stripeCheckoutSessionId: checkout.stripeCheckoutSessionId },
        data: { status: CheckoutSessionStatus.CHECKOUT_STARTED, stripeCheckoutSessionId: action.stripeCheckoutId },
      });
      if (ownedCheckout.count !== 1) throw new Error("Checkout changed during persistence");
    }
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!current) throw new Error("Payment disappeared during persistence");
    return { kind: action.kind, payment: current };
  }, TRANSACTION_OPTIONS);
}

// Local review expiry must not expire a Stripe-backed attempt. A conditional DB
// write also protects against a reservation linking a Payment after our read.
export async function expireUnstartedCheckout(prisma: PrismaClient, checkoutId: string) {
  await prisma.checkoutSession.updateMany({
    where: { id: checkoutId, paymentId: null, stripeCheckoutSessionId: null,
      status: { in: [CheckoutSessionStatus.CREATED, CheckoutSessionStatus.REVIEWED] }, expiresAt: { lte: new Date() } },
    data: { status: CheckoutSessionStatus.EXPIRED },
  });
}
