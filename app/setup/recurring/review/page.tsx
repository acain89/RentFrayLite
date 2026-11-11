import PaginatedRecurringConfiguration from "@/components/setup/PaginatedRecurringConfiguration";
import { CONFIGURATION_PAGE_SIZE } from "@/lib/recurringConfiguration";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringReviewClient from "./RecurringReviewClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringReviewPage(props: { searchParams?: Promise<{ incremental?: string }> }) {
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
    return <PaginatedRecurringConfiguration step="review" highestReachedStep={highestReachedStep} />;
  }

  if (plans.length === 0) {
    redirect("/setup/recurring/tiers");
  }

  return (
    <RecurringReviewClient
      highestReachedStep={highestReachedStep}
      tiers={plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        baseAmountCents: plan.baseAmountCents,
        dueDay: plan.dueDay,
        gracePeriodDays: plan.gracePeriodDays,
        initialLateFeeCents: plan.initialLateFeeCents,
        dailyLateFeeCents: plan.dailyLateFeeCents,
        dailyLateFeeMaxDays: plan.dailyLateFeeMaxDays,
        charges: plan.charges.filter(charge => charge.isActive !== false).map((charge) => ({
          id: charge.id,
          label: charge.label,
          amountCents: charge.amountCents,
        })),
      }))}
    />
  );
}
