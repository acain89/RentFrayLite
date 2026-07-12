// app/api/ledger/charges/route.ts

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

type AllowedChargeType = "RENT_CHARGE" | "LATE_FEE" | "OTHER_FEE";
type LedgerChargeType = "RENT" | "LATE_FEE" | "OTHER_FEE";

type ParsedChargeBody = {
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string | null;
  type: AllowedChargeType;
  amountCents: number;
  memo: string | null;
  effectiveDate: Date;
  referenceNumber: string | null;
};

type SessionLike = {
  propertyId?: string | null;
  role?: string | null;
  managementUserId?: string | null;
};

const ALLOWED_TYPES: Set<AllowedChargeType> = new Set([
  "RENT_CHARGE",
  "LATE_FEE",
  "OTHER_FEE",
]);

const MAX_CHARGE_CENTS = 100_000_000;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptional(value: unknown): string | null {
  const trimmed = clean(value);
  return trimmed || null;
}

function toCents(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const cents = Math.round(n * 100);
  if (cents <= 0 || cents > MAX_CHARGE_CENTS) return null;

  return cents;
}

function parseEffectiveDate(value: unknown): Date | null {
  const raw = clean(value);
  if (!raw) return null;

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function isAllowedChargeType(value: string): value is AllowedChargeType {
  return ALLOWED_TYPES.has(value as AllowedChargeType);
}

function toLedgerChargeType(value: AllowedChargeType): LedgerChargeType {
  switch (value) {
    case "RENT_CHARGE":
      return "RENT";
    case "LATE_FEE":
      return "LATE_FEE";
    case "OTHER_FEE":
    default:
      return "OTHER_FEE";
  }
}

function badRequest(error: string) {
  return NextResponse.json<ApiError>({ ok: false, error }, { status: 400 });
}

async function parseBody(req: Request): Promise<ParsedChargeBody | null> {
  const body = (await req.json()) as Record<string, unknown>;

  const propertyId = clean(body.propertyId);
  const unitId = clean(body.unitId);
  const tenantAssignmentIdRaw = clean(
    body.tenantAssignmentId ?? body.tenantId
  );
  const typeRaw = clean(body.type).toUpperCase();
  const amountCents = toCents(body.amount);
  const memo = normalizeOptional(body.memo);
  const effectiveDate = parseEffectiveDate(body.effectiveDate);
  const referenceNumber = normalizeOptional(body.referenceNumber);

  if (!propertyId || !unitId) return null;
  if (!isAllowedChargeType(typeRaw)) return null;
  if (amountCents === null) return null;
  if (!effectiveDate) return null;

  return {
    propertyId,
    unitId,
    tenantAssignmentId: tenantAssignmentIdRaw || null,
    type: typeRaw,
    amountCents,
    memo,
    effectiveDate,
    referenceNumber,
  };
}

export async function GET() {
  return NextResponse.json<ApiSuccess<{ route: string }>>({
    ok: true,
    data: { route: "ledger-charges" },
  });
}

export async function POST(req: Request) {
  try {
    const session = (await getSession()) as SessionLike | null;

    if (
      !session ||
      !session.propertyId ||
      !canManageFinancials(session.role ?? "")
    ) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Only owner or manager can post charges." },
        { status: 401 }
      );
    }

    let parsed: ParsedChargeBody | null = null;

    try {
      parsed = await parseBody(req);
    } catch {
      return badRequest("Invalid request body.");
    }

    if (!parsed) {
      return badRequest("Missing or invalid required fields.");
    }

    const {
      propertyId,
      unitId,
      tenantAssignmentId,
      type,
      amountCents,
      memo,
      effectiveDate,
      referenceNumber,
    } = parsed;

    if (propertyId !== session.propertyId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Invalid property." },
        { status: 403 }
      );
    }

    const unit = await prisma.unit.findFirst({
  where: {
    id: unitId,
    propertyId,
  },
  include: {
    tier: true,
    property: {
      include: {
        settings: true,
      },
    },
  },
});

    if (!unit) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unit not found for this property." },
        { status: 404 }
      );
    }

    type Assignment = {
      id: string;
      unitId: string;
      propertyId: string;
    };

    let activeAssignment: Assignment | null = null;

    if (tenantAssignmentId) {
      activeAssignment = await prisma.tenantAssignment.findFirst({
        where: {
          id: tenantAssignmentId,
          unitId,
          propertyId,
          isCurrent: true,
        },
        select: {
          id: true,
          unitId: true,
          propertyId: true,
        },
      });

      if (!activeAssignment) {
        return NextResponse.json<ApiError>(
          {
            ok: false,
            error: "Tenant assignment is not active for this unit.",
          },
          { status: 400 }
        );
      }
    } else {
      activeAssignment = await prisma.tenantAssignment.findFirst({
        where: {
          unitId,
          propertyId,
          isCurrent: true,
        },
        select: {
          id: true,
          unitId: true,
          propertyId: true,
        },
      });
    }

