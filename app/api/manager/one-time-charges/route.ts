import {
  OneTimeChargeStatus,
  SessionType,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

const createChargeSchema = z.object({
  unitNumber: z
    .string()
    .trim()
    .min(1, "Enter a unit number.")
    .max(100, "Unit number is too long."),

  chargeName: z
    .string()
    .trim()
    .min(1, "Enter a charge name.")
    .max(120, "Charge name is too long."),

  amountCents: z
    .number()
    .int()
    .min(1, "Amount must be at least $0.01.")
    .max(
      10_000_000,
      "Amount cannot be more than $100,000.",
    ),
});

const deleteChargeSchema = z.object({
  chargeId: z.string().trim().min(1),
});

function normalizeUnitNumber(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

async function requireManagerSession() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.manager ||
    !session.business
  ) {
    return null;
  }

  return {
    session,
    manager: session.manager,
    business: session.business,
  };
}

export async function GET() {
  const auth = await requireManagerSession();

  if (!auth) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const { business } = auth;

  const charges = await prisma.oneTimeCharge.findMany({
    where: {
      businessId: business.id,
      status: OneTimeChargeStatus.PENDING,
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    select: {
      id: true,
      unitNumber: true,
      label: true,
      amountCents: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    charges: charges.map((charge) => ({
      ...charge,
      createdAt: charge.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireManagerSession();

  if (!auth) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const { business, manager } = auth;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed = createChargeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter a valid one-time charge.",
      },
      {
        status: 400,
      },
    );
  }

  const unitNumber = parsed.data.unitNumber
    .trim()
    .replace(/\s+/g, " ");

  const charge = await prisma.$transaction(
    async (transaction) => {
      const created =
        await transaction.oneTimeCharge.create({
          data: {
            businessId: business.id,
            unitNumber,
            normalizedUnitNumber:
              normalizeUnitNumber(unitNumber),
            label: parsed.data.chargeName,
            amountCents: parsed.data.amountCents,
          },
          select: {
            id: true,
            unitNumber: true,
            label: true,
            amountCents: true,
            createdAt: true,
          },
        });

      await transaction.auditLog.create({
        data: {
          businessId: business.id,
          actorType: "MANAGER",
          actorId: manager.id,
          action: "ONE_TIME_CHARGE_CREATED",
          targetType: "ONE_TIME_CHARGE",
          targetId: created.id,
          summary: `${created.label} added to unit ${created.unitNumber}.`,
          metadata: {
            unitNumber: created.unitNumber,
            amountCents: created.amountCents,
          },
        },
      });

      return created;
    },
  );

  return NextResponse.json(
    {
      charge: {
        ...charge,
        createdAt: charge.createdAt.toISOString(),
      },
    },
    {
      status: 201,
    },
  );
}

export async function DELETE(request: Request) {
  const auth = await requireManagerSession();

  if (!auth) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const { business, manager } = auth;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed = deleteChargeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Select a valid charge.",
      },
      {
        status: 400,
      },
    );
  }

const existing = await prisma.oneTimeCharge.findFirst({
  where: {
    id: parsed.data.chargeId,
    businessId: business.id,
  },
  select: {
    id: true,
    unitNumber: true,
    label: true,
    amountCents: true,
    status: true,
  },
});

  if (!existing) {
    return NextResponse.json(
      {
        error: "Charge not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (existing.status !== OneTimeChargeStatus.PENDING) {
    return NextResponse.json(
      {
        error:
          "Only unpaid one-time charges can be deleted.",
      },
      {
        status: 409,
      },
    );
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.oneTimeCharge.update({
      where: {
        id: existing.id,
      },
      data: {
        status: OneTimeChargeStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    await transaction.auditLog.create({
      data: {
        businessId: business.id,
        actorType: "MANAGER",
        actorId: manager.id,
        action: "ONE_TIME_CHARGE_CANCELLED",
        targetType: "ONE_TIME_CHARGE",
        targetId: existing.id,
        summary: `${existing.label} removed from unit ${existing.unitNumber}.`,
        metadata: {
          unitNumber: existing.unitNumber,
          amountCents: existing.amountCents,
        },
      },
    });
  });

  return NextResponse.json({
    deleted: true,
  });
}