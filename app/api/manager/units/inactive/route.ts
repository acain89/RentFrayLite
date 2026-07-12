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
      !session.propertyId ||
      (session.role !== "OWNER" && session.role !== "MANAGER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const units = await prisma.unit.findMany({
      where: {
        propertyId: session.propertyId,
        isActive: false,
      },
      select: {
        id: true,
        unitNumber: true,
        tier: {
          select: {
            name: true,
          },
        },
        updatedAt: true,
      },
      orderBy: {
        unitNumber: "asc",
      },
    });

    return NextResponse.json({
      ok: true,
      units: units.map(
  (unit: {
    id: string;
    unitNumber: string;
    tier: { name: string } | null;
    updatedAt: Date;
  }) => ({
        id: unit.id,
        unitNumber: unit.unitNumber,
        tierName: unit.tier?.name ?? "Units",
        lastActiveAt: unit.updatedAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/manager/units/inactive failed", error);
    return NextResponse.json(
      { error: "Failed to load inactive units." },
      { status: 500 }
    );
  }
}
