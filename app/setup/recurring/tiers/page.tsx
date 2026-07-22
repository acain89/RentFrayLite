import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringTiersClient from "./RecurringTiersClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringTiersPage() {
  const { business } = await requireManager();

  const highestReachedStep = getHighestSetupStage(
  business.setupStep
);

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
    },
  });

  return (
    <RecurringTiersClient
      highestReachedStep={highestReachedStep}
      initialTiers={plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        amount: (plan.baseAmountCents / 100).toFixed(2),
      }))}
    />
  );
}