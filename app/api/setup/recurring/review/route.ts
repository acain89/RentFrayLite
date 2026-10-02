import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readinessBusinessInclude } from "@/lib/businessPaymentReadiness";
import { getConfigurationReasons } from "@/lib/paymentReadiness";
import { getCurrentSession } from "@/lib/session";

export async function POST() {
  try {
    return await completeReview();
  } catch (error) {
    if (error instanceof ManagerMutationUnauthorized) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    throw error;
  }
}

async function completeReview() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.manager ||
    !session.business || session.manager.businessId !== session.business.id
  ) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const businessId = session.business.id;
  const managerId = session.manager.id;
  const setupCompletedAt = session.business.setupCompletedAt;

  const business = await prisma.business.findUnique({ where: { id: businessId }, include: readinessBusinessInclude });
  const reasons = business ? getConfigurationReasons(business) : [{ message: "Business account unavailable." }];
  if (reasons.length) return NextResponse.json({ error: reasons[0].message }, { status: 409 });

  await withManagerMutation(session, async tx => {
    await tx.business.update({
      where: {
        id: businessId,
      },
      data: {
        ...(setupCompletedAt ? {} : { setupStep: SetupStep.CONNECT_STRIPE }),
      },
    });
    await tx.auditLog.create({
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
    });
  });

  return NextResponse.json({
    saved: true,
    redirectTo: "/setup/stripe",
  });
}
