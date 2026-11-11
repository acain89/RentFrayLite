import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { ConfigurationError, assertLegacyConfiguration, legacyConfigurationVersion, readConfigurationJson } from "@/lib/recurringConfiguration";
import { getRecurringConfiguration, inheritSharedConfiguration, patchRecurringConfiguration } from "@/lib/recurringTierOperations";
import { validateRecurringPaymentConfiguration } from "@/lib/recurringValidation";
﻿import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { MAX_PAYMENT_AMOUNT_CENTS } from "@/lib/platformFees";

const recurringTiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        id: z.string().min(1).max(100).nullable(),
        clientKey: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(80),
        amountCents: z.number().int().min(1).max(MAX_PAYMENT_AMOUNT_CENTS),
      })
    )
    .min(1),
  expectedVersion: z.string().optional(),
  advance: z.boolean().optional().default(false),
});

export async function PUT(request: Request) {
  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }

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

  let body: unknown;

  try {
    body = await readConfigurationJson(request);
  } catch (error) {
    if (error instanceof ConfigurationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = recurringTiersSchema.safeParse(body);

  if (!parsed.success) {
    const amountTooHigh = parsed.error.issues.some(
      (issue) =>
        issue.path.at(-1) === "amountCents" &&
        issue.code === "too_big"
    );

    return NextResponse.json(
      {
        error: amountTooHigh
          ? "Monthly amount cannot exceed $5,000."
          : "Enter at least one valid rent tier.",
      },
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
  const setupAlreadyCompleted = Boolean(session.business.setupCompletedAt);

  const submittedExistingIds = parsed.data.tiers
    .map((tier) => tier.id)
    .filter((id): id is string => Boolean(id));
  if (new Set(submittedExistingIds).size !== submittedExistingIds.length) return NextResponse.json({ error: "Each rent tier must have a unique identity." }, { status: 400 });

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
    const savedTiers = await withManagerMutation(session,
      async (transaction) => {
        const currentPlans = await assertLegacyConfiguration(transaction, businessId, parsed.data.expectedVersion);
        const owned = await transaction.recurringPlan.findMany({ where: { businessId, id: { in: submittedExistingIds } }, select: { id: true } });
        if (owned.length !== submittedExistingIds.length) throw new ConfigurationError("One or more rent tiers are invalid.", 400);
        for (const tier of parsed.data.tiers) {
          const current = currentPlans.find(plan => plan.id === tier.id);
          if (current) {
            const validation = validateRecurringPaymentConfiguration({ ...current, planName: tier.name, baseAmountCents: tier.amountCents,
              recurringChargeCents: current.charges.filter(charge => charge.isActive).reduce((sum, charge) => sum + charge.amountCents, 0) });
            if (!validation.ok) throw new ConfigurationError(validation.error, 400);
          }
        }
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
                businessId,
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
              gracePeriodDays: 5,
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
          if (currentPlans.length) await inheritSharedConfiguration(transaction, businessId, created.id);

          saved.push({
            ...created,
            clientKey: tier.clientKey,
          });
        }

        if (parsed.data.advance && !setupAlreadyCompleted) {
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

        return { tiers: saved, version: await legacyConfigurationVersion(transaction, businessId) };
      }
    );

    return NextResponse.json({
      saved: true,
      tiers: savedTiers.tiers,
      version: savedTiers.version,
      redirectTo: parsed.data.advance
        ? "/setup/recurring/charges"
        : undefined,
    });
  } catch (error) {
    if (error instanceof ConfigurationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ManagerMutationUnauthorized) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json(
      { error: "Unable to save the rent tiers." },
      { status: 500 }
    );
  }
}

export const GET = getRecurringConfiguration;
export async function PATCH(request: Request) { return patchRecurringConfiguration(request, "tiers"); }

