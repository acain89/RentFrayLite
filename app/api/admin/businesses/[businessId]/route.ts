import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    businessId: string;
  }>;
};

export async function DELETE(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const auth = await requireAdminApi();

  if (auth.response) {
    return auth.response;
  }

  if (!auth.session?.adminAccess) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const adminAccess = auth.session.adminAccess;
  const { businessId } = await context.params;

  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      id: true,
      name: true,
      accountCode: true,
    },
  });

  if (!business) {
    return NextResponse.json(
      { error: "Business not found." },
      { status: 404 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.checkoutSession.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.oneTimeCharge.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.payment.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.auditLog.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.verificationToken.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.session.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.manager.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.stripeConnection.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.recurringPlan.deleteMany({
      where: {
        businessId,
      },
    });

    await tx.business.delete({
      where: {
        id: businessId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: adminAccess.id,
        action: "BUSINESS_DELETED",
        targetType: "Business",
        targetId: businessId,
        summary: `${business.name} (${business.accountCode ?? "No account code"}) permanently deleted`,
      },
    });
  });

  return NextResponse.json({
    success: true,
  });
}