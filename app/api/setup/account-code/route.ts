import {
  BusinessStatus,
  Prisma,
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { generateAvailableAccountCode } from "@/lib/accountCode";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { accountCodeSchema } from "@/lib/validators";

export async function GET() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.business
  ) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  if (
    session.business.accountCode &&
    session.business.accountCodeLockedAt
  ) {
    return NextResponse.json({
      accountCode: session.business.accountCode,
      locked: true,
    });
  }

  if (session.business.accountCode) {
    return NextResponse.json({
      accountCode: session.business.accountCode,
      locked: false,
    });
  }

  return NextResponse.json({
    accountCode: await generateAvailableAccountCode(),
    locked: false,
  });
}

export async function POST(request: Request) {
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

  if (session.business.accountCodeLockedAt) {
    return NextResponse.json(
      {
        error:
          "The account code has already been permanently locked.",
      },
      { status: 409 }
    );
  }

  const stripeConnection =
    await prisma.stripeConnection.findUnique({
      where: {
        businessId: session.business.id,
      },
      select: {
        readyForLive: true,
      },
    });

  if (!stripeConnection?.readyForLive) {
    return NextResponse.json(
      {
        error:
          "Complete the bank setup before choosing an account code.",
      },
      { status: 409 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = accountCodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter a valid account code.",
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const businessId = session.business.id;
  const managerId = session.manager.id;

  try {
    await prisma.$transaction([
      prisma.business.update({
        where: {
          id: businessId,
        },
        data: {
          accountCode: parsed.data.accountCode,
          accountCodeLockedAt: now,
          setupStep: SetupStep.COMPLETE,
          setupCompletedAt: now,
          status: BusinessStatus.ACTIVE,
        },
      }),
      prisma.auditLog.create({
        data: {
          businessId,
          actorType: "MANAGER",
          actorId: managerId,
          action: "ACCOUNT_CODE_LOCKED",
          targetType: "BUSINESS",
          targetId: businessId,
          summary: `Account code permanently locked as ${parsed.data.accountCode}. Setup completed.`,
        },
      }),
    ]);
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "That account code is already in use.",
        },
        { status: 409 }
      );
    }

    console.error(
      "Unable to complete account setup:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to complete the account setup.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    locked: true,
    redirectTo: "/manager/dashboard",
  });
}