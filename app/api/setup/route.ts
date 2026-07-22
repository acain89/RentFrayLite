import { SetupStep } from "@prisma/client";
import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createManagerSession } from "@/lib/session";
import { setupAccountSchema } from "@/lib/validators";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      { status: 400 }
    );
  }

  const parsed = setupAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter valid account information.",
      },
      { status: 400 }
    );
  }

  const existingManager = await prisma.manager.findUnique({
    where: {
      email: parsed.data.managerEmail,
    },
    select: {
      id: true,
    },
  });

  if (existingManager) {
    return NextResponse.json(
      {
        error: "A manager account already exists for that email.",
      },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(
    parsed.data.password
  );

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: parsed.data.businessName,
        ownerName: parsed.data.ownerName,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,

        setupStep:
          SetupStep.CONFIGURE_RECURRING_TIERS,
      },
    });

    const manager = await tx.manager.create({
      data: {
        businessId: business.id,
        email: parsed.data.managerEmail,
        passwordHash,
        displayName: parsed.data.ownerName,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorType: "MANAGER",
        actorId: manager.id,
        action: "BUSINESS_CREATED",
        targetType: "BUSINESS",
        targetId: business.id,
        summary:
          "RentFrayLite business account created.",
      },
    });

    return {
      business,
      manager,
    };
  });

  await createManagerSession({
    managerId: result.manager.id,
    businessId: result.business.id,
  });

  return NextResponse.json(
    {
      created: true,
      redirectTo: "/setup/recurring/tiers",
    },
    { status: 201 }
  );
}