// app/api/manager/property/payment-status/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageFinancials } from "@/lib/permissions";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getSession();

    if (!session || !session.propertyId || !canManageFinancials(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await prisma.paymentConnectionStatus.findUnique({
      where: { propertyId: session.propertyId },
      select: {
        processorConnected: true,
        bankConnected: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        onboardingComplete: true,
        requirementsDue: true,
        requirementsSummary: true,
        lastSyncedAt: true,
        readyForLive: true,
      },
    });

    return NextResponse.json({
      ok: true,
      status: status || {
        processorConnected: false,
        bankConnected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingComplete: false,
        requirementsDue: false,
        requirementsSummary: null,
        lastSyncedAt: null,
        readyForLive: false,
      },
    });
  } catch (error: unknown) {
    console.error("GET payment-status error:", error);
    return NextResponse.json(
      { error: "Failed to load payment status" },
      { status: 500 }
    );
  }
}
