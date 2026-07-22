import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import {
  formatBillingCycleLabel,
  getCurrentBillingCycle,
  getDashboardStatus,
  getLateFeeCents,
  getPaymentMethodLabel,
  getPaymentTimestamp,
  type DashboardPayment,
} from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { getSetupRoute } from "@/lib/setupProgress";
import ManagerDashboardClient from "./ManagerDashboardClient";

export default async function ManagerDashboardPage() {
  const { manager, business } = await requireManager();

  const setupRoute = getSetupRoute(business);

  if (setupRoute !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  const billingCycle = getCurrentBillingCycle();

  const paymentRecords = await prisma.payment.findMany({
    where: {
      businessId: business.id,
      billingCycle,
      status: {
        in: ["PAID", "PENDING", "FAILED"],
      },
    },
    orderBy: [
      {
        paidAt: "desc",
      },
      {
        pendingAt: "desc",
      },
      {
        failedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      payerFirstName: true,
      payerLastName: true,
      referenceLabel: true,
      itemDescription: true,
      lineItemsSnapshot: true,
      subtotalCents: true,
      paidAt: true,
      pendingAt: true,
      failedAt: true,
      checkoutStartedAt: true,
      createdAt: true,
    },
  });

  const payments: DashboardPayment[] =
    paymentRecords.flatMap((payment) => {
      const status = getDashboardStatus(payment.status);

      if (!status) {
        return [];
      }

      const timestamp = getPaymentTimestamp(payment);

      return [
        {
          id: payment.id,
          status,
          customerName: [
            payment.payerFirstName,
            payment.payerLastName,
          ]
            .filter(Boolean)
            .join(" "),
          reference:
            payment.referenceLabel?.trim() ||
            payment.itemDescription,
          amountCents: payment.subtotalCents,
          lateFeeCents:
            status === "PAID"
              ? getLateFeeCents(
                  payment.lineItemsSnapshot
                )
              : 0,
          paymentMethod: getPaymentMethodLabel(
            payment.paymentMethod
          ),
          timestamp: timestamp.toISOString(),
        },
      ];
    });

  return (
    <ManagerDashboardClient
      businessName={business.name}
      accountCode={business.accountCode ?? "—"}
      managerName={
        manager.displayName ?? manager.email
      }
      billingCycleLabel={formatBillingCycleLabel(
        billingCycle
      )}
      payments={payments}
    />
  );
}