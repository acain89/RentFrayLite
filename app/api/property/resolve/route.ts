import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOccupiedTierUnitCount } from "@/lib/propertyCapacity";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResolveRequestBody = {
  code?: string;
  propertyCode?: string;
};

export async function POST(req: Request) {
  try {
        const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const rateLimit = checkRateLimit(`property-resolve:${ip}`, 20, 60_000);

    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a minute and try again." },
        { status: 429 }
      );
    }
    
    const body = (await req.json()) as Partial<ResolveRequestBody>;
    const propertyCode = String(body.code ?? body.propertyCode ?? "").trim();

    if (!/^\d{4,5}$/.test(propertyCode)) {
      return NextResponse.json(
        { error: "Valid 4 or 5 digit property code required" },
        { status: 400 }
      );
    }

    const property = await prisma.property.findFirst({
      where: {
        propertyCode: {
          equals: propertyCode,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        propertyCode: true,
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Invalid property code." },
        { status: 404 }
      );
    }

    const tiers = await prisma.propertyTier.findMany({
      where: {
        propertyId: property.id,
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        baseRentCents: true,
        unitCount: true,
      },
    });

    const tiersWithAvailability = await Promise.all(
      tiers.map(
  async (tier: {
    id: string;
    name: string;
    baseRentCents: number;
    unitCount: number;
  }) => {
        const occupiedUnits = await getOccupiedTierUnitCount(property.id, tier.id);
        const maxUnits = Math.max(0, tier.unitCount);
        const availableUnits = Math.max(0, maxUnits - occupiedUnits);

        return {
          id: tier.id,
          name: tier.name,
          baseRentCents: tier.baseRentCents,
          unitCount: maxUnits,
          occupiedUnits,
          availableUnits,
           isFull: maxUnits <= 0 || availableUnits <= 0,
      };
    }
  )
);

    return NextResponse.json({
      ok: true,
      property: {
        id: property.id,
        name: property.name,
        propertyCode: property.propertyCode,
      },
      tiers: tiersWithAvailability,
    });
  } catch (error: unknown) {
    console.error("PROPERTY_RESOLVE_ERROR:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}