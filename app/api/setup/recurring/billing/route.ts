import {
  SessionType,
  SetupStep,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

const billingRuleSchema = z
  .object({
    recurringPlanId: z.string().min(1).max(100),
    dueDay: z.number().int().min(1).max(31),
    gracePeriodDays: z.number().int().min(1).max(60),
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
    dailyLateFeeMaxDays: z.number().int().min(0).max(365),
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
  rules: z.array(billingRuleSchema).min(1).max(250),
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

  try {
    await prisma.$transaction(async (transaction) => {
      for (const rule of parsed.data.rules) {
        await transaction.recurringPlan.update({
          where: {
            id: rule.recurringPlanId,
          },
          data: {
            dueDay: rule.dueDay,
            gracePeriodDays: rule.gracePeriodDays,
            initialLateFeeCents:
              rule.initialLateFeeCents,
            dailyLateFeeCents: rule.dailyLateFeeCents,
            dailyLateFeeMaxDays:
              rule.dailyLateFeeMaxDays,
          },
        });
      }

      if (parsed.data.advance) {
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
    });

    return NextResponse.json({
      saved: true,
      redirectTo: parsed.data.advance
        ? "/setup/recurring/review"
        : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to save the billing rules." },
      { status: 500 }
    );
  }
}