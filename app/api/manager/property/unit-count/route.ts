import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {

  validateUnitCapacityUpdate,
} from "@/lib/propertyCapacity";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type UpdateUnitCountBody = {
  unitCount?: unknown;
};

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();

    if (
      !session ||
      !session.propertyId ||
      (session.role !== "OWNER" && session.role !== "MANAGER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as UpdateUnitCountBody;
    const unitCount = toInt(body.unitCount);

    if (!Number.isInteger(unitCount) || unitCount < 1) {
      return NextResponse.json(
        { error: "Unit count must be a positive integer." },
        { status: 400 }
      );
    }

    const validation = await validateUnitCapacityUpdate(
      session.propertyId,
      unitCount
    );

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid unit count." },
        { status: 400 }
      );
    }

const updatedProperty = await prisma.property.update({
  where: { id: session.propertyId },
  data: {
    unitCount,
  },
      select: {
        id: true,
        unitCount: true,
      },
    });

    return NextResponse.json({
      ok: true,
      property: updatedProperty,
    });
  } catch (error: unknown) {
    console.error("PATCH /api/manager/property/unit-count failed", error);

    return NextResponse.json(
      { error: "Failed to update unit count." },
      { status: 500 }
    );
  }
}
