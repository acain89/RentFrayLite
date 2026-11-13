import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { ConfigurationError, assertLegacyConfiguration, legacyConfigurationVersion, readConfigurationJson } from "@/lib/recurringConfiguration";
import { patchRecurringConfiguration } from "@/lib/recurringTierOperations";
﻿import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import {
  validateRecurringPaymentConfiguration, isValidDailyLateFeeDays, DAILY_LATE_FEE_DAYS_ERROR,
} from "@/lib/recurringValidation";

const billingRuleSchema = z
  .object({
    recurringPlanId: z.string().min(1).max(100),
    dueDay: z.literal(1).default(1),
    gracePeriodDays: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    initialLateFeeCents: z
      .number()
      .int()
      .min(0)
      .max(10_000_000),
    dailyLateFeeCents: z
      .number()
      .int()
      .min(0)
      .max(10_000_000),
    dailyLateFeeMaxDays: z.number().int().refine(isValidDailyLateFeeDays, DAILY_LATE_FEE_DAYS_ERROR),
  })
  .superRefine((rule, context) => {
    if (
      rule.dailyLateFeeCents > 0 &&
      rule.dailyLateFeeMaxDays < 1
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dailyLateFeeMaxDays"],
        message:
          "Choose how many days the daily late fee may apply.",
      });
    }

    if (
      rule.dailyLateFeeCents === 0 &&
      rule.dailyLateFeeMaxDays !== 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dailyLateFeeMaxDays"],
        message:
          "Daily late-fee days must be zero when the daily fee is disabled.",
      });
    }
  });

const requestSchema = z.object({
  sameRulesForAll: z.boolean(),
  rules: z.array(billingRuleSchema).min(1),
  expectedVersion: z.string().optional(),
  advance: z.boolean().optional().default(false),
  confirmCalendarChange: z.boolean().optional().default(false),
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
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter valid billing rules.",
      },
      { status: 400 }
    );
  }

  const businessId = session.business.id;
  const managerId = session.manager.id;
  const setupAlreadyCompleted = Boolean(session.business.setupCompletedAt);

  try {
    return await withManagerMutation(session, async (transaction) => {
      await assertLegacyConfiguration(transaction, businessId, parsed.data.expectedVersion);
  // Re-read and validate while holding management's Business lock. A concurrent
  // settings save cannot bypass legacy-conversion consent or amount validation.
  const plans = await transaction.recurringPlan.findMany({
    where: {
      businessId,
      isActive: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
    select: {
      id: true,
      name: true,
      baseAmountCents: true,
      dueDay: true,
      gracePeriodDays: true,
      charges: {
        where: {
          isActive: true,
        },
        select: {
          amountCents: true,
        },
      },
    },
  });

  const needsCalendarConfirmation = plans.some(plan =>
    plan.dueDay !== 1 || ![3, 4, 5].includes(plan.gracePeriodDays));
  if (needsCalendarConfirmation && !parsed.data.confirmCalendarChange) {
    return NextResponse.json({ error: "Confirm changing the existing billing calendar to rent due on the 1st with a 3, 4, or 5-day grace period." }, { status: 409 });
  }

  const planIds = plans.map((plan) => plan.id);
  const submittedIds = parsed.data.rules.map(
    (rule) => rule.recurringPlanId
  );

  if (
    submittedIds.length !== planIds.length ||
    new Set(submittedIds).size !== submittedIds.length ||
    submittedIds.some((id) => !planIds.includes(id))
  ) {
    return NextResponse.json(
      { error: "One or more rent tiers are invalid." },
      { status: 400 }
    );
  }


 for (const rule of parsed.data.rules) {
  const plan = plans.find(
    (item) => item.id === rule.recurringPlanId
  );

  if (!plan) {
    return NextResponse.json(
      { error: "One or more rent tiers are invalid." },
      { status: 400 }
    );
  }

  const recurringChargeCents =
    plan.charges.reduce(
      (total, charge) =>
        total + charge.amountCents,
      0
    );

  const validation =
    validateRecurringPaymentConfiguration({
      planName: plan.name,
      baseAmountCents: plan.baseAmountCents,
      recurringChargeCents,
      initialLateFeeCents:
        rule.initialLateFeeCents,
      dailyLateFeeCents:
        rule.dailyLateFeeCents,
      dailyLateFeeMaxDays:
        rule.dailyLateFeeMaxDays,
    });

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.error,
      },
      { status: 400 }
    );
  }
}

  if (parsed.data.sameRulesForAll) {
    const firstRule = parsed.data.rules[0];

    const allIdentical = parsed.data.rules.every(
      (rule) =>
        rule.dueDay === firstRule.dueDay &&
        rule.gracePeriodDays ===
          firstRule.gracePeriodDays &&
        rule.initialLateFeeCents ===
          firstRule.initialLateFeeCents &&
        rule.dailyLateFeeCents ===
          firstRule.dailyLateFeeCents &&
        rule.dailyLateFeeMaxDays ===
          firstRule.dailyLateFeeMaxDays
    );

    if (!allIdentical) {
      return NextResponse.json(
        {
          error:
            "All tiers must use identical rules when the shared-rules option is enabled.",
        },
        { status: 400 }
      );
    }
  }

      for (const rule of parsed.data.rules) {
        await transaction.recurringPlan.update({
          where: {
            id: rule.recurringPlanId,
          },
          data: {
            dueDay: 1,
            gracePeriodDays: rule.gracePeriodDays,
            initialLateFeeCents:
              rule.initialLateFeeCents,
            dailyLateFeeCents: rule.dailyLateFeeCents,
            dailyLateFeeMaxDays:
              rule.dailyLateFeeMaxDays,
          },
        });
      }

      if (parsed.data.advance && !setupAlreadyCompleted) {
        await transaction.business.update({
          where: {
            id: businessId,
          },
          data: {
            setupStep: SetupStep.REVIEW_RECURRING,
          },
        });

        await transaction.auditLog.create({
          data: {
            businessId,
            actorType: "MANAGER",
            actorId: managerId,
            action: "RECURRING_BILLING_COMPLETED",
            targetType: "BUSINESS",
            targetId: businessId,
            summary: parsed.data.sameRulesForAll
              ? "Shared recurring billing rules configured."
              : "Tier-specific recurring billing rules configured.",
          },
        });
      }
    return NextResponse.json({
      saved: true,
      version: await legacyConfigurationVersion(transaction, businessId),
      redirectTo: parsed.data.advance
        ? "/setup/recurring/review"
        : undefined,
    });
    });
  } catch (error) {
    if (error instanceof ConfigurationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ManagerMutationUnauthorized) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json(
      { error: "Unable to save the billing rules." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) { return patchRecurringConfiguration(request, "billing"); }
