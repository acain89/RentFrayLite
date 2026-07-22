import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringBillingClient from "./RecurringBillingClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringBillingPage() {
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
      dueDay: true,
      gracePeriodDays: true,
      initialLateFeeCents: true,
      dailyLateFeeCents: true,
      dailyLateFeeMaxDays: true,
    },
  });

  if (plans.length === 0) {
    redirect("/setup/recurring/tiers");
  }

  return (
    <RecurringBillingClient
      highestReachedStep={highestReachedStep}
      initialRules={plans.map((plan) => ({
        recurringPlanId: plan.id,
        tierName: plan.name,
        dueDay: String(plan.dueDay),
        gracePeriodDays: String(
          Math.max(plan.gracePeriodDays, 1)
        ),
        initialLateFee: (
          plan.initialLateFeeCents / 100
        ).toFixed(2),
        dailyLateFee: (
          plan.dailyLateFeeCents / 100
        ).toFixed(2),
        dailyLateFeeMaxDays: String(
          plan.dailyLateFeeMaxDays
        ),
      }))}
    />
  );
}