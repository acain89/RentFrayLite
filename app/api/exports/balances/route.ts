import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getUnitLedgerSummary } from "@/lib/ledger";
import { getUnitDelinquencySummary } from "@/lib/delinquency";
import { formatCentsToDollars } from "@/lib/billingConfig";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type CsvValue = string | number | null;
type CsvRow = Record<string, CsvValue>;

function toCSV(rows: CsvRow[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);

  const escape = (value: CsvValue): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.join(",");
  const lines = rows.map((row) =>
    headers.map((h) => escape(row[h] ?? null)).join(",")
  );

  return [headerLine, ...lines].join("\n");
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toISOString().split("T")[0] ?? "";
}

function parseBillingCycleInput(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{2}\/\d{4}$/.test(trimmed)) {
    const [month, year] = trimmed.split("/");
    return `${year}-${month}`;
  }

  return null;
}

export async function GET(req: Request) {
  try {
    const session = await getSession();

    if (
      !session ||
      (session.role !== "OWNER" &&
        session.role !== "MANAGER" &&
        session.role !== "STAFF") ||
      !session.propertyId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedPropertyId = searchParams.get("propertyId");
    const requestedCycle =
      searchParams.get("billingCycle") ?? searchParams.get("cycle");

    if (requestedPropertyId && requestedPropertyId !== session.propertyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const billingCycle = parseBillingCycleInput(requestedCycle);

    if (requestedCycle && !billingCycle) {
      return NextResponse.json(
        { error: "Invalid billingCycle. Use YYYY-MM or MM/YYYY." },
        { status: 400 }
      );
    }

    const units = await prisma.unit.findMany({
      where: {
  propertyId: session.propertyId,
  isActive: true,
       },
      orderBy: { unitNumber: "asc" },
      include: {
        property: {
          select: {
            name: true,
            propertyCode: true,
          },
        },
        tier: {
          select: {
            name: true,
            baseRentCents: true,
          },
        },
        tenantAssignments: {
          where: {
            isCurrent: true,
            moveOutDate: null,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            moveInDate: true,
          },
        },
      },
    });

    type UnitWithRelations = (typeof units)[number];

    const rows: CsvRow[] = await Promise.all(
      units.map(async (unit: UnitWithRelations) => {
        const currentAssignment = unit.tenantAssignments?.[0] ?? null;

        const cycleEntries = billingCycle
  ? await prisma.ledgerEntry.findMany({
      where: {
        propertyId: session.propertyId,
        unitId: unit.id,
        tenantAssignmentId: currentAssignment?.id ?? undefined,
        billingCycle,
        voidedAt: null,
      },
    })
  : [];

        const summary = await getUnitLedgerSummary(
  unit.id,
  currentAssignment?.id
);

let cycleChargesCents = summary.totalChargesCents;
let cyclePaidCents = summary.totalPaidCents;
let cycleBalanceCents = summary.balanceCents;

if (billingCycle) {
  cycleChargesCents = 0;
  cyclePaidCents = 0;
  cycleBalanceCents = 0;

  for (const entry of cycleEntries) {
    if (entry.entryType === "CHARGE") {
      cycleChargesCents += entry.amountCents;
      cycleBalanceCents += entry.amountCents;
    }

    if (
      entry.entryType === "PAYMENT" &&
      entry.payment &&
      entry.payment.status === "PAID"
    ) {
      cyclePaidCents += Math.abs(entry.amountCents);
      cycleBalanceCents -= Math.abs(entry.amountCents);
    }

    if (entry.entryType === "CREDIT") {
      cycleBalanceCents -= Math.abs(entry.amountCents);
    }
  }
}

        const delinquency = await getUnitDelinquencySummary(unit.id);

        const tenantName = `${currentAssignment?.firstName ?? ""} ${
          currentAssignment?.lastName ?? ""
        }`.trim();

        const occupancyStatus = currentAssignment ? "OCCUPIED" : "VACANT";
        const marketRentCents = unit.tier?.baseRentCents ?? 0;

        return {
          propertyName: unit.property?.name ?? "",
          propertyCode: unit.property?.propertyCode ?? "",
          billingCycle: billingCycle ?? "",
          unitNumber: unit.unitNumber ?? "",
          tenantName: tenantName || "",
          occupancyStatus,
          tierName: unit.tier?.name ?? "",
          marketRentCents,
          marketRent: formatCentsToDollars(marketRentCents),
          currentBalanceCents: cycleBalanceCents,
          currentBalance: formatCentsToDollars(cycleBalanceCents),
          totalChargesCents: cycleChargesCents,
          totalCharges: formatCentsToDollars(cycleChargesCents),
          totalPaidCents: cyclePaidCents,
          totalPaid: formatCentsToDollars(cyclePaidCents),
          lastPaymentDate: fmtDate(summary.lastPaymentDate),
          lastPaymentAmountCents: summary.lastPaymentAmountCents ?? 0,
          lastPaymentAmount:
            summary.lastPaymentAmountCents === null
              ? ""
              : formatCentsToDollars(summary.lastPaymentAmountCents),
          amountDueNowCents: delinquency.amountDueNowCents ?? 0,
          amountDueNow: formatCentsToDollars(
            delinquency.amountDueNowCents ?? 0
          ),
          dueDate: fmtDate(delinquency.dueDate),
          graceEndsOn: fmtDate(delinquency.graceEndsOn),
          isDelinquent: delinquency.isDelinquent ? "YES" : "NO",
          daysPastDue: Number(delinquency.daysPastDue ?? 0),
          moveInDate: fmtDate(currentAssignment?.moveInDate),
        };
      })
    );

    const cycleLabel = billingCycle ?? "all-cycles";
    const csv = toCSV(rows);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=balances-export-${cycleLabel}.csv`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error("Failed to export balances", err);
    return NextResponse.json(
      { error: "Failed to export balances" },
      { status: 500 }
    );
  }
}
