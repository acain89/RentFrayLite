import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageFinancials } from "@/lib/permissions";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type AdjustType = "PRORATION" | "CHARGE" | "CREDIT";

function isAdjustType(value: string): value is AdjustType {
  return value === "PRORATION" || value === "CHARGE" || value === "CREDIT";
}

function toSafeCents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * Normalize a date to YYYY-MM (cycle key)
 */
function getCycleKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return `${y}-${m.toString().padStart(2, "0")}`;
}

function getNextCycleKey(cycleKey: string): string {
  const [yearRaw, monthRaw] = cycleKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return getCycleKey(new Date());
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (!session || !session.propertyId || !canManageFinancials(session.role)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const unitId = String(body.unitId || "").trim();
    const rawType = String(body.type || "").trim().toUpperCase();
    const amount = Number(body.amount);
    const memo = String(body.memo || "").trim();

    if (!unitId || !isAdjustType(rawType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid input" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        propertyId: session.propertyId,
      },
      include: {
        tenantAssignments: {
          where: { isCurrent: true },
          take: 1,
          select: { id: true },
        },
      },
    });

    if (!unit) {
      return NextResponse.json(
        { ok: false, error: "Unit not found" },
        { status: 404 }
      );
    }

    const assignment = unit.tenantAssignments[0] ?? null;

    if (!assignment) {
      return NextResponse.json(
        { ok: false, error: "No current tenant assignment for this unit" },
        { status: 400 }
      );
    }

    // ============================
    // 🔥 PRORATION (HARDENED)
    // ============================
    if (rawType === "PRORATION") {
      const moveInDateStr = String(body.moveInDate || "").trim();
      const rentCents = toSafeCents(body.rentCents);
      const recurringCents = toSafeCents(body.recurringCents);
      const depositCents = toSafeCents(body.depositCents);

      if (!moveInDateStr) {
        return NextResponse.json(
          { ok: false, error: "Invalid proration data" },
          { status: 400 }
        );
      }

      const effectiveDate = new Date(moveInDateStr);

      if (Number.isNaN(effectiveDate.getTime())) {
        return NextResponse.json(
          { ok: false, error: "Invalid move-in date" },
          { status: 400 }
        );
      }

      if (rentCents <= 0 && recurringCents <= 0 && depositCents <= 0) {
        return NextResponse.json(
          { ok: false, error: "Nothing to post" },
          { status: 400 }
        );
      }

      const cycleKey = getCycleKey(effectiveDate);

      // 🚨 CRITICAL GUARD: prevent duplicate first-cycle rent
      const existingRent = await prisma.ledgerEntry.findFirst({
        where: {
          tenantAssignmentId: assignment.id,
          entryType: "CHARGE",
          chargeType: "RENT",
        },
        select: {
          id: true,
          effectiveDate: true,
        },
      });

      if (existingRent) {
        const existingCycle = getCycleKey(existingRent.effectiveDate);

        if (existingCycle === cycleKey) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Initial rent already exists for this tenant in this billing cycle",
            },
            { status: 400 }
          );
        }
      }

      const entries: Array<{
        entryType: "CHARGE";
        chargeType: "RENT" | "RECURRING_FEE" | "OTHER_FEE";
        amountCents: number;
        memo: string;
      }> = [];

      if (rentCents > 0) {
        entries.push({
          entryType: "CHARGE",
          chargeType: "RENT",
          amountCents: rentCents,
          memo: "Prorated rent",
        });
      }

      if (recurringCents > 0) {
        entries.push({
          entryType: "CHARGE",
          chargeType: "RECURRING_FEE",
          amountCents: recurringCents,
          memo: "Prorated recurring charges",
        });
      }

      if (depositCents > 0) {
        entries.push({
          entryType: "CHARGE",
          chargeType: "OTHER_FEE",
          amountCents: depositCents,
          memo: memo || "Move-in deposit",
        });
      }

      await prisma.$transaction(
        entries.map((entry) =>
          prisma.ledgerEntry.create({
            data: {
              propertyId: session.propertyId!,
              unitId: unit.id,
              tenantAssignmentId: assignment.id,
              entryType: entry.entryType,
              chargeType: entry.chargeType,
              amountCents: entry.amountCents,
              memo: entry.memo,
              effectiveDate,
              createdByManagementUserId:
                session.managementUserId ?? null,
            },
          })
        )
      );

      return NextResponse.json({ ok: true });
    }

    // ============================
    // STANDARD ADJUSTMENTS
    // ============================
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid amount" },
        { status: 400 }
      );
    }

    const amountCents = Math.round(amount * 100);

    let entryType: "CHARGE" | "CREDIT";
    let chargeType: "RENT" | "RECURRING_FEE" | "OTHER_FEE" | null;
    let defaultMemo: string;

    if (rawType === "CHARGE") {
      entryType = "CHARGE";
      chargeType = "OTHER_FEE";
      defaultMemo = "One-time charge";
    } else {
      entryType = "CREDIT";
      chargeType = null;
      defaultMemo = "Credit";
    }

    const currentEffectiveDate = new Date();
const currentBillingCycle = getCycleKey(currentEffectiveDate);

const blockingPayment = await prisma.payment.findFirst({
  where: {
    propertyId: session.propertyId,
    unitId: unit.id,
    tenantAssignmentId: assignment.id,
    billingCycle: currentBillingCycle,
    status: { in: ["PENDING", "PAID"] },
  },
  select: { id: true },
});

const finalBillingCycle = blockingPayment
  ? getNextCycleKey(currentBillingCycle)
  : currentBillingCycle;

const finalEffectiveDate = blockingPayment
  ? new Date(`${finalBillingCycle}-01T00:00:00`)
  : currentEffectiveDate;

await prisma.ledgerEntry.create({
  data: {
    propertyId: session.propertyId,
    unitId: unit.id,
    tenantAssignmentId: assignment.id,
    entryType,
    chargeType,
    amountCents,
    memo: blockingPayment
      ? `${memo || defaultMemo} (applies next billing cycle)`
      : memo || defaultMemo,
    effectiveDate: finalEffectiveDate,
    billingCycle: finalBillingCycle,
    createdByManagementUserId: session.managementUserId ?? null,
  },
});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to adjust balance" },
      { status: 500 }
    );
  }
}
