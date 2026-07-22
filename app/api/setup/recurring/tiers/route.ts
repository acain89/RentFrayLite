import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

const recurringTiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        id: z.string().min(1).max(100).nullable(),
        clientKey: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(80),
        amountCents: z.number().int().min(1).max(100_000_000),
      })
    )
    .min(1)
    .max(250),
  advance: z.boolean().optional().default(false),
});

export async function PUT(request: Request) {
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = recurringTiersSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter at least one valid rent tier." },
      { status: 400 }
    );
  }

  const normalizedNames = parsed.data.tiers.map((tier) =>
    tier.name.trim().toLowerCase()
  );

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return NextResponse.json(
      { error: "Each rent tier must have a unique name." },
      { status: 400 }
    );
  }

  const businessId = session.business.id;
  const managerId = session.manager.id;

  const submittedExistingIds = parsed.data.tiers
    .map((tier) => tier.id)
    .filter((id): id is string => Boolean(id));

  const ownedExistingPlans = await prisma.recurringPlan.findMany({
    where: {
      businessId,
      id: {
        in: submittedExistingIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (ownedExistingPlans.length !== submittedExistingIds.length) {
    return NextResponse.json(
      { error: "One or more rent tiers are invalid." },
      { status: 400 }
    );
  }

  try {
    const savedTiers = await prisma.$transaction(
      async (transaction) => {
await transaction.recurringPlan.updateMany({
  where: {
    businessId,
    isActive: true,
    id: {
      notIn: submittedExistingIds,
    },
  },
  data: {
    isActive: false,
  },
});

        const saved = [];

        for (const [index, tier] of parsed.data.tiers.entries()) {
          if (tier.id) {
            const updated = await transaction.recurringPlan.update({
              where: {
                id: tier.id,
              },
              data: {
                name: tier.name.trim(),
                baseAmountCents: tier.amountCents,
                sortOrder: index,
                isActive: true,
              },
              select: {
                id: true,
                name: true,
                baseAmountCents: true,
                sortOrder: true,
              },
            });

            saved.push({
              ...updated,
              clientKey: tier.clientKey,
            });

            continue;
          }

          const created = await transaction.recurringPlan.create({
            data: {
              businessId,
              name: tier.name.trim(),
              baseAmountCents: tier.amountCents,
              dueDay: 1,
              gracePeriodDays: 0,
              sortOrder: index,
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              baseAmountCents: true,
              sortOrder: true,
            },
          });

          saved.push({
            ...created,
            clientKey: tier.clientKey,
          });
        }

        if (parsed.data.advance) {
          await transaction.business.update({
            where: {
              id: businessId,
            },
            data: {
              setupStep: SetupStep.CONFIGURE_RECURRING_CHARGES,
            },
          });

          await transaction.auditLog.create({
            data: {
              businessId,
              actorType: "MANAGER",
              actorId: managerId,
              action: "RECURRING_TIERS_COMPLETED",
              targetType: "BUSINESS",
              targetId: businessId,
              summary: `${parsed.data.tiers.length} recurring tier(s) configured.`,
            },
          });
        }

        return saved;
      }
    );

    return NextResponse.json({
      saved: true,
      tiers: savedTiers,
      redirectTo: parsed.data.advance
        ? "/setup/recurring/charges"
        : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to save the rent tiers." },
      { status: 500 }
    );
  }
}