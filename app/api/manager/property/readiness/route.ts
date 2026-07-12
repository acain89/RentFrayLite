// app/api/manager/property/readiness/route.ts
// [path: app/api/manager/property/readiness/route.ts]

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getLiveReadiness } from "@/lib/liveGating";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getSession();

    if (!session || !session.propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const property = await prisma.property.findUnique({
      where: { id: session.propertyId },
      include: {
        settings: true,
        units: {
          select: { id: true },
        },
        paymentConnectionStatus: true,
      },
    });

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const readiness = getLiveReadiness(property);

    return NextResponse.json({
      ok: true,
      readiness: {
        ...readiness,
        status: property.status,
      },
    });
  } catch (error) {
    console.error("GET readiness error:", error);
    return NextResponse.json({ error: "Failed to load readiness" }, { status: 500 });
  }
}
