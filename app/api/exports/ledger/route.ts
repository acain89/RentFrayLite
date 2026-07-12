import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatCentsToDollars } from "@/lib/billingConfig";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type CsvValue = string | number | null;
type CsvRow = Record<string, CsvValue>;

type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REVERSED";
type LedgerEntryType = "CHARGE" | "PAYMENT" | "CREDIT" | "ADJUSTMENT";

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

function fmtDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizePaymentStatus(value: unknown): PaymentStatus | null {
  const status = String(value ?? "").trim().toUpperCase();

  switch (status) {
    case "UNPAID":
    case "PENDING":
    case "PAID":
    case "FAILED":
    case "REVERSED":
      return status;
    default:
      return null;
  }
}

function normalizeLedgerEntryType(value: unknown): LedgerEntryType | null {
  const type = String(value ?? "").trim().toUpperCase();

  switch (type) {
    case "CHARGE":
    case "PAYMENT":
    case "CREDIT":
    case "ADJUSTMENT":
      return type;
    default:
      return null;
  }
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

function getSignedImpactCents(
  entryType: LedgerEntryType | null,
  amountCents: number,
  paymentStatus: PaymentStatus | null
): number {
  const absAmount = Math.abs(amountCents);

  if (entryType === "CHARGE") return absAmount;
  if (entryType === "CREDIT") return -absAmount;
  if (entryType === "ADJUSTMENT") return amountCents;

  if (entryType === "PAYMENT") {
    return paymentStatus === "PAID" ? -absAmount : 0;
  }

  return 0;
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
    const unitSearch = searchParams.get("unit");
    const requestedCycle =
  searchParams.get("month") ??
  searchParams.get("billingCycle") ??
  searchParams.get("cycle");

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


    const entries = await prisma.ledgerEntry.findMany({
      where: {
  propertyId: session.propertyId,

  ...(unitSearch
    ? {
        unit: {
          unitNumber: {
            contains: unitSearch,
            mode: "insensitive",
          },
        },
      }
    : {}),

  ...(billingCycle ? { billingCycle } : {}),

  voidedAt: null,
},
      orderBy: [
        { effectiveDate: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      include: {
        unit: {
          select: {
            unitNumber: true,
          },
        },
        property: {
          select: {
            name: true,
            propertyCode: true,
          },
        },
        tenantAssignment: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        payment: {
          select: {
            status: true,
            stripePaymentIntentId: true,
            stripeSessionId: true,
            paidAt: true,
            failedAt: true,
            reversedAt: true,
          },
        },
      },
    });

    type LedgerEntryWithRelations = (typeof entries)[number];

    const runningBalances = new Map<string, number>();

    const rows: CsvRow[] = entries.map((e: LedgerEntryWithRelations) => {
      const tenantName = `${e.tenantAssignment?.firstName ?? ""} ${
        e.tenantAssignment?.lastName ?? ""
      }`.trim();

      const entryType = normalizeLedgerEntryType(e.entryType);
      const paymentStatus = normalizePaymentStatus(e.payment?.status);

      const signedImpactCents = getSignedImpactCents(
        entryType,
        e.amountCents,
        paymentStatus
      );

      const runningBalanceCents =
  (runningBalances.get(e.unitId ?? "") ?? 0) + signedImpactCents;

runningBalances.set(e.unitId ?? "", runningBalanceCents);

      return {
        propertyName: e.property?.name ?? "",
        propertyCode: e.property?.propertyCode ?? "",
        billingCycle: e.billingCycle ?? "",
        unitNumber: e.unit?.unitNumber ?? "",
        tenantName: tenantName || "",
        entryType: e.entryType ?? "",
        chargeType: e.chargeType ?? "",
        paymentMethod: e.paymentMethod ?? "",
        amountCents: e.amountCents ?? 0,
        amount: formatCentsToDollars(e.amountCents ?? 0),
        signedImpactCents,
        signedImpact: formatCentsToDollars(signedImpactCents),
        runningBalanceCents,
        runningBalance: formatCentsToDollars(runningBalanceCents),
        paymentStatus: paymentStatus ?? "",
        effectiveDate: fmtDate(e.effectiveDate),
        createdAt: fmtDateTime(e.createdAt),
        memo: e.memo ?? "",
        referenceNumber: e.referenceNumber ?? "",
        transactionId: e.payment?.stripePaymentIntentId ?? "",
        checkoutSessionId: e.payment?.stripeSessionId ?? "",
        paidAt: fmtDateTime(e.payment?.paidAt),
        failedAt: fmtDateTime(e.payment?.failedAt),
        reversedAt: fmtDateTime(e.payment?.reversedAt),
      };
    });

    const cycleLabel = billingCycle ?? "all-cycles";
   const filename = unitSearch
  ? `ledger-export-${unitSearch}-${cycleLabel}.csv`
  : `ledger-export-${cycleLabel}.csv`;

    const csv = toCSV(rows);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error("Failed to export ledger", err);
    return NextResponse.json(
      { error: "Failed to export ledger" },
      { status: 500 }
    );
  }
}
