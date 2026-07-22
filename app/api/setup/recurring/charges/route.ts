import { randomUUID } from "node:crypto";
import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

const chargeSchema = z.object({
  id: z.string().min(1).max(100).nullable(),
  clientKey: z.string().min(1).max(100),
  sharedChargeGroupId: z.string().max(100).nullable(),
  label: z.string().trim().min(1).max(80),
  amountCents: z.number().int().min(1).max(100_000_000),
  applyToAllTiers: z.boolean(),
});

const tierSchema = z.object({
  recurringPlanId: z.string().min(1).max(100),
  charges: z.array(chargeSchema).max(250),
});

const requestSchema = z.object({
  tiers: z.array(tierSchema).min(1).max(250),
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

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter valid recurring charge information." },
      { status: 400 }
    );
  }

  const businessId = session.business.id;
  const managerId = session.manager.id;

  const plans = await prisma.recurringPlan.findMany({
    where: {
      businessId,
      isActive: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
    select: {
      id: true,
    },
  });

  const planIds = plans.map((plan) => plan.id);
  const submittedPlanIds = parsed.data.tiers.map(
    (tier) => tier.recurringPlanId
  );

  if (
    submittedPlanIds.length !== planIds.length ||
    submittedPlanIds.some((id) => !planIds.includes(id))
  ) {
    return NextResponse.json(
      { error: "One or more rent tiers are invalid." },
      { status: 400 }
    );
  }

  const submittedExistingIds = parsed.data.tiers.flatMap(
    (tier) =>
      tier.charges
        .map((charge) => charge.id)
        .filter((id): id is string => Boolean(id))
  );

  const ownedCharges =
    submittedExistingIds.length === 0
      ? []
      : await prisma.recurringCharge.findMany({
          where: {
            id: {
              in: submittedExistingIds,
            },
            recurringPlan: {
              businessId,
            },
          },
          select: {
            id: true,
          },
        });

  if (ownedCharges.length !== submittedExistingIds.length) {
    return NextResponse.json(
      { error: "One or more recurring charges are invalid." },
      { status: 400 }
    );
  }

  try {
    const savedTiers = await prisma.$transaction(
      async (transaction) => {
        await transaction.recurringCharge.deleteMany({
          where: {
            recurringPlan: {
              businessId,
            },
          },
        });

        const submittedCharges = parsed.data.tiers.flatMap(
          (tier) =>
            tier.charges.map((charge) => ({
              ...charge,
              recurringPlanId: tier.recurringPlanId,
            }))
        );

        const sharedGroups = new Map<
          string,
          {
            sharedChargeGroupId: string;
            clientKey: string;
            label: string;
            amountCents: number;
          }
        >();

        for (const charge of submittedCharges) {
          if (!charge.applyToAllTiers) {
            continue;
          }

          const groupKey =
            charge.sharedChargeGroupId ??
            charge.clientKey;

          if (!sharedGroups.has(groupKey)) {
            sharedGroups.set(groupKey, {
              sharedChargeGroupId:
                charge.sharedChargeGroupId ??
                randomUUID(),
              clientKey: charge.clientKey,
              label: charge.label.trim(),
              amountCents: charge.amountCents,
            });
          }
        }

        const recordsByPlan = new Map<
          string,
          Array<{
            id: string;
            clientKey: string;
            sharedChargeGroupId: string | null;
            label: string;
            amountCents: number;
            applyToAllTiers: boolean;
            sortOrder: number;
          }>
        >();

        for (const planId of planIds) {
          recordsByPlan.set(planId, []);
        }

        for (const charge of submittedCharges) {
          if (charge.applyToAllTiers) {
            continue;
          }

          const created =
            await transaction.recurringCharge.create({
              data: {
                recurringPlanId: charge.recurringPlanId,
                sharedChargeGroupId: null,
                label: charge.label.trim(),
                amountCents: charge.amountCents,
                sortOrder:
                  recordsByPlan.get(charge.recurringPlanId)
                    ?.length ?? 0,
                isActive: true,
              },
            });

          recordsByPlan.get(charge.recurringPlanId)?.push({
            id: created.id,
            clientKey: charge.clientKey,
            sharedChargeGroupId: null,
            label: created.label,
            amountCents: created.amountCents,
            applyToAllTiers: false,
            sortOrder: created.sortOrder,
          });
        }

        for (const shared of sharedGroups.values()) {
          for (const planId of planIds) {
            const created =
              await transaction.recurringCharge.create({
                data: {
                  recurringPlanId: planId,
                  sharedChargeGroupId:
                    shared.sharedChargeGroupId,
                  label: shared.label,
                  amountCents: shared.amountCents,
                  sortOrder:
                    recordsByPlan.get(planId)?.length ?? 0,
                  isActive: true,
                },
              });

            recordsByPlan.get(planId)?.push({
              id: created.id,
              clientKey: `${shared.clientKey}:${planId}`,
              sharedChargeGroupId:
                shared.sharedChargeGroupId,
              label: created.label,
              amountCents: created.amountCents,
              applyToAllTiers: true,
              sortOrder: created.sortOrder,
            });
          }
        }

        if (parsed.data.advance) {
          await transaction.business.update({
            where: {
              id: businessId,
            },
            data: {
              setupStep:
                SetupStep.CONFIGURE_RECURRING_BILLING,
            },
          });

          await transaction.auditLog.create({
            data: {
              businessId,
              actorType: "MANAGER",
              actorId: managerId,
              action: "RECURRING_CHARGES_COMPLETED",
              targetType: "BUSINESS",
              targetId: businessId,
              summary: "Recurring charges configured.",
            },
          });
        }

        return planIds.map((recurringPlanId) => ({
          recurringPlanId,
          charges:
            recordsByPlan.get(recurringPlanId) ?? [],
        }));
      }
    );

    return NextResponse.json({
      saved: true,
      tiers: savedTiers,
      redirectTo: parsed.data.advance
        ? "/setup/recurring/billing"
        : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to save the recurring charges." },
      { status: 500 }
    );
  }
}