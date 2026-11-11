import PaginatedRecurringConfiguration from "@/components/setup/PaginatedRecurringConfiguration";
import { CONFIGURATION_PAGE_SIZE, configurationFingerprint } from "@/lib/recurringConfiguration";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringBillingClient from "./RecurringBillingClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringBillingPage(props: { searchParams?: Promise<{ incremental?: string }> }) {
  const searchParams = props?.searchParams;
  const { business } = await requireManager();

  const highestReachedStep = getHighestSetupStage(
    business.setupStep
  );

  const plans = await prisma.recurringPlan.findMany({
    where: { businessId: business.id, isActive: true }, take: CONFIGURATION_PAGE_SIZE + 1,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { charges: { orderBy: { sortOrder: "asc" } } },
  });
  if (plans.length > CONFIGURATION_PAGE_SIZE || (await searchParams)?.incremental === "1") {
    return <PaginatedRecurringConfiguration step="billing" highestReachedStep={highestReachedStep} />;
  }

  if (plans.length === 0) {
    redirect("/setup/recurring/tiers");
  }

  return (
    <RecurringBillingClient
      initialVersion={configurationFingerprint(plans)}
      highestReachedStep={highestReachedStep}
      initialRules={plans.map((plan) => ({
        recurringPlanId: plan.id,
        tierName: plan.name,
        dueDay: String(plan.dueDay),
        gracePeriodDays: String(plan.gracePeriodDays),
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