const effective = resolveEffectiveBillingSettings({
  tier: unit.tier,
  propertySettings: unit.property.settings,
});

const rentDates = getRentDateSummary({
  ...effective,
  now: effectiveDate,
  billingCycleStartDate:
    unit.property.billingCycleStartDate,
});

let billingCycle = rentDates.billingCycle;

// 🔒 BLOCK: if pending payment exists → push to next cycle
const hasPending = await prisma.payment.findFirst({
  where: {
    propertyId,
    unitId,
    tenantAssignmentId: activeAssignment?.id ?? null,
    billingCycle,
    status: { in: ["PENDING", "PAID"] },
  },
  select: { id: true },
});

if (hasPending) {
  const [year, month] = billingCycle.split("-").map(Number);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  billingCycle = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}
    const chargeType = toLedgerChargeType(type);

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const entry = await tx.ledgerEntry.create({
  data: {
    propertyId,
    unitId,
    tenantAssignmentId: activeAssignment?.id ?? null,
    entryType: "CHARGE",
    chargeType,
    amountCents,
    effectiveDate,
    billingCycle, // ✅ CRITICAL FIX
    memo,
    referenceNumber,
    createdByManagementUserId: session.managementUserId ?? null,
  },
});

        await tx.auditLog.create({
          data: {
            propertyId,
            actorType: session.role ?? "MANAGER",
            actorManagementUserId: session.managementUserId ?? null,
            action: "MANUAL_CHARGE_POSTED",
            targetType: "LEDGER_ENTRY",
            targetId: entry.id,
            summary: `Manual ${chargeType} charge posted for unit ${
              unit.unitNumber ?? ""
            }`,
            metadataJson: JSON.stringify({
              unitId: unit.id,
              unitNumber: unit.unitNumber,
              tenantAssignmentId: activeAssignment?.id ?? null,
              entryType: entry.entryType,
              chargeType: entry.chargeType,
              amountCents: entry.amountCents,
              memo: entry.memo,
              effectiveDate: entry.effectiveDate.toISOString(),
              referenceNumber: entry.referenceNumber,
            }),
          },
        });

        return entry;
      }
    );

    emitEvent("ledger:update", {
      propertyId,
      unitId,
      tenantAssignmentId: result.tenantAssignmentId ?? null,
      entryId: result.id,
      entryType: result.entryType,
      chargeType: result.chargeType,
      source: "MANUAL_CHARGE",
    });

    return NextResponse.json<
      ApiSuccess<{
        entry: {
          id: string;
          propertyId: string;
          unitId: string;
          tenantAssignmentId: string | null;
          entryType: string;
          chargeType: string | null;
          amountCents: number;
          effectiveDate: Date;
          memo: string | null;
          referenceNumber: string | null;
          createdByManagementUserId: string | null;
          createdAt: Date;
        };
      }>
    >({
      ok: true,
      data: {
        entry: result,
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/ledger/charges error:", error);

    return NextResponse.json<ApiError>(
      { ok: false, error: "Failed to post charge." },
      { status: 500 }
    );
  }
}
