import PaginatedRecurringConfiguration from "@/components/setup/PaginatedRecurringConfiguration";
import { CONFIGURATION_PAGE_SIZE, configurationFingerprint } from "@/lib/recurringConfiguration";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringTiersClient from "./RecurringTiersClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringTiersPage(props: { searchParams?: Promise<{ incremental?: string }> }) {
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
    return <PaginatedRecurringConfiguration step="tiers" highestReachedStep={highestReachedStep} />;
  }

  return (
    <RecurringTiersClient
      initialVersion={configurationFingerprint(plans)}
      highestReachedStep={highestReachedStep}
      initialTiers={plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        amount: (plan.baseAmountCents / 100).toFixed(2),
      }))}
    />
  );
}
