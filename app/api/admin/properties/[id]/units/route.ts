import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
  error: string;
};

type UnitPayload = {
  id: string;
  propertyId: string;
  tierId: string | null;
  unitNumber: string;
  unitType: string | null;
  baseRent: number | null;
  recurringFees: number;
  isActive: boolean;
};

function safeString(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toCents(value: unknown) {
  return Math.round(toNumber(value, 0) * 100);
}

/* =========================
   POST (CREATE UNIT)
========================= */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await context.params;

    if (!propertyId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Missing property id." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const tierId = safeString(body.tierId);
    const unitNumber = safeString(body.unitNumber).toUpperCase();
    const baseRentCents = toCents(body.baseRent);

    if (!tierId || !unitNumber) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Tier id and unit number are required." },
        { status: 400 }
      );
    }

    if (baseRentCents < 0) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Base rent must be 0 or greater." },
        { status: 400 }
      );
    }

    const created = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const tier = await tx.propertyTier.findFirst({
       where: { id: tierId, propertyId, isActive: true },
       select: { id: true, name: true, unitCount: true },
        });

        if (!tier) {
          throw new Error("Tier does not belong to property.");
        }

        const activeTierUnitCount = await tx.unit.count({
  where: {
    propertyId,
    tierId,
    isActive: true,
  },
});

if (activeTierUnitCount >= tier.unitCount) {
  throw new Error("Max number of units have been activated for this tier.");
}

        const duplicate = await tx.unit.findFirst({
          where: { propertyId, unitNumber },
          select: { id: true },
        });

        if (duplicate) {
          throw new Error("Duplicate unit number.");
        }

        const unit = await tx.unit.create({
          data: {
            propertyId,
            tierId,
            unitNumber,
            unitType: tier.name,
            baseRentCents,
            isActive: true,
          },
          select: {
            id: true,
            propertyId: true,
            tierId: true,
            unitNumber: true,
            unitType: true,
            baseRentCents: true,
            isActive: true,
          },
        });

        const count = await tx.unit.count({
  where: {
    propertyId,
    tierId,
    isActive: true,
  },
});

        await tx.propertyTier.update({
          where: { id: tierId },
          data: { activeUnitCount: count },
        });

        return unit;
      }
    );

   
    return NextResponse.json<ApiSuccess<UnitPayload>>({
      ok: true,
      data: {
        ...created,
        baseRent: created.baseRentCents
          ? created.baseRentCents / 100
          : null,
        recurringFees: 0,
      },
    });
  } catch (error) {
    console.error("POST unit failed", error);

    const message =
      error instanceof Error ? error.message : "Failed to create unit.";

    return NextResponse.json<ApiError>(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

/* =========================
   PATCH (UPDATE UNIT)
========================= */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await context.params;

    if (!propertyId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Missing property id." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const unitId = safeString(body.unitId);
    const unitNumber = safeString(body.unitNumber).toUpperCase();
    const baseRentCents = toCents(body.baseRent);

    if (!unitId || !unitNumber) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unit id and number required." },
        { status: 400 }
      );
    }

    if (baseRentCents < 0) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Base rent must be 0 or greater." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const existing = await tx.unit.findFirst({
          where: { id: unitId, propertyId },
          select: { id: true, tierId: true },
        });

        if (!existing) {
          throw new Error("Unit not found.");
        }

        const duplicate = await tx.unit.findFirst({
          where: {
            propertyId,
            unitNumber,
            NOT: { id: unitId },
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new Error("Duplicate unit number.");
        }

        return await tx.unit.update({
          where: { id: unitId },
          data: { unitNumber, baseRentCents },
          select: {
            id: true,
            propertyId: true,
            tierId: true,
            unitNumber: true,
            unitType: true,
            baseRentCents: true,
            isActive: true,
          },
        });
      }
    );

    return NextResponse.json<ApiSuccess<UnitPayload>>({
      ok: true,
      data: {
        ...updated,
        baseRent: updated.baseRentCents
          ? updated.baseRentCents / 100
          : null,
        recurringFees: 0,
      },
    });
  } catch (error) {
    console.error("PATCH unit failed", error);

    const message =
      error instanceof Error ? error.message : "Failed to update unit.";

    return NextResponse.json<ApiError>(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

/* =========================
   DELETE (REMOVE UNIT)
========================= */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await context.params;

    if (!propertyId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Missing property id." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const unitId = safeString(body.unitId);

    if (!unitId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unit id required." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const unit = await tx.unit.findFirst({
          where: { id: unitId, propertyId },
          select: {
            id: true,
            tierId: true,
            tenantAssignments: {
              where: {
                moveOutDate: null,
                isCurrent: true,
              },
              select: { id: true },
            },
          },
        });

        if (!unit) {
          throw new Error("Unit not found.");
        }

        if (unit.tenantAssignments.length > 0) {
          throw new Error("Unit has active tenant.");
        }

        await tx.unitRecurringFee.deleteMany({
          where: { unitId },
        });

        await tx.unit.delete({
          where: { id: unitId },
        });

        if (unit.tierId) {
         const count = await tx.unit.count({
  where: {
    propertyId,
    tierId: unit.tierId,
    isActive: true,
  },
});

          await tx.propertyTier.update({
            where: { id: unit.tierId },
            data: { activeUnitCount: count },
          });
        }

        return { unitId };
      }
    );

    return NextResponse.json<ApiSuccess<{ unitId: string }>>({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error("DELETE unit failed", error);

    const message =
      error instanceof Error ? error.message : "Failed to delete unit.";

    return NextResponse.json<ApiError>(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}