import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireRole("MANAGER");

    if (!session.propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { unitId, makeActive } = body as {
      unitId?: string;
      makeActive?: boolean;
    };

    if (!unitId || typeof makeActive !== "boolean") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

   const result = await prisma.$transaction(
  async (tx: Prisma.TransactionClient) => {
    const unit = await tx.unit.findFirst({
      where: {
        id: unitId,
        propertyId: session.propertyId,
      },
      include: {
        tenantAssignments: {
          where: {
            isCurrent: true,
            OR: [{ moveOutDate: null }, { moveOutDate: { gt: new Date() } }],
          },
          take: 1,
        },
        tier: {
          select: {
            id: true,
            unitCount: true,
            activeUnitCount: true,
            isActive: true,
          },
        },
      },
    });

    if (!unit) {
      throw new Error("Unit not found");
    }

    if (!makeActive && unit.tenantAssignments.length > 0) {
      throw new Error("Cannot inactivate an occupied unit");
    }

    if (makeActive && unit.tierId) {
      if (!unit.tier || !unit.tier.isActive) {
        throw new Error("Tier does not belong to property.");
      }

      const activeTierUnitCount = await tx.unit.count({
        where: {
          propertyId: session.propertyId,
          tierId: unit.tierId,
          isActive: true,
        },
      });

      if (activeTierUnitCount >= unit.tier.unitCount) {
        throw new Error("Max number of units have been activated for this tier.");
      }
    }

    const updated = await tx.unit.update({
      where: { id: unit.id },
      data: { isActive: makeActive },
    });

    if (unit.tierId) {
      const activeTierUnitCount = await tx.unit.count({
        where: {
          propertyId: session.propertyId,
          tierId: unit.tierId,
          isActive: true,
        },
      });

      await tx.propertyTier.update({
        where: { id: unit.tierId },
        data: { activeUnitCount: activeTierUnitCount },
      });
    }

    return updated;
  }
);

    return NextResponse.json({ ok: true, unit: result });
  } catch (err) {
    console.error("toggle unit active error", err);

    const message = err instanceof Error ? err.message : "Server error";

    const status =
      message === "Unit not found" || message === "Tier does not belong to property."
        ? 404
        : message === "Server error"
          ? 500
          : 400;

    return NextResponse.json({ error: message }, { status });
  }
}