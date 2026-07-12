
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, refreshSessionCookie } from "@/lib/session";
import {
getProcessingFeeCents,
  formatCentsToDollars,
} from "@/lib/billingConfig";
import { canMakePayments } from "@/lib/liveGating";
import { getUnitFinancialState } from "@/lib/unitFinancialState";
import { shouldAutoSetPropertyReady } from "@/lib/propertyStatus";
import {
  getBusinessDate,
  getRentDateSummary,
  resolveEffectiveBillingSettings,
} from "@/lib/rentDates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REVERSED";

type StatementItem = {
  label: string;
  amount: number;
};

function buildTenantName(firstName: string | null, lastName: string | null) {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return fullName || "Tenant";
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

function centsToDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function buildStatementLabel(entry: {
  entryType: string;
  chargeType: string | null;
  memo: string | null;
}) {
  if (entry.memo && entry.memo.trim()) {
    return entry.memo.trim();
  }

  if (entry.entryType === "PAYMENT") return "Payment";
  if (entry.entryType === "CREDIT") return "Credit";
  if (entry.entryType === "ADJUSTMENT") return "Adjustment";

  switch (entry.chargeType) {
    case "RENT":
      return "Rent";
    case "LATE_FEE":
      return "Late Fee";
    case "RECURRING_FEE":
      return "Recurring Charge";
    case "PROCESSING_FEE":
      return "Processing Fee";
    case "OTHER_FEE":
      return "Other Charge";
    default:
      return "Charge";
  }
}

export async function POST() {
  try {
    const session = await getSession();

if (!session) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

await refreshSessionCookie(session);

    if (
      !session ||
      session.role !== "TENANT" ||
      !session.unitId ||
      !session.propertyId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: session.unitId,
        propertyId: session.propertyId,
      },
      include: {
        tier: {
          select: {
            rentDueDay: true,
            gracePeriodDays: true,
            lateFeeInitialCents: true,
            lateFeeDailyCents: true,
            maxLateFeeDays: true,
          },
        },
        property: {
          include: {
            settings: true,
            paymentStatus: true,
            units: true,
          },
        },
      },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    }

    const property = unit.property;
   
    // ✅ ADD THIS RIGHT HERE (immediately after Stripe sync)

if (
  shouldAutoSetPropertyReady({
    currentStatus: property.status,
    isActive: property.isActive,
    hasSettings: Boolean(property.settings),
    unitsCount: Array.isArray(property.units) ? property.units.length : 0,
    processorConnected: property.paymentStatus?.processorConnected,
    chargesEnabled: property.paymentStatus?.chargesEnabled,
    payoutsEnabled: property.paymentStatus?.payoutsEnabled,
  })
) {
  await prisma.property.update({
    where: { id: property.id },
    data: { status: "READY" },
  });

  property.status = "READY";
}


 const currentAssignment = await prisma.tenantAssignment.findFirst({
      where: {
        propertyId: session.propertyId,
        unitId: unit.id,
        isCurrent: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

    const currentAssignmentId = currentAssignment?.id ?? null;

   const financialState = await getUnitFinancialState({
  propertyId: session.propertyId,
  unitId: unit.id,
  tenantAssignmentId: currentAssignmentId,
  tier: unit.tier,
  propertySettings: property.settings,
  billingCycleStartDate: property.billingCycleStartDate,
});

const ledgerSummary = financialState.ledgerSummary;
const balanceCents = financialState.ledgerBalanceCents;
const processingFeeCents = financialState.processingFeeCents;
const totalDueCents = financialState.tenantTotalDueCents;
const rentDates = financialState.rentDates;

console.log("TENANT_RENT_DATE_DEBUG", {
  unitNumber: unit.unitNumber,
  tier: unit.tier,
  propertySettings: property.settings,
  effectiveBillingSettings: financialState.effectiveBillingSettings,
  rentDates,
});

const billingCycle = financialState.billingCycle;
const isDelinquent = financialState.isDelinquent;
const unitStatus = financialState.status;

  const paymentEnabled =
  canMakePayments({
    status: property.status,
    settings: property.settings,
    units: property.units,
    paymentStatus: property.paymentStatus,
    isActive: property.isActive,
  }) && unitStatus.canAttemptPayment;


    const tenantPayments = await prisma.payment.findMany({
  where: {
    propertyId: session.propertyId,
    unitId: session.unitId,
    tenantAssignmentId: currentAssignmentId,
  },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        amountCents: true,
        processingFeeCents: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        paidAt: true,
        failedAt: true,
        reversedAt: true,
        stripePaymentIntentId: true,
        stripeSessionId: true,
      },
    });

    const latestPayment = tenantPayments[0] ?? null;

       const businessDate = getBusinessDate();
       const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: {
       propertyId: session.propertyId,
       unitId: session.unitId,
       ...(currentAssignmentId
      ? {
          OR: [
            { tenantAssignmentId: currentAssignmentId },
            { tenantAssignmentId: null },
          ],
        }
      : {}),

       voidedAt: null,
       effectiveDate: {
       lte: businessDate,
        },
      },
      orderBy: [
        { effectiveDate: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: {
        id: true,
        entryType: true,
        chargeType: true,
        billingCycle: true,
        amountCents: true,
        effectiveDate: true,
        memo: true,
        referenceNumber: true,
        payment: {
          select: {
            status: true,
            paidAt: true,
            failedAt: true,
            reversedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const filteredLedgerEntries = ledgerEntries.filter(
      (entry: (typeof ledgerEntries)[number]) => {
        if (entry.entryType !== "PAYMENT") return true;
        const status = normalizePaymentStatus(entry.payment?.status);
return status === "PAID" || status === "PENDING" || status === "REVERSED";
      }
    );

    const statementSourceEntries = filteredLedgerEntries.filter(
  (entry: (typeof filteredLedgerEntries)[number]) =>
    entry.billingCycle === billingCycle
);

    let rentCents = 0;
    let recurringChargesCents = 0;
    let lateFeesCents = 0;
    let creditsCents = 0;

    const statementItems: StatementItem[] = statementSourceEntries.map(
      (entry: (typeof statementSourceEntries)[number]) => {
        const isCreditLike =
          entry.entryType === "PAYMENT" ||
          entry.entryType === "CREDIT" ||
          entry.entryType === "ADJUSTMENT";

       if (entry.entryType === "CHARGE") {
  if (entry.chargeType === "RENT") {
    rentCents += entry.amountCents;
  } else if (
    entry.chargeType === "LATE_FEE" ||
    entry.chargeType === "LATE_FEE_INITIAL" ||
    entry.chargeType === "LATE_FEE_DAILY"
  ) {
    lateFeesCents += entry.amountCents;
  } else {
    recurringChargesCents += entry.amountCents;
  }
} else if (isCreditLike) {
  creditsCents += Math.abs(entry.amountCents);
}

        return {
          label: buildStatementLabel(entry),
          amount: centsToDollars(
            isCreditLike ? -Math.abs(entry.amountCents) : entry.amountCents
          ),
        };
      }
    );

       const hasLedgerProcessingFee = statementSourceEntries.some(
      (entry: (typeof statementSourceEntries)[number]) =>
        entry.entryType === "CHARGE" &&
        String(entry.chargeType ?? "").toUpperCase() === "PROCESSING_FEE"
    );

    const displayProcessingFeeCents = hasLedgerProcessingFee
      ? 0
      : processingFeeCents;

    const subtotalCents = rentCents + recurringChargesCents + lateFeesCents;

    return NextResponse.json({
      ok: true,

      tenantName: buildTenantName(
        unit.portalFirstName ?? null,
        unit.portalLastName ?? null
      ),

      propertyName: property.name,
      propertyStatus: property.status,
      paymentEnabled,

      unitNumber: unit.unitNumber,
      unitId: unit.id,
      billingCycle,

      balanceCents,
      processingFeeCents,
      totalDueCents,

      hasPendingPayment: financialState.hasPendingPayment,
pendingPaymentAmountCents: financialState.hasPendingPayment
  ? totalDueCents
  : 0,
pendingPaymentAmount: financialState.hasPendingPayment
  ? totalDueCents / 100
  : 0,

      balance: balanceCents / 100,
      processingFee: formatCentsToDollars(processingFeeCents),
      totalDue: formatCentsToDollars(totalDueCents),

      totalPaidCents: ledgerSummary.totalPaidCents,
      totalPaid: ledgerSummary.totalPaidCents / 100,
      isDelinquent,

      statement: {
        rent: centsToDollars(rentCents),
        recurringCharges: centsToDollars(recurringChargesCents),
        lateFees: centsToDollars(lateFeesCents),
        processingFee: centsToDollars(displayProcessingFeeCents),
        credits: centsToDollars(creditsCents),
        subtotal: centsToDollars(subtotalCents),
        totalDue: centsToDollars(totalDueCents),
        items: statementItems,
      },

      paymentStatus: unitStatus.paymentStatus,
      displayStatus: unitStatus.status,
      statusColor: unitStatus.color,
      statusLabel: unitStatus.label,
      
paymentMessage: unitStatus.tenantMessage,
     latestPaymentTimestamp:
     latestPayment?.paidAt?.toISOString() ??
     latestPayment?.failedAt?.toISOString() ??
     latestPayment?.reversedAt?.toISOString() ??
     latestPayment?.createdAt?.toISOString() ??
     null,


        paymentHistory: tenantPayments.map(
  (payment: (typeof tenantPayments)[number]) => ({
    id: payment.id,

    amountCents: payment.amountCents,
    processingFeeCents: payment.processingFeeCents ?? 0,

    totalChargedCents:
      payment.amountCents +
      (payment.processingFeeCents ?? 0),

    amount: centsToDollars(payment.amountCents),

    processingFee: centsToDollars(
      payment.processingFeeCents ?? 0
    ),

    totalCharged: centsToDollars(
      payment.amountCents +
      (payment.processingFeeCents ?? 0)
    ),

    status:
      normalizePaymentStatus(payment.status) ??
      "UNPAID",

    timestamp:
      payment.paidAt?.toISOString() ??
      payment.failedAt?.toISOString() ??
      payment.reversedAt?.toISOString() ??
      payment.createdAt.toISOString(),

    message:
      normalizePaymentStatus(payment.status) === "PENDING"
        ? "Processing"
        : normalizePaymentStatus(payment.status) === "PAID"
        ? "Payment successful"
        : normalizePaymentStatus(payment.status) === "FAILED"
        ? "Payment failed"
        : normalizePaymentStatus(payment.status) === "REVERSED"
        ? "Payment reversed"
        : "Payment required",

    stripePaymentIntentId:
      payment.stripePaymentIntentId,

    stripeSessionId:
      payment.stripeSessionId,
  })
),

      dueDate: rentDates.dueDate,
      graceEndsOn: rentDates.graceEndsOn,
      initialLateFeeDate: rentDates.initialLateFeeDate,
      dailyLateFeeStartDate: rentDates.dailyLateFeeStartDate,
      dailyLateFeeLastDate: rentDates.dailyLateFeeLastDate,

      ledger: filteredLedgerEntries.map(
        (entry: (typeof filteredLedgerEntries)[number]) => ({
          id: entry.id,
          type: entry.entryType,
          chargeType: entry.chargeType ?? null,
          billingCycle: entry.billingCycle ?? null,
          amountCents: entry.amountCents,
          amount: formatCentsToDollars(entry.amountCents),
          effectiveDate: entry.effectiveDate.toISOString(),
          memo: entry.memo ?? null,
          referenceNumber: entry.referenceNumber ?? null,
        })
      ),
    });
  } catch (error) {
    console.error("POST /api/tenant/dashboard failed", error);

    return NextResponse.json(
      { error: "Failed to load dashboard." },
      { status: 500 }
    );
  }
}

