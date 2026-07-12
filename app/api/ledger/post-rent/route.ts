import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageFinancials } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import {
  getBusinessDate,
  getRentDateSummary,
  resolveEffectiveBillingSettings,
} from "@/lib/rentDates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
  error: string;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function safeDate(d: Date): Date {
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function POST() {
  try {
    const session = await getSession();

    if (!session || !session.propertyId || !canManageFinancials(session.role)) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const property = await prisma.property.findUnique({
      where: { id: session.propertyId },
      include: {
        settings: true,
        units: {
          where: { isActive: true },
          include: {
            tier: {
              select: {
                baseRentCents: true,
                rentDueDay: true,
                gracePeriodDays: true,
                lateFeeInitialCents: true,
                lateFeeDailyCents: true,
                maxLateFeeDays: true,
              },
            },
            tenantAssignments: {
              where: { isCurrent: true },
              orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Property not found" },
        { status: 404 }
      );
    }

    const now = getBusinessDate();
    const effectiveDate = now;

    let posted = 0;
    let skipped = 0;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const unit of property.units) {
        const assignment = unit.tenantAssignments[0] ?? null;

        if (!assignment) {
          skipped++;
          continue;
        }

        const effective = resolveEffectiveBillingSettings({
          tier: unit.tier,
          propertySettings: property.settings,
        });

         const rentDates = getRentDateSummary({
         ...effective,
         now,
         billingCycleStartDate: property.billingCycleStartDate,
         });

        const billingCycle = rentDates.billingCycle;
        const monthLabel = getMonthLabel(now);

        const amountCents = unit.tier?.baseRentCents ?? 0;

        if (amountCents <= 0) {
          skipped++;
          continue;
        }

        const exists = await tx.ledgerEntry.findFirst({
          where: {
            propertyId: property.id,
            unitId: unit.id,
            tenantAssignmentId: assignment.id,
            entryType: "CHARGE",
            chargeType: "RENT",
            billingCycle,
            voidedAt: null,
          },
          select: { id: true },
        });

        if (exists) {
          skipped++;
          continue;
        }

        await tx.ledgerEntry.create({
          data: {
            propertyId: property.id,
            unitId: unit.id,
            tenantAssignmentId: assignment.id,
            entryType: "CHARGE",
            chargeType: "RENT",
            amountCents,
            memo: `Monthly rent - ${monthLabel}`,
            effectiveDate,
            billingCycle,
            createdByManagementUserId: session.managementUserId ?? null,
          },
        });

        posted++;
      }

      await tx.auditLog.create({
        data: {
          propertyId: property.id,
          actorType: "MANAGER",
          actorManagementUserId: session.managementUserId ?? null,
          action: "RENT_POSTED",
          targetType: "PROPERTY",
          targetId: property.id,
          summary: `Rent posted on ${getMonthLabel(now)}`,
          metadataJson: JSON.stringify({
            posted,
            skipped,
            triggeredAt: effectiveDate.toISOString(),
          }),
        },
      });
    });

    return NextResponse.json<ApiSuccess<{ posted: number; skipped: number }>>({
      ok: true,
      data: { posted, skipped },
    });
  } catch (error) {
    console.error("POST /api/ledger/post-rent error:", error);

    return NextResponse.json<ApiError>(
      { ok: false, error: "Failed to post rent" },
      { status: 500 }
    );
  }
}
