import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const VALID_CATEGORIES = [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "APPLIANCE",
  "PEST",
  "LOCKS",
  "GENERAL",
] as const;

const VALID_URGENCY = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export async function POST(req: Request) {
  try {
    const session = await requireRole("TENANT");

    // ✅ EARLY HARD GUARD (TS + runtime safe)
    if (!session.unitId || !session.propertyId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json();

    const category = String(body.category || "").trim().toUpperCase();
    const urgency = String(body.urgency || "").trim().toUpperCase();
    const description = String(body.description || "").trim();

    if (
      !VALID_CATEGORIES.includes(
        category as (typeof VALID_CATEGORIES)[number]
      )
    ) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    if (
      !VALID_URGENCY.includes(
        urgency as (typeof VALID_URGENCY)[number]
      )
    ) {
      return NextResponse.json({ error: "Invalid urgency" }, { status: 400 });
    }

    if (description.length < 5) {
      return NextResponse.json(
        { error: "Description must be at least 5 characters" },
        { status: 400 }
      );
    }

    // ✅ GUARANTEE UNIT EXISTS BEFORE USE
    const unit = await prisma.unit.findFirst({
      where: {
        id: session.unitId,
        propertyId: session.propertyId,
      },
      select: {
        id: true,
        propertyId: true,
      },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const request = await prisma.maintenanceRequest.create({
      data: {
        propertyId: unit.propertyId,
        unitId: unit.id,
        category,
        urgency,
        status: "OPEN",
        description,
        createdByTenant: true,
        tenantVisibleName: null,
      },
      select: {
        id: true,
        category: true,
        urgency: true,
        status: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, request });
  } catch (error) {
    console.error("tenant maintenance create POST error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
