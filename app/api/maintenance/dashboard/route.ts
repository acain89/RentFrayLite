// [path: app/api/maintenance/dashboard/route.ts]

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
      session.role !== "MAINTENANCE" ||
      !session.propertyId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requests = await prisma.maintenanceRequest.findMany({
      where: {
        propertyId: session.propertyId,
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        unit: {
          select: {
            unitNumber: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
        requests: requests.map((row: any) => ({
        id: row.id,
        unitNumber: row.unit.unitNumber,
        category: row.category,
        urgency: row.urgency,
        status: row.status,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/maintenance/dashboard error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
