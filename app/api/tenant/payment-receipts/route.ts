// app/api/tenant/payment-receipts/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PaymentStatus } from "@prisma/client";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type TenantReceipt = {
  id: string;
  amountCents: number;
  billingCycle: string | null;
  method: string | null;
  reference: string | null;
  note: string | null;
  status: PaymentStatus;
  paidAt: Date | null;
  createdAt: Date;
};

export async function GET() {
  try {
    const session = await requireRole("TENANT");

    if (!session.unitId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const payments = await prisma.payment.findMany({
      where: {
  unitId: session.unitId,
  propertyId: session.propertyId,
  status: {
    in: [
      PaymentStatus.PENDING,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.REVERSED,
    ],
  },
},
      orderBy: [{ createdAt: "desc" }, { paidAt: "desc" }],
      take: 100,
      select: {
        id: true,
        amountCents: true,
        billingCycle: true,
        paymentMethod: true,
        referenceNumber: true,
        memo: true,
        status: true,
        paidAt: true,
        createdAt: true,
      },
    });

    const receipts: TenantReceipt[] = payments.map(
      (p: (typeof payments)[number]) => ({
        id: p.id,
        amountCents: p.amountCents,
        billingCycle: p.billingCycle,
        method: p.paymentMethod ?? null,
        reference: p.referenceNumber ?? null,
        note: p.memo ?? null,
        status: p.status,
        paidAt: p.paidAt ?? null,
        createdAt: p.createdAt,
      })
    );

    return NextResponse.json({
      ok: true,
      receipts,
    });
  } catch (err) {
    console.error("tenant payment-receipts GET error", err);
    return NextResponse.json(
      { error: "Failed to load receipts" },
      { status: 500 }
    );
  }
}
