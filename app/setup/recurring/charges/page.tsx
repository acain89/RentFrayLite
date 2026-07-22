import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringChargesClient from "./RecurringChargesClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringChargesPage() {
  const { business } = await requireManager();

  const highestReachedStep = getHighestSetupStage(business.setupStep);

  const plans = await prisma.recurringPlan.findMany({
    where: {
      businessId: business.id,
      isActive: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
    select: {
      id: true,
      name: true,
      baseAmountCents: true,
      charges: {
        where: {
          isActive: true,
        },
        orderBy: {
          sortOrder: "asc",
        },
        select: {
          id: true,
          label: true,
          amountCents: true,
          sharedChargeGroupId: true,
        },
      },
    },
  });

  if (plans.length === 0) {
    redirect("/setup/recurring/tiers");
  }

  return (
    <RecurringChargesClient
      highestReachedStep={highestReachedStep}
      initialTiers={plans.map((plan) => ({
        recurringPlanId: plan.id,
        name: plan.name,
        baseAmount: (plan.baseAmountCents / 100).toFixed(2),
        charges: plan.charges.map((charge) => ({
          id: charge.id,
          sharedChargeGroupId: charge.sharedChargeGroupId,
          label: charge.label,
          amount: (charge.amountCents / 100).toFixed(2),
          applyToAllTiers: Boolean(charge.sharedChargeGroupId),
        })),
      }))}
    />
  );
}