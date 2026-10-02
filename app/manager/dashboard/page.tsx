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
import { loadBusinessPaymentReadiness } from "@/lib/businessPaymentReadiness";
import ManagerDashboardClient from "./ManagerDashboardClient";

export default async function ManagerDashboardPage() {
  const { manager, business } = await requireManager();

  const setupRoute = getSetupRoute(business);

  if (setupRoute !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  const current = await loadBusinessPaymentReadiness(business.id);
  if (!current) redirect("/login/manager");
  const billingCycle = getCurrentBillingCycle();

  const paymentRecords = await prisma.payment.findMany({
    where: {
      businessId: business.id,
      billingCycle,
      status: {
  in: [
    "PAID",
    "PENDING",
    "FAILED",
    "RETURNED",
    "DISPUTED",
  ],
},
    },
orderBy: {
  updatedAt: "desc",
},

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
      disputedAt: true,
      returnedAt: true,
      checkoutStartedAt: true,
      updatedAt: true,
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
         lateFeeCents: getLateFeeCents(
          payment.lineItemsSnapshot
          ),
          paymentMethod: getPaymentMethodLabel(
            payment.paymentMethod
          ),
          timestamp: timestamp.toISOString(),
        },
      ];
    });

  return (
    <ManagerDashboardClient
      readiness={current.readiness}
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