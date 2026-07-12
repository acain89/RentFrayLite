import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getRentDateSummary,
  resolveEffectiveBillingSettings,
} from "@/lib/rentDates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type LoadTestUnit = Prisma.UnitGetPayload<{
  select: {
    id: true;
    unitNumber: true;
    tier: true;
    tenantAssignments: {
      where: {
        isCurrent: true;
        moveOutDate: null;
      };
      take: 1;
      orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }];
    };
  };
}>;

type LoadTestPayment = {
  id: string;
  unitId: string;
  status: string;
  billingCycle: string | null;
};

type LoadTestLedgerEntry = {
  id: string;
  unitId: string;
  entryType: string;
  chargeType: string | null;
  amountCents: number;
  billingCycle: string | null;
};

type TimingMap = Record<string, number>;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function nowMs(): number {
  return performance.now();
}

function elapsedMs(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

function getNextCycleKey(cycleKey: string): string {
  const [yearRaw, monthRaw] = cycleKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return cycleKey;
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
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

    const unitsStart = nowMs();

    const units: LoadTestUnit[] = await prisma.unit.findMany({
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
        tier: true,
        tenantAssignments: {
          where: {
            isCurrent: true,
            moveOutDate: null,
          },
          take: 1,
          orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    timings.unitsQueryMs = elapsedMs(unitsStart);

    const rentDatesStart = nowMs();

    const now = new Date();
    const anchorUnit = units[0] ?? null;

    const effective = resolveEffectiveBillingSettings({
      tier: anchorUnit?.tier ?? null,
      propertySettings: property.settings,
    });

    const rentDates = getRentDateSummary({
      ...effective,
      now,
      billingCycleStartDate: property.billingCycleStartDate,
    });

    const currentBillingCycle = rentDates.billingCycle;
    const nextBillingCycle = getNextCycleKey(currentBillingCycle);

    timings.rentDatesMs = elapsedMs(rentDatesStart);

    const unitIds = units.map((unit) => unit.id);

    const paymentsStart = nowMs();

    const payments: LoadTestPayment[] = await prisma.payment.findMany({
      where: {
        propertyId: property.id,
        unitId: {
          in: unitIds,
        },
      },
      select: {
        id: true,
        unitId: true,
        status: true,
        billingCycle: true,
      },
    });

    timings.paymentsQueryMs = elapsedMs(paymentsStart);

    const ledgerStart = nowMs();

    const ledgerEntries: LoadTestLedgerEntry[] =
      await prisma.ledgerEntry.findMany({
        where: {
          propertyId: property.id,
          unitId: {
            in: unitIds,
          },
          voidedAt: null,
        },
        select: {
          id: true,
          unitId: true,
          entryType: true,
          chargeType: true,
          amountCents: true,
          billingCycle: true,
        },
      });

    timings.ledgerQueryMs = elapsedMs(ledgerStart);

    const nextCycleStart = nowMs();

    const nextCycleEntries: LoadTestLedgerEntry[] =
      await prisma.ledgerEntry.findMany({
        where: {
          propertyId: property.id,
          unitId: {
            in: unitIds,
          },
          billingCycle: nextBillingCycle,
          entryType: {
            in: ["CHARGE", "CREDIT"],
          },
          voidedAt: null,
        },
        select: {
          id: true,
          unitId: true,
          entryType: true,
          chargeType: true,
          amountCents: true,
          billingCycle: true,
        },
      });

    timings.nextCycleQueryMs = elapsedMs(nextCycleStart);

    const groupingStart = nowMs();

    const paymentsByUnit = new Map<string, number>();
    const ledgerByUnit = new Map<string, number>();

    for (const payment of payments) {
      paymentsByUnit.set(
        payment.unitId,
        (paymentsByUnit.get(payment.unitId) ?? 0) + 1
      );
    }

    for (const entry of ledgerEntries) {
      ledgerByUnit.set(
        entry.unitId,
        (ledgerByUnit.get(entry.unitId) ?? 0) + 1
      );
    }

    const resolvedUnits = units.map((unit) => ({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      currentTenantAssignments: unit.tenantAssignments.length,
      payments: paymentsByUnit.get(unit.id) ?? 0,
      ledgerEntries: ledgerByUnit.get(unit.id) ?? 0,
    }));

    timings.groupingMs = elapsedMs(groupingStart);
    timings.totalMs = elapsedMs(routeStart);

    return NextResponse.json({
      ok: true,
      propertyId: property.id,
      propertyCode: property.propertyCode,
      currentBillingCycle,
      nextBillingCycle,
      counts: {
        units: units.length,
        payments: payments.length,
        ledgerEntries: ledgerEntries.length,
        nextCycleEntries: nextCycleEntries.length,
        resolvedUnits: resolvedUnits.length,
      },
      timings,
    });
  } catch (error) {
    console.error("load-test-route error", error);

    return NextResponse.json(
      {
        error: "Server error",
        timings: {
          ...timings,
          totalMs: elapsedMs(routeStart),
        },
      },
      {
        status: 500,
      }
    );
  }
}