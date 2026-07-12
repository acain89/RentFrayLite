// app/api/manager/audit-log/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getSession();

    if (
      !session ||
      (session.role !== "OWNER" &&
        session.role !== "MANAGER" &&
        session.role !== "STAFF") ||
      !session.propertyId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payments = await prisma.payment.findMany({
      where: { propertyId: session.propertyId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const audit = payments.map((p: (typeof payments)[number]) => ({
      id: p.id,
      type: "PAYMENT",
      status: p.status,
      amount: p.amountCents,
      unitId: p.unitId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return NextResponse.json({ ok: true, audit });
  } catch (err) {
    console.error("audit error", err);
    return NextResponse.json(
      { error: "Failed to load audit log" },
      { status: 500 }
    );
  }
}
