// app/api/tenant/maintenance/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function clean(value: unknown) {
  return String(value || "").trim();
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.role !== "TENANT" || !session.unitId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: session.unitId,
        propertyId: session.propertyId,
      },
      include: {
        property: {
          select: {
            name: true,
          },
        },
        maintenanceRequests: {
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      propertyName: unit.property.name,
      unitNumber: unit.unitNumber,
      requests: unit.maintenanceRequests,
    });
  } catch (error) {
    console.error("GET /api/tenant/maintenance error:", error);
    return NextResponse.json({ error: "Failed to load maintenance requests" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (!session || session.role !== "TENANT" || !session.unitId || !session.propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const category = clean(body.category).toUpperCase();
    const urgency = clean(body.urgency).toUpperCase();
    const description = clean(body.description);

    if (!category || !urgency || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: session.unitId,
        propertyId: session.propertyId,
      },
      select: {
        id: true,
        unitNumber: true,
        propertyId: true,
      },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const requestRow = await prisma.maintenanceRequest.create({
      data: {
        propertyId: unit.propertyId,
        unitId: unit.id,
        category,
        urgency,
        status: "OPEN",
        description,
      },
    });

    await prisma.auditLog.create({
      data: {
        propertyId: unit.propertyId,
        actorRole: "TENANT",
        actorLabel: unit.unitNumber,
        action: "MAINTENANCE_REQUEST_CREATED",
        entityType: "MAINTENANCE_REQUEST",
        entityId: requestRow.id,
        notes: JSON.stringify({
          unitNumber: unit.unitNumber,
          category,
          urgency,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      request: requestRow,
    });
  } catch (error) {
    console.error("POST /api/tenant/maintenance error:", error);
    return NextResponse.json({ error: "Failed to create maintenance request" }, { status: 500 });
  }
}
