import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RecurringReviewClient from "./RecurringReviewClient";
import { getHighestSetupStage } from "@/lib/setupProgress";

export default async function RecurringReviewPage() {
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
      dueDay: true,
      gracePeriodDays: true,
      initialLateFeeCents: true,
      dailyLateFeeCents: true,
      dailyLateFeeMaxDays: true,
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
        },
      },
    },
  });

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
        charges: plan.charges.map((charge) => ({
          id: charge.id,
          label: charge.label,
          amountCents: charge.amountCents,
        })),
      }))}
    />
  );
}