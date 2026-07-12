// app/api/admin/properties/list/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type PropertyListRow = {
  id: string;
  name: string;
  propertyCode: string;
  propertyType: string;
  isActive: boolean;
  contactName: string;
  contactEmail: string;
  unitCount: number;
  tierCount: number;
};

function safeString(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyCode = safeString(searchParams.get("propertyCode"));

    const properties = await prisma.property.findMany({
      where: propertyCode
        ? {
            propertyCode: {
              contains: propertyCode,
            },
          }
        : undefined,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        propertyCode: true,
        propertyType: true,
        isActive: true,
        ownerDisplayName: true,
        contactEmail: true,
        _count: {
          select: {
            units: true,
            tiers: true,
          },
        },
      },
    });

    const rows: PropertyListRow[] = properties.map(
      (property: (typeof properties)[number]) => ({
        id: property.id,
        name: property.name,
        propertyCode: property.propertyCode,
        propertyType: safeString(property.propertyType),
        isActive: property.isActive,
        contactName: safeString(property.ownerDisplayName),
        contactEmail: safeString(property.contactEmail),
        unitCount: property._count.units,
        tierCount: property._count.tiers,
      })
    );

    return NextResponse.json({
      ok: true,
      properties: rows,
    });
  } catch (error) {
    console.error("GET /api/admin/properties/list failed", error);

    return NextResponse.json(
      { error: "Unable to load properties." },
      { status: 500 }
    );
  }
}
