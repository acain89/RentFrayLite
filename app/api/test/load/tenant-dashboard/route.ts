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

type LoadTestTenantUnit = Prisma.UnitGetPayload<{
  select: {
    id: true;
    unitNumber: true;
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

type LoadTestPayment = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
  status: string;
  billingCycle: string | null;
  amountCents: number;
};

type LoadTestLedgerEntry = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
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

function resolveBalanceCents(entries: LoadTestLedgerEntry[]): number {
  return entries.reduce((total, entry) => {
    if (entry.entryType === "CHARGE") {
      return total + entry.amountCents;
    }

    if (entry.entryType === "CREDIT" || entry.entryType === "PAYMENT") {
      return total - Math.abs(entry.amountCents);
    }

    return total;
  }, 0);
}

function resolveTenantStatus(input: {
  balanceCents: number;
  payments: LoadTestPayment[];
}): "PAID" | "PENDING" | "FAILED" | "UNPAID" {
  const statuses = input.payments.map((payment) => payment.status);

  if (statuses.includes("PENDING")) {
    return "PENDING";
  }

  if (input.balanceCents <= 0) {
    return "PAID";
  }

  if (statuses.includes("FAILED")) {
    return "FAILED";
  }

  return "UNPAID";
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

    const units: LoadTestTenantUnit[] = await prisma.unit.findMany({
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

    const rentDatesStart = nowMs();

    const now = new Date();
  const effective = resolveEffectiveBillingSettings({
  tier: null,
  propertySettings: property.settings,
});

    const rentDates = getRentDateSummary({
      ...effective,
      now,
      billingCycleStartDate: property.billingCycleStartDate,
    });

    const currentBillingCycle = rentDates.billingCycle;

    timings.rentDatesMs = elapsedMs(rentDatesStart);

    const unitIds = units.map((unit) => unit.id);
    const tenantAssignmentIds = units
      .map((unit) => unit.tenantAssignments[0]?.id)
      .filter((id): id is string => Boolean(id));

    const paymentsStart = nowMs();

    const payments: LoadTestPayment[] = await prisma.payment.findMany({
      where: {
        propertyId: property.id,
        unitId: {
          in: unitIds,
        },
        tenantAssignmentId: {
          in: tenantAssignmentIds,
        },
      },
      select: {
        id: true,
        unitId: true,
        tenantAssignmentId: true,
        status: true,
        billingCycle: true,
        amountCents: true,
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
          tenantAssignmentId: {
            in: tenantAssignmentIds,
          },
          voidedAt: null,
        },
        select: {
          id: true,
          unitId: true,
          tenantAssignmentId: true,
          entryType: true,
          chargeType: true,
          amountCents: true,
          billingCycle: true,
        },
      });

    timings.ledgerQueryMs = elapsedMs(ledgerStart);

    const groupingStart = nowMs();

    const paymentsByUnit = new Map<string, LoadTestPayment[]>();
    const ledgerByUnit = new Map<string, LoadTestLedgerEntry[]>();

    for (const payment of payments) {
      const current = paymentsByUnit.get(payment.unitId) ?? [];
      current.push(payment);
      paymentsByUnit.set(payment.unitId, current);
    }

    for (const entry of ledgerEntries) {
      const current = ledgerByUnit.get(entry.unitId) ?? [];
      current.push(entry);
      ledgerByUnit.set(entry.unitId, current);
    }

    const resolvedTenants = units.map((unit) => {
      const unitPayments = paymentsByUnit.get(unit.id) ?? [];
      const unitLedgerEntries = ledgerByUnit.get(unit.id) ?? [];
      const balanceCents = resolveBalanceCents(unitLedgerEntries);

      return {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        tenantAssignmentId: unit.tenantAssignments[0]?.id ?? null,
        balanceCents,
        status: resolveTenantStatus({
          balanceCents,
          payments: unitPayments,
        }),
        payments: unitPayments.length,
        ledgerEntries: unitLedgerEntries.length,
      };
    });

    const statusCounts = resolvedTenants.reduce<Record<string, number>>(
      (counts, tenant) => {
        counts[tenant.status] = (counts[tenant.status] ?? 0) + 1;
        return counts;
      },
      {}
    );

    timings.groupingMs = elapsedMs(groupingStart);
    timings.totalMs = elapsedMs(routeStart);

    return NextResponse.json({
      ok: true,
      propertyId: property.id,
      propertyCode: property.propertyCode,
      currentBillingCycle,
      counts: {
        units: units.length,
        tenantAssignments: tenantAssignmentIds.length,
        payments: payments.length,
        ledgerEntries: ledgerEntries.length,
        resolvedTenants: resolvedTenants.length,
        statusCounts,
      },
      timings,
    });
  } catch (error) {
    console.error("tenant-load-test-route error", error);

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