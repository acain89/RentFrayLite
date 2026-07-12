import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TimingMap = Record<string, number>;

type LoadTestCronUnit = Prisma.UnitGetPayload<{
  select: {
    id: true;
    unitNumber: true;
    baseRentCents: true;
    tier: {
      select: {
        id: true;
        baseRentCents: true;
        isActive: true;
      };
    };
    tenantAssignments: {
      select: {
        id: true;
      };
      where: {
        isCurrent: true;
        moveOutDate: null;
      };
      take: 1;
      orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }];
    };
  };
}>;

type ExistingRentCharge = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
  amountCents: number;
};

type PlannedCharge = {
  unitId: string;
  unitNumber: string;
  tenantAssignmentId: string;
  rentCents: number;
  alreadyPosted: boolean;
  shouldPost: boolean;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function nowMs(): number {
  return performance.now();
}

function elapsedMs(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

function getCurrentCycleKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const routeStart = nowMs();
  const timings: TimingMap = {};

  try {
    const authStart = nowMs();

    const auth = req.headers.get("authorization");

    if (!auth?.startsWith("Bearer ")) {
      return unauthorized();
    }

    const token = auth.replace("Bearer ", "").trim();

    if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
      return unauthorized();
    }

    timings.authMs = elapsedMs(authStart);

    const propertyStart = nowMs();

    const property = await prisma.property.findUnique({
      where: {
        propertyCode: "9200",
      },
      select: {
        id: true,
        propertyCode: true,
        billingCycleStartDate: true,
        settings: true,
      },
    });

    timings.propertyLookupMs = elapsedMs(propertyStart);

    if (!property) {
      return NextResponse.json(
        {
          error: "Scale test property not found",
          timings: {
            ...timings,
            totalMs: elapsedMs(routeStart),
          },
        },
        { status: 404 }
      );
    }

    const cycleKey = getCurrentCycleKey();

    const unitsStart = nowMs();

    const units: LoadTestCronUnit[] = await prisma.unit.findMany({
      where: {
        propertyId: property.id,
        isActive: true,
      },
      orderBy: {
        unitNumber: "asc",
      },
      select: {
        id: true,
        unitNumber: true,
        baseRentCents: true,
        tier: {
          select: {
            id: true,
            baseRentCents: true,
            isActive: true,
          },
        },
        tenantAssignments: {
          where: {
            isCurrent: true,
            moveOutDate: null,
          },
          take: 1,
          orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
          },
        },
      },
    });

    timings.unitsQueryMs = elapsedMs(unitsStart);

    const unitIds = units.map((unit: LoadTestCronUnit) => unit.id);

    const existingChargesStart = nowMs();

    const existingRentCharges: ExistingRentCharge[] =
      await prisma.ledgerEntry.findMany({
        where: {
          propertyId: property.id,
          unitId: {
            in: unitIds,
          },
          billingCycle: cycleKey,
          entryType: "CHARGE",
          chargeType: "RENT",
          voidedAt: null,
        },
        select: {
          id: true,
          unitId: true,
          tenantAssignmentId: true,
          amountCents: true,
        },
      });

    timings.existingChargesQueryMs = elapsedMs(existingChargesStart);

    const planningStart = nowMs();

    const existingByUnitId = new Set<string>(
      existingRentCharges.map((charge: ExistingRentCharge) => charge.unitId)
    );

    const plannedCharges: PlannedCharge[] = units
      .map((unit: LoadTestCronUnit): PlannedCharge | null => {
        const tenantAssignmentId = unit.tenantAssignments[0]?.id ?? null;
        const rentCents = unit.baseRentCents ?? unit.tier?.baseRentCents ?? 0;
        const alreadyPosted = existingByUnitId.has(unit.id);

        if (!tenantAssignmentId) {
          return null;
        }

        return {
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          tenantAssignmentId,
          rentCents,
          alreadyPosted,
          shouldPost: rentCents > 0 && !alreadyPosted,
        };
      })
      .filter((planned): planned is PlannedCharge => {
        return Boolean(planned?.shouldPost);
      });

    const totalPlannedCents = plannedCharges.reduce(
      (total: number, charge: PlannedCharge) => total + charge.rentCents,
      0
    );

    timings.planningMs = elapsedMs(planningStart);
    timings.totalMs = elapsedMs(routeStart);

    return NextResponse.json({
      ok: true,
      mode: "DRY_RUN_NO_WRITES",
      propertyId: property.id,
      propertyCode: property.propertyCode,
      billingCycle: cycleKey,
      counts: {
        activeUnits: units.length,
        existingRentCharges: existingRentCharges.length,
        plannedRentCharges: plannedCharges.length,
      },
      totals: {
        totalPlannedCents,
        totalPlannedDollars: totalPlannedCents / 100,
      },
      timings,
    });
  } catch (error) {
    console.error("monthly-rent-cron-load-test error", error);

    return NextResponse.json(
      {
        error: "Server error",
        timings: {
          ...timings,
          totalMs: elapsedMs(routeStart),
        },
      },
      { status: 500 }
    );
  }
}