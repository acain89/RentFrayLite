import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TimingMap = Record<string, number>;

type PreflightUnit = Prisma.UnitGetPayload<{
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

type PreflightPayment = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
  status: string;
};

type PreflightLedgerEntry = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
  entryType: string;
  amountCents: number;
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

function resolveBalanceCents(entries: PreflightLedgerEntry[]): number {
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

    const units: PreflightUnit[] = await prisma.unit.findMany({
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

    const unitIds = units.map((unit: PreflightUnit) => unit.id);

    const tenantAssignmentIds = units
      .map((unit: PreflightUnit) => unit.tenantAssignments[0]?.id)
      .filter((id): id is string => Boolean(id));

    const paymentsStart = nowMs();

    const payments: PreflightPayment[] = await prisma.payment.findMany({
      where: {
        propertyId: property.id,
        unitId: {
          in: unitIds,
        },
        tenantAssignmentId: {
          in: tenantAssignmentIds,
        },
        status: {
          in: ["PENDING", "PAID"],
        },
      },
      select: {
        id: true,
        unitId: true,
        tenantAssignmentId: true,
        status: true,
      },
    });

    timings.paymentsQueryMs = elapsedMs(paymentsStart);

    const ledgerStart = nowMs();

    const ledgerEntries: PreflightLedgerEntry[] =
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
          amountCents: true,
        },
      });

    timings.ledgerQueryMs = elapsedMs(ledgerStart);

    const planningStart = nowMs();

    const paymentsByUnit = new Map<string, PreflightPayment[]>();
    const ledgerByUnit = new Map<string, PreflightLedgerEntry[]>();

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

    let eligible = 0;
    let blockedPending = 0;
    let blockedPaid = 0;
    let blockedNoTenant = 0;
    let blockedNoBalance = 0;

    for (const unit of units) {
      const tenantAssignmentId = unit.tenantAssignments[0]?.id ?? null;

      if (!tenantAssignmentId) {
        blockedNoTenant += 1;
        continue;
      }

      const unitPayments = paymentsByUnit.get(unit.id) ?? [];
      const hasPending = unitPayments.some(
        (payment) => payment.status === "PENDING"
      );
      const hasPaid = unitPayments.some((payment) => payment.status === "PAID");

      if (hasPending) {
        blockedPending += 1;
        continue;
      }

      if (hasPaid) {
        blockedPaid += 1;
        continue;
      }

      const balanceCents = resolveBalanceCents(ledgerByUnit.get(unit.id) ?? []);

      if (balanceCents <= 0) {
        blockedNoBalance += 1;
        continue;
      }

      eligible += 1;
    }

    timings.planningMs = elapsedMs(planningStart);
    timings.totalMs = elapsedMs(routeStart);

    return NextResponse.json({
      ok: true,
      mode: "DRY_RUN_NO_STRIPE_NO_WRITES",
      propertyId: property.id,
      propertyCode: property.propertyCode,
      counts: {
        units: units.length,
        tenantAssignments: tenantAssignmentIds.length,
        existingBlockingPayments: payments.length,
        ledgerEntries: ledgerEntries.length,
        eligible,
        blockedPending,
        blockedPaid,
        blockedNoTenant,
        blockedNoBalance,
      },
      timings,
    });
  } catch (error) {
    console.error("payment-session-preflight-load-test error", error);

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