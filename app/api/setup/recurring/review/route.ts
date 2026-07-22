import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

export async function POST() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.manager ||
    !session.business
  ) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const businessId = session.business.id;
  const managerId = session.manager.id;

  const plans = await prisma.recurringPlan.findMany({
    where: {
      businessId,
      isActive: true,
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
    },
  });

  if (plans.length === 0) {
    return NextResponse.json(
      { error: "Add at least one rent tier before continuing." },
      { status: 409 }
    );
  }

  const invalidPlan = plans.some(
    (plan) =>
      plan.baseAmountCents <= 0 ||
      plan.dueDay < 1 ||
      plan.dueDay > 31 ||
      plan.gracePeriodDays < 1 ||
      plan.dailyLateFeeCents < 0 ||
      plan.initialLateFeeCents < 0 ||
      (plan.dailyLateFeeCents > 0 &&
        plan.dailyLateFeeMaxDays < 1) ||
      (plan.dailyLateFeeCents === 0 &&
        plan.dailyLateFeeMaxDays !== 0)
  );

  if (invalidPlan) {
    return NextResponse.json(
      {
        error:
          "One or more tiers have incomplete pricing or billing rules.",
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.business.update({
      where: {
        id: businessId,
      },
      data: {
        setupStep: SetupStep.CONNECT_STRIPE,
      },
    }),
    prisma.auditLog.create({
      data: {
        businessId,
        actorType: "MANAGER",
        actorId: managerId,
        action: "RECURRING_SETUP_REVIEWED",
        targetType: "BUSINESS",
        targetId: businessId,
        summary:
          "Recurring tiers, charges, and billing rules reviewed.",
      },
    }),
  ]);

  return NextResponse.json({
    saved: true,
    redirectTo: "/setup/stripe",
  });
}