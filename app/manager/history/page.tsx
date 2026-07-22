import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSetupRoute } from "@/lib/setupProgress";
import ManagerHistoryClient, {
  type HistoryPayment,
} from "./ManagerHistoryClient";

function getPaymentTimestamp(payment: {
  paidAt: Date | null;
  pendingAt: Date | null;
  failedAt: Date | null;
  expiredAt: Date | null;
  refundedAt: Date | null;
  disputedAt: Date | null;
  returnedAt: Date | null;
  checkoutStartedAt: Date | null;
  createdAt: Date;
}): Date {
  return (
    payment.paidAt ??
    payment.pendingAt ??
    payment.failedAt ??
    payment.expiredAt ??
    payment.refundedAt ??
    payment.disputedAt ??
    payment.returnedAt ??
    payment.checkoutStartedAt ??
    payment.createdAt
  );
}

export default async function ManagerHistoryPage() {
  const { manager, business } = await requireManager();

  const setupRoute = getSetupRoute(business);

  if (setupRoute !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  const paymentRecords = await prisma.payment.findMany({
    where: {
      businessId: business.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      status: true,
      paymentMethod: true,

      payerFirstName: true,
      payerLastName: true,
      payerPhone: true,
      payerEmail: true,
      referenceLabel: true,

      itemDescription: true,
      lineItemsSnapshot: true,
      subtotalCents: true,
      platformFeeCents: true,
      processorFeeCents: true,
      totalChargedCents: true,
      businessProceedsCents: true,

      billingCycle: true,

      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,

      checkoutStartedAt: true,
      pendingAt: true,
      paidAt: true,
      failedAt: true,
      expiredAt: true,
      refundedAt: true,
      disputedAt: true,
      returnedAt: true,

      failureCode: true,
      failureMessage: true,

      createdAt: true,
      updatedAt: true,
    },
  });

  const payments: HistoryPayment[] = paymentRecords.map((payment) => ({
    id: payment.id,
    sourceType: payment.sourceType,
    sourceId: payment.sourceId,
    status: payment.status,
    paymentMethod: payment.paymentMethod,

    payerFirstName: payment.payerFirstName,
    payerLastName: payment.payerLastName,
    payerPhone: payment.payerPhone,
    payerEmail: payment.payerEmail,
    referenceLabel: payment.referenceLabel,

    itemDescription: payment.itemDescription,
    lineItemsSnapshot: payment.lineItemsSnapshot,
    subtotalCents: payment.subtotalCents,
    platformFeeCents: payment.platformFeeCents,
    processorFeeCents: payment.processorFeeCents,
    totalChargedCents: payment.totalChargedCents,
    businessProceedsCents: payment.businessProceedsCents,

    billingCycle: payment.billingCycle,

    stripeCheckoutSessionId:
      payment.stripeCheckoutSessionId,
    stripePaymentIntentId:
      payment.stripePaymentIntentId,
    stripeChargeId: payment.stripeChargeId,

    checkoutStartedAt:
      payment.checkoutStartedAt?.toISOString() ?? null,
    pendingAt: payment.pendingAt?.toISOString() ?? null,
    paidAt: payment.paidAt?.toISOString() ?? null,
    failedAt: payment.failedAt?.toISOString() ?? null,
    expiredAt: payment.expiredAt?.toISOString() ?? null,
    refundedAt: payment.refundedAt?.toISOString() ?? null,
    disputedAt: payment.disputedAt?.toISOString() ?? null,
    returnedAt: payment.returnedAt?.toISOString() ?? null,

    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,

    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    timestamp: getPaymentTimestamp(payment).toISOString(),
  }));

  return (
    <ManagerHistoryClient
      businessName={business.name}
      accountCode={business.accountCode ?? "—"}
      managerName={manager.displayName ?? manager.email}
      payments={payments}
    />
  );
}