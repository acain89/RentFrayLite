import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getUnitLedgerSummary } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await requireRole("TENANT");

    if (!session.propertyId || !session.unitId) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const assignment = await prisma.tenantAssignment.findFirst({
  where: {
    propertyId: session.propertyId,
    unitId: session.unitId,
    isCurrent: true,
  },
  orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
  select: { id: true },
});

const summary = await getUnitLedgerSummary(
  session.unitId,
  assignment?.id ?? undefined
);

    return NextResponse.json({
      ok: true,
      balanceCents: summary.balanceCents,
      chargesCents: summary.totalChargesCents,
      paymentsCents: summary.totalPaidCents,
      hasPendingPayment: summary.hasPendingPayment,
      pendingPaymentAmountCents: summary.pendingPaymentAmountCents,
      lastPaymentDate: summary.lastPaymentDate,
      lastPaymentAmountCents: summary.lastPaymentAmountCents,
    });
  } catch (error: unknown) {
    console.error("GET /api/tenant/balance failed", error);

    return NextResponse.json(
      { error: "Failed to load balance." },
      { status: 500 }
    );
  }
}
