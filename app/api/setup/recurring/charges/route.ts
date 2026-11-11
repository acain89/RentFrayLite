import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { ConfigurationError, assertLegacyConfiguration, legacyConfigurationVersion, readConfigurationJson, CHARGES_PER_TIER } from "@/lib/recurringConfiguration";
import { patchRecurringConfiguration } from "@/lib/recurringTierOperations";
import { InvalidRecurringCharges, saveRecurringCharges } from "@/lib/recurringChargePersistence";
import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import {
  MAX_PAYMENT_AMOUNT_CENTS,
} from "@/lib/platformFees";

const chargeSchema = z.object({
  id: z.string().min(1).max(100).nullable(),
  clientKey: z.string().min(1).max(200),
  sourceChargeId: z.string().min(1).max(100).nullable().optional(),
  logicalChargeKey: z.string().min(1).max(100).optional(),
  effectiveBillingCycle: z.string().nullable().optional(),
  endsAfterBillingCycle: z.string().nullable().optional(),
  sharedChargeGroupId: z.string().max(100).nullable(),
  label: z.string().trim().min(1).max(80),
  amountCents: z.number().int().min(1).max(MAX_PAYMENT_AMOUNT_CENTS),
  applyToAllTiers: z.boolean(),
});

const tierSchema = z.object({
  recurringPlanId: z.string().min(1).max(100),
  charges: z.array(chargeSchema).max(CHARGES_PER_TIER),
});

const requestSchema = z.object({
  tiers: z.array(tierSchema).min(1),
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

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter valid recurring charge information." },
      { status: 400 }
    );
  }

  const businessId = session.business.id;
  const managerId = session.manager.id;
  const setupAlreadyCompleted = Boolean(session.business.setupCompletedAt);

  try {
    const savedTiers = await withManagerMutation(session,
      async (transaction) => {
        await assertLegacyConfiguration(transaction, businessId, parsed.data.expectedVersion);
        const saved = await saveRecurringCharges(transaction, businessId, parsed.data.tiers);

        if (parsed.data.advance && !setupAlreadyCompleted) {
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

        return { tiers: saved, version: await legacyConfigurationVersion(transaction, businessId) };
      }
    );

    return NextResponse.json({
      saved: true,
      tiers: savedTiers.tiers,
      version: savedTiers.version,
      redirectTo: parsed.data.advance
        ? "/setup/recurring/billing"
        : undefined,
    });
  } catch (error) {
    if (error instanceof ConfigurationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof InvalidRecurringCharges) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ManagerMutationUnauthorized) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json(
      { error: "Unable to save the recurring charges." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) { return patchRecurringConfiguration(request, "charges"); }
