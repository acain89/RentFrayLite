// app/api/manager/payments/remind/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (
      !session ||
      (session.role !== "OWNER" &&
        session.role !== "MANAGER" &&
        session.role !== "STAFF")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { unitId } = await req.json();

    if (!unitId) {
      return NextResponse.json(
        { error: "unitId required" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        tenantAssignments: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    if (!unit || !unit.tenantAssignments.length) {
      return NextResponse.json(
        { error: "No active tenant" },
        { status: 400 }
      );
    }

    // 🔥 Placeholder for notification system
    console.log("Reminder triggered for unit", unit.unitNumber);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reminder error", err);
    return NextResponse.json(
      { error: "Failed to trigger reminder" },
      { status: 500 }
    );
  }
}
