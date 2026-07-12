import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.role !== "TENANT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { propertyId, unitId } = session;

    if (!propertyId || !unitId) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        unitNumber: true,
        portalFirstName: true,
        portalLastName: true,
      },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      unit,
    });
  } catch (error: unknown) {
    console.error("GET /api/tenant/me failed", error);

    return NextResponse.json(
      { error: "Failed to load tenant data." },
      { status: 500 }
    );
  }
}
