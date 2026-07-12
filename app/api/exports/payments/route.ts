// app/api/exports/payments/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatCentsToDollars } from "@/lib/billingConfig";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type CsvValue = string | number | null;
type CsvRow = Record<string, CsvValue>;

type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REVERSED";

function toCSV(rows: CsvRow[]): string {
  if (!rows.length) return "";

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
    const requestedStatus = searchParams.get("status");
const unitSearch = searchParams.get("unit");
const requestedCycle =
  searchParams.get("month") ??
  searchParams.get("billingCycle") ??
  searchParams.get("cycle");

    const propertyId = session.propertyId;

    if (requestedPropertyId && requestedPropertyId !== propertyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedStatus = requestedStatus
      ? normalizePaymentStatus(requestedStatus)
      : null;

    if (requestedStatus && !normalizedStatus) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const billingCycle = parseBillingCycleInput(requestedCycle);

    if (requestedCycle && !billingCycle) {
      return NextResponse.json(
        { error: "Invalid billingCycle. Use YYYY-MM or MM/YYYY." },
        { status: 400 }
      );
    }

    const payments = await prisma.payment.findMany({
      where: {
  propertyId,
  ...(normalizedStatus ? { status: normalizedStatus } : {}),
  ...(billingCycle ? { billingCycle } : {}),
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
},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        unit: {
          select: {
            unitNumber: true,
          },
        },
        tenantAssignment: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    type PaymentWithRelations = (typeof payments)[number];

    const rows: CsvRow[] = payments.map((p: PaymentWithRelations) => {
      const feeCents = p.processingFeeCents ?? 0;
      const totalChargedCents = (p.amountCents ?? 0) + feeCents;
       const normalizedStatus = normalizePaymentStatus(p.status);

const settledTotalCents =
  normalizedStatus === "PAID" ? totalChargedCents : 0;

      const tenantName = `${p.tenantAssignment?.firstName ?? ""} ${
        p.tenantAssignment?.lastName ?? ""
      }`.trim();

      const paymentDate =
        p.paidAt ?? p.failedAt ?? p.reversedAt ?? p.createdAt;

      return {
        billingCycle: p.billingCycle ?? "",
        unitNumber: p.unit?.unitNumber ?? "",
        tenantName: tenantName || "",
        amountDueCents: p.amountCents ?? 0,
        amountDue: formatCentsToDollars(p.amountCents ?? 0),
        feeCents,
        fee: formatCentsToDollars(feeCents),
        totalPaidCents: settledTotalCents,
        totalPaid: formatCentsToDollars(settledTotalCents),
        status: p.status ?? "",
        paymentDate: fmtDate(paymentDate),
        paymentTimestamp: fmtDateTime(paymentDate),
        transactionId: p.stripePaymentIntentId ?? "",
        checkoutSessionId: p.stripeSessionId ?? "",
        createdAt: fmtDateTime(p.createdAt),
        updatedAt: fmtDateTime(p.updatedAt),
      };
    });

    const cycleLabel = billingCycle ?? "all-cycles";
    const filename = unitSearch
  ? `payments-export-${unitSearch}-${cycleLabel}.csv`
  : `payments-export-${cycleLabel}.csv`;
    const csv = toCSV(rows);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error("payments export failed", err);

    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}
