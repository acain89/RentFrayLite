// app/api/manual-payments/route.ts

import { NextResponse } from "next/server";
import { Prisma, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageFinancials } from "@/lib/permissions";
import { emitEvent } from "@/lib/realtime";
import {
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

type ManualPaymentEntryResponse = {
  id: string;
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string | null;
  entryType: "PAYMENT";
  amountCents: number;
  memo: string | null;
  effectiveDate: Date;
  createdAt: Date;
  paymentId: string;
  status: PaymentStatus;
  billingCycle: string;
};

type ParsedBody = {
  unitId: string;
  tenantId: string | null;
  amountCents: number;
  memo: string | null;
  effectiveDate: Date;
};

type UnitForManualPayment = {
  id: string;
  propertyId: string;
  unitNumber: string;
  tier: {
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeInitialCents: number;
    lateFeeDailyCents: number;
    maxLateFeeDays: number;
  } | null;
  property: {
    billingCycleStartDate: Date | null;
    settings: {
      rentDueDay: number;
      gracePeriodDays: number;
      lateFeeEnabled: boolean;
      lateFeeFlatCents: number | null;
    } | null;
  };
};

const MAX_PAYMENT_CENTS = 100_000_000;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMemo(value: unknown): string | null {
  const trimmed = clean(value);
  return trimmed ? trimmed : null;
}

function parseMoneyToCents(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const cents = Math.round(n * 100);
  if (cents <= 0 || cents > MAX_PAYMENT_CENTS) return null;

  return cents;
}

function parseEffectiveDate(value: unknown): Date | null {
  const raw = clean(value);
  if (!raw) return null;

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function badRequest(error: string) {
  return NextResponse.json<ApiError>({ ok: false, error }, { status: 400 });
}

async function parseBody(req: Request): Promise<ParsedBody | null> {
  const body = (await req.json()) as Record<string, unknown>;

  const unitId = clean(body.unitId);
  const tenantIdRaw = clean(body.tenantId);
  const amountCents = parseMoneyToCents(body.amount);
  const memo = normalizeMemo(body.memo ?? body.description);
  const effectiveDate = parseEffectiveDate(body.effectiveDate);

  if (!unitId) return null;
  if (amountCents === null) return null;
  if (!effectiveDate) return null;

  return {
    unitId,
    tenantId: tenantIdRaw || null,
    amountCents,
    memo,
    effectiveDate,
  };
}

export async function GET() {
  return NextResponse.json<ApiSuccess<{ route: string }>>({
    ok: true,
    data: { route: "manual-payments" },
  });
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (!session || !session.propertyId || !canManageFinancials(session.role)) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Only owner or manager can post manual payments." },
        { status: 401 }
      );
    }

    let parsed: ParsedBody | null = null;

    try {
      parsed = await parseBody(req);
    } catch {
      return badRequest("Invalid request body.");
    }

    if (!parsed) {
      return badRequest("Missing or invalid required fields.");
    }

    const { unitId, tenantId, amountCents, memo, effectiveDate } = parsed;

    if (amountCents < 500) {
      return badRequest("Payment amount too small.");
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        propertyId: session.propertyId,
      },
      select: {
        id: true,
        propertyId: true,
        unitNumber: true,
        tier: {
          select: {
            rentDueDay: true,
            gracePeriodDays: true,
            lateFeeInitialCents: true,
            lateFeeDailyCents: true,
            maxLateFeeDays: true,
          },
        },
        property: {
          select: {
            billingCycleStartDate: true,
            settings: {
              select: {
                rentDueDay: true,
                gracePeriodDays: true,
                lateFeeEnabled: true,
                lateFeeFlatCents: true,
              },
            },
          },
        },
      },
    });

    if (!unit) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unit not found." },
        { status: 404 }
      );
    }

    const typedUnit = unit as UnitForManualPayment;

    let assignment: { id: string } | null = null;

    if (tenantId) {
      assignment = await prisma.tenantAssignment.findFirst({
        where: {
          tenantId,
          unitId,
          propertyId: typedUnit.propertyId,
          isCurrent: true,
        },
        select: { id: true },
      });

      if (!assignment) {
        return NextResponse.json<ApiError>(
          { ok: false, error: "Tenant is not active in this unit." },
          { status: 400 }
        );
      }
    } else {
      assignment = await prisma.tenantAssignment.findFirst({
        where: {
          unitId,
          propertyId: typedUnit.propertyId,
          isCurrent: true,
        },
        orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });
    }

    if (!assignment) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "No active tenant assignment found for this unit." },
        { status: 400 }
      );
    }

    const effective = resolveEffectiveBillingSettings({
      tier: typedUnit.tier,
      propertySettings: typedUnit.property.settings,
    });

    const rentDates = getRentDateSummary({
      ...effective,
      now: effectiveDate,
      billingCycleStartDate: typedUnit.property.billingCycleStartDate,
    });

    const billingCycle = rentDates.billingCycle;

    const result = await prisma.$transaction(
      async (
        tx: Prisma.TransactionClient
      ): Promise<ManualPaymentEntryResponse> => {
        const payment = await tx.payment.create({
          data: {
            propertyId: typedUnit.propertyId,
            unitId: typedUnit.id,
            tenantAssignmentId: assignment.id,
            amountCents,
            status: PaymentStatus.PAID,
            paidAt: effectiveDate,
            paymentMethod: "MANUAL",
            stripePaymentIntentId: `manual_${typedUnit.id}_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2)}`,
            billingCycle,
          },
          select: {
            id: true,
            status: true,
            paidAt: true,
          },
        });

        const entry = await tx.ledgerEntry.create({
          data: {
            propertyId: typedUnit.propertyId,
            unitId: typedUnit.id,
            tenantAssignmentId: assignment.id,
            entryType: "PAYMENT",
            amountCents: -amountCents,
            effectiveDate,
            billingCycle,
            memo,
            paymentId: payment.id,
            createdByManagementUserId: session.managementUserId ?? null,
          },
          select: {
            id: true,
            propertyId: true,
            unitId: true,
            tenantAssignmentId: true,
            entryType: true,
            amountCents: true,
            effectiveDate: true,
            memo: true,
            createdAt: true,
            billingCycle: true,
          },
        });

        await tx.auditLog.create({
          data: {
            propertyId: typedUnit.propertyId,
            actorType: "MANAGER",
            actorManagementUserId: session.managementUserId ?? null,
            action: "MANUAL_PAYMENT_POSTED",
            targetType: "LEDGER_ENTRY",
            targetId: entry.id,
            summary: `Manual payment posted for unit ${typedUnit.unitNumber}`,
            metadataJson: JSON.stringify({
              unitId: typedUnit.id,
              unitNumber: typedUnit.unitNumber,
              tenantAssignmentId: entry.tenantAssignmentId,
              paymentId: payment.id,
              amountCents,
              billingCycle,
              memo,
              effectiveDate: entry.effectiveDate.toISOString(),
            }),
          },
        });

        return {
          id: entry.id,
          propertyId: entry.propertyId,
          unitId: entry.unitId,
          tenantAssignmentId: entry.tenantAssignmentId,
          entryType: "PAYMENT",
          amountCents: Math.abs(entry.amountCents),
          memo: entry.memo,
          effectiveDate: entry.effectiveDate,
          createdAt: entry.createdAt,
          paymentId: payment.id,
          status: payment.status,
          billingCycle,
        };
      }
    );

    emitEvent("payment:update", {
      propertyId: typedUnit.propertyId,
      unitId: typedUnit.id,
      tenantAssignmentId: result.tenantAssignmentId,
      entryId: result.id,
      entryType: result.entryType,
      source: "MANUAL_PAYMENT",
    });

    emitEvent("ledger:update", {
      propertyId: typedUnit.propertyId,
      unitId: typedUnit.id,
      tenantAssignmentId: result.tenantAssignmentId,
      entryId: result.id,
      entryType: result.entryType,
      source: "MANUAL_PAYMENT",
    });

    return NextResponse.json<ApiSuccess<{ entry: ManualPaymentEntryResponse }>>({
      ok: true,
      data: { entry: result },
    });
  } catch (error) {
    console.error("POST /api/manual-payments error:", error);

    return NextResponse.json<ApiError>(
      { ok: false, error: "Failed to post manual payment." },
      { status: 500 }
    );
  }
}