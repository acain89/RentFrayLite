import PaginatedRecurringConfiguration from "@/components/setup/PaginatedRecurringConfiguration";
import { CONFIGURATION_PAGE_SIZE, configurationFingerprint } from "@/lib/recurringConfiguration";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringChargesClient from "./RecurringChargesClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringChargesPage(props: { searchParams?: Promise<{ incremental?: string }> }) {
  const searchParams = props?.searchParams;
  const { business } = await requireManager();

  const highestReachedStep = getHighestSetupStage(business.setupStep);

  const plans = await prisma.recurringPlan.findMany({
    where: { businessId: business.id, isActive: true }, take: CONFIGURATION_PAGE_SIZE + 1,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { charges: { orderBy: { sortOrder: "asc" } } },
  });
  if (plans.length > CONFIGURATION_PAGE_SIZE || (await searchParams)?.incremental === "1") {
    return <PaginatedRecurringConfiguration step="charges" highestReachedStep={highestReachedStep} />;
  }

  if (plans.length === 0) {
    redirect("/setup/recurring/tiers");
  }

  return (
    <RecurringChargesClient
      initialVersion={configurationFingerprint(plans)}
      highestReachedStep={highestReachedStep}
      initialTiers={plans.map((plan) => ({
        recurringPlanId: plan.id,
        name: plan.name,
        baseAmount: (plan.baseAmountCents / 100).toFixed(2),
        charges: plan.charges.filter(charge => charge.isActive !== false).map((charge) => ({
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
