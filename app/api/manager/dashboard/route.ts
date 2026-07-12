import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getSession, refreshSessionCookie } from "@/lib/session";
import {
  getBusinessDate,
  getRentDateSummary,
  resolveEffectiveBillingSettings,
} from "@/lib/rentDates";

import { formatCentsToDollars } from "@/lib/billingConfig";
import { shouldAutoSetPropertyReady } from "@/lib/propertyStatus";
import { getUnitStatus } from "@/lib/unitStatusEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REVERSED";
type LedgerEntryType = "CHARGE" | "PAYMENT" | "CREDIT" | "ADJUSTMENT";

type ExportMonthOption = {
  value: string;
  label: string;
  year: number;
  month: number;
};

type LedgerSummary = {
  balanceCents: number;
  totalChargesCents: number;
  totalCreditsCents: number;
  totalPaidCents: number;
};

function buildExportMonths(
  startDateValue: Date | string | null | undefined
): ExportMonthOption[] {
  const fallback = new Date();
  const parsed =
    startDateValue instanceof Date
      ? startDateValue
      : startDateValue
        ? new Date(startDateValue)
        : fallback;

  const safeStart = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  const now = getBusinessDate();

  const start = new Date(safeStart.getFullYear(), safeStart.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);

  const months: ExportMonthOption[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;

    months.push({
      value: `${year}-${String(month).padStart(2, "0")}`,
      label: cursor.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      year,
      month,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months.reverse();
}

function getNextCycleKey(cycleKey: string): string {
  const [yearRaw, monthRaw] = cycleKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function toSafeInteger(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(later: Date, earlier: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.max(
    0,
    Math.floor(
      (startOfDay(later).getTime() - startOfDay(earlier).getTime()) / msPerDay
    )
  );
}

function getBillingLabel(cycleKey: string): string {
  const [yearRaw, monthRaw] = cycleKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return cycleKey;

  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
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

function toSafeDate(value: unknown): Date | null {
  if (!value) return null;

  const date =
    value instanceof Date ? value : new Date(value as string | number | Date);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getSignedImpactCents(input: {
  entryType: LedgerEntryType;
  amountCents: number;
  paymentStatus: PaymentStatus | null;
}): number {
  const amountCents = Math.abs(toSafeInteger(input.amountCents));

  if (input.entryType === "CHARGE") return amountCents;
  if (input.entryType === "PAYMENT") {
    return input.paymentStatus === "PAID" ? -amountCents : 0;
  }
  if (input.entryType === "CREDIT") return -amountCents;
  if (input.entryType === "ADJUSTMENT") return toSafeInteger(input.amountCents);

  return 0;
}

function buildLedgerSummary(input: {
  entries: DashboardLedgerEntryRow[];
  billingCycleStartDate: Date | null;
}): LedgerSummary {
  let balanceCents = 0;
  let totalChargesCents = 0;
  let totalCreditsCents = 0;
  let totalPaidCents = 0;

  for (const entry of input.entries) {
    const entryType = normalizeLedgerEntryType(entry.entryType);
    if (!entryType) continue;

    if (entryType === "CHARGE" && input.billingCycleStartDate) {
      const effectiveDate = toSafeDate(entry.effectiveDate);

      if (effectiveDate && effectiveDate < input.billingCycleStartDate) {
        continue;
      }
    }

    const amountCents = toSafeInteger(entry.amountCents);
    const paymentStatus = normalizePaymentStatus(entry.payment?.status);
    const signedImpactCents = getSignedImpactCents({
      entryType,
      amountCents,
      paymentStatus,
    });

    balanceCents += signedImpactCents;

    if (entryType === "CHARGE") {
      totalChargesCents += Math.abs(amountCents);
    }

    if (entryType === "CREDIT") {
      totalCreditsCents += Math.abs(amountCents);
    }

    if (entryType === "PAYMENT" && paymentStatus === "PAID") {
      totalPaidCents += Math.abs(amountCents);
    }
  }

  return {
    balanceCents,
    totalChargesCents,
    totalCreditsCents,
    totalPaidCents,
  };
}

function getCyclePaymentFlags(payments: DashboardPaymentRow[]): {
  hasPendingPayment: boolean;
  hasFailedPayment: boolean;
  hasReversedPayment: boolean;
  hasPaidPayment: boolean;
} {
  const statuses = payments.map((payment) =>
    String(payment.status ?? "").toUpperCase()
  );

const hasPaidPayment = statuses.includes("PAID");

const hasPendingPayment =
  !hasPaidPayment && statuses.includes("PENDING");

const hasFailedPayment =
  !hasPaidPayment &&
  !hasPendingPayment &&
  statuses.includes("FAILED");

const hasReversedPayment =
  !hasPaidPayment &&
  !hasPendingPayment &&
  statuses.includes("REVERSED");

  return {
    hasPendingPayment,
    hasFailedPayment,
    hasReversedPayment,
    hasPaidPayment,
  };
}

type DashboardPaymentRow = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
  billingCycle: string | null;
  amountCents: number;
  status: unknown;
  paymentMethod: string | null;
};

type DashboardLedgerEntryRow = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
  billingCycle: string;
  entryType: unknown;
  chargeType: unknown;
  amountCents: number;
  memo: string | null;
  effectiveDate: Date;
  createdAt: Date;
  payment: {
    status: unknown;
  } | null;
};

type DashboardNextCycleEntryRow = {
  id: string;
  unitId: string;
  tenantAssignmentId: string | null;
  entryType: unknown;
  chargeType: unknown;
  amountCents: number;
  memo: string | null;
  effectiveDate: Date;
  createdAt: Date;
  billingCycle: string;
};

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await refreshSessionCookie(session);

    if (
      (session.role !== "OWNER" &&
        session.role !== "MANAGER" &&
        session.role !== "STAFF") ||
      !session.propertyId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const property = await prisma.property.findUnique({
      where: { id: session.propertyId },
      include: {
        settings: true,
        paymentStatus: true,
        units: {
          select: {
            id: true,
          },
        },
        managementUsers: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            email: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    if (property.stripeAccountId) {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(property.stripeAccountId);

  const requirementsDue = Boolean(
    account.requirements?.currently_due?.length ||
      account.requirements?.past_due?.length ||
      account.requirements?.disabled_reason
  );

  const requirementsSummary =
    account.requirements?.disabled_reason ??
    (account.requirements?.currently_due?.length
      ? `Currently due: ${account.requirements.currently_due.join(", ")}`
      : account.requirements?.past_due?.length
        ? `Past due: ${account.requirements.past_due.join(", ")}`
        : null);

  const processorConnected = true;
  const bankConnected = Boolean(account.details_submitted);
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const onboardingComplete = Boolean(account.details_submitted);

  const readyForLive =
    processorConnected &&
    bankConnected &&
    chargesEnabled &&
    payoutsEnabled &&
    onboardingComplete &&
    !requirementsDue;

  const syncedPaymentStatus = await prisma.paymentConnectionStatus.upsert({
    where: { propertyId: property.id },
    update: {
      processorConnected,
      bankConnected,
      chargesEnabled,
      payoutsEnabled,
      onboardingComplete,
      requirementsDue,
      requirementsSummary,
      readyForLive,
      lastSyncedAt: new Date(),
    },
    create: {
      propertyId: property.id,
      processorConnected,
      bankConnected,
      chargesEnabled,
      payoutsEnabled,
      onboardingComplete,
      requirementsDue,
      requirementsSummary,
      readyForLive,
      lastSyncedAt: new Date(),
    },
  });

  property.paymentStatus = syncedPaymentStatus;
}

    let bankStatus: "NOT_CONNECTED" | "PENDING" | "CONNECTED" | "RESTRICTED" =
      "NOT_CONNECTED";
    let bankMessage =
      "Connect your payout account to begin receiving payments.";

     const paymentStatus = property.paymentStatus;

if (paymentStatus?.chargesEnabled && paymentStatus?.payoutsEnabled) {
  bankStatus = "CONNECTED";
  bankMessage =
    "Your account has been successfully connected. Payments received will be deposited into the connected account.";
} else if (paymentStatus?.requirementsDue || paymentStatus?.requirementsSummary) {
  bankStatus = "RESTRICTED";
  bankMessage =
    "Sorry, your account could not be fully verified. Please complete all required Stripe onboarding steps.";
} else if (property.stripeAccountId || paymentStatus?.processorConnected) {
  bankStatus = "PENDING";
  bankMessage =
    "Your account is pending verification. This can take anywhere from a couple of minutes to a few hours. Please check back later.";
}   

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

const [units, tiers] = await Promise.all([
  prisma.unit.findMany({
    where: {
      propertyId: property.id,
      isActive: true,
    },
    orderBy: { unitNumber: "asc" },
    select: {
      id: true,
      unitNumber: true,
      isActive: true,
      tierId: true,
      tier: {
        select: {
          id: true,
          name: true,
          baseRentCents: true,
          rentDueDay: true,
          gracePeriodDays: true,
          lateFeeInitialCents: true,
          lateFeeDailyCents: true,
          maxLateFeeDays: true,
        },
      },
      tenantAssignments: {
        where: { isCurrent: true, moveOutDate: null },
        orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  }),
  prisma.propertyTier.findMany({
    where: {
      propertyId: property.id,
      isActive: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
  id: true,
  name: true,
  unitCount: true,
  activeUnitCount: true,
  baseRentCents: true,

  rentDueDay: true,
  gracePeriodDays: true,
  lateFeeInitialCents: true,
  lateFeeDailyCents: true,
  maxLateFeeDays: true,
},
  }),
]);

const activeUnitCountsByTier = new Map<string, number>();

for (const unit of units) {
  if (!unit.tierId) continue;

  activeUnitCountsByTier.set(
    unit.tierId,
    (activeUnitCountsByTier.get(unit.tierId) ?? 0) + 1
  );
}

    const now = new Date();

    const anchorUnit = units[0] ?? null;
    const anchorEffective = resolveEffectiveBillingSettings({
      tier: anchorUnit?.tier ?? null,
      propertySettings: property.settings ?? null,
    });

    const anchorRentDates = getRentDateSummary({
      ...anchorEffective,
      now,
      billingCycleStartDate: property.billingCycleStartDate,
    });

    const currentBillingCycle = anchorRentDates.billingCycle;
    const nextBillingCycle = getNextCycleKey(currentBillingCycle);
    const billingLabel = getBillingLabel(currentBillingCycle);

    type DashboardUnit = (typeof units)[number];

    const unitIds = units.map((unit: DashboardUnit) => unit.id);

    const [payments, ledgerEntries, nextCycleEntries] =
      unitIds.length > 0
        ? await Promise.all([
            prisma.payment.findMany({
              where: {
                propertyId: property.id,
                unitId: { in: unitIds },
              },
              select: {
                id: true,
                unitId: true,
                tenantAssignmentId: true,
                billingCycle: true,
                amountCents: true,
                status: true,
                paymentMethod: true,
              },
            }),
            prisma.ledgerEntry.findMany({
              where: {
                propertyId: property.id,
                unitId: { in: unitIds },
                voidedAt: null,
                effectiveDate: {
                  lte: now,
                },
              },
              orderBy: [
                { effectiveDate: "asc" },
                { createdAt: "asc" },
                { id: "asc" },
              ],
              select: {
                id: true,
                unitId: true,
                tenantAssignmentId: true,
                billingCycle: true,
                entryType: true,
                chargeType: true,
                amountCents: true,
                memo: true,
                effectiveDate: true,
                createdAt: true,
                payment: {
                  select: {
                    status: true,
                  },
                },
              },
            }),
            prisma.ledgerEntry.findMany({
              where: {
                propertyId: property.id,
                unitId: { in: unitIds },
                billingCycle: nextBillingCycle,
                entryType: {
                  in: ["CHARGE", "CREDIT"],
                },
                voidedAt: null,
              },
              orderBy: [{ createdAt: "desc" }],
              select: {
                id: true,
                unitId: true,
                tenantAssignmentId: true,
                entryType: true,
                chargeType: true,
                amountCents: true,
                memo: true,
                effectiveDate: true,
                createdAt: true,
                billingCycle: true,
              },
            }),
          ])
        : [[], [], []];

    const paymentsByUnit = new Map<string, DashboardPaymentRow[]>();
    const ledgerEntriesByUnit = new Map<string, DashboardLedgerEntryRow[]>();
    const nextEntriesByUnit = new Map<string, DashboardNextCycleEntryRow[]>();

    for (const payment of payments as DashboardPaymentRow[]) {
      const existing = paymentsByUnit.get(payment.unitId) ?? [];
      existing.push(payment);
      paymentsByUnit.set(payment.unitId, existing);
    }

    for (const entry of ledgerEntries as DashboardLedgerEntryRow[]) {
      const existing = ledgerEntriesByUnit.get(entry.unitId) ?? [];
      existing.push(entry);
      ledgerEntriesByUnit.set(entry.unitId, existing);
    }

    for (const entry of nextCycleEntries as DashboardNextCycleEntryRow[]) {
      const existing = nextEntriesByUnit.get(entry.unitId) ?? [];
      existing.push(entry);
      nextEntriesByUnit.set(entry.unitId, existing);
    }

    let occupiedUnits = 0;
    let totalExpectedCents = 0;
    let totalCollectedCents = 0;
    let delinquentCount = 0;
    let unpaidUnitsCount = 0;
    let portalPaidCount = 0;
    let manualPaidCount = 0;
    let totalPaidCount = 0;

    const resolvedUnits = units.map((unit: DashboardUnit) => {
      const assignment = unit.tenantAssignments[0] ?? null;

      if (!assignment) {
        return {
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          tierId: unit.tierId ?? null,
          isActive: unit.isActive === true,
          tenantName: null,
          balanceCents: 0,
          balance: "0.00",
          totalPaid: "0.00",
          isDelinquent: false,
          daysPastDue: 0,
          paymentStatus: "UNPAID" as PaymentStatus,
          displayStatus: "UNPAID",
          statusColor: "blue",
          statusLabel: "No tenant",
          tenantMessage: "No active tenant.",
          tierName: unit.tier?.name ?? "Units",
          nextCycleAdjustments: [],
        };
      }

      occupiedUnits++;

      const effective = resolveEffectiveBillingSettings({
        tier: unit.tier,
        propertySettings: property.settings,
      });

      const rentDates = getRentDateSummary({
        ...effective,
        now,
        billingCycleStartDate: property.billingCycleStartDate,
      });

      const unitPayments = paymentsByUnit.get(unit.id) ?? [];
      const unitLedgerEntries = ledgerEntriesByUnit.get(unit.id) ?? [];
      const unitNextEntries = nextEntriesByUnit.get(unit.id) ?? [];

      const assignmentLedgerEntries = unitLedgerEntries.filter(
        (entry) =>
          !entry.tenantAssignmentId || entry.tenantAssignmentId === assignment.id
      );

      const ledger = buildLedgerSummary({
        entries: assignmentLedgerEntries,
        billingCycleStartDate: property.billingCycleStartDate,
      });

      const rawLedgerBalanceCents = Math.max(0, ledger.balanceCents);

      const assignmentPayments = unitPayments.filter(
  (payment) => payment.tenantAssignmentId === assignment.id
);

const cyclePayments = assignmentPayments.filter(
  (payment) => payment.billingCycle === rentDates.billingCycle
);

const cyclePaymentFlags = getCyclePaymentFlags(
  assignmentPayments.filter(
    (payment) =>
      payment.billingCycle === rentDates.billingCycle ||
      String(payment.status ?? "").toUpperCase() === "PENDING"
  )
);

      const effectiveBalanceCents = cyclePaymentFlags.hasPendingPayment
        ? 0
        : rawLedgerBalanceCents;

      const dueDate = parseDateOnly(rentDates.dueDate);
      const graceEndsOn = parseDateOnly(rentDates.graceEndsOn);

      const isPastGracePeriod =
        !cyclePaymentFlags.hasPendingPayment &&
        effectiveBalanceCents > 0 &&
        rentDates.isDelinquent === true;

      const isWithinGracePeriod =
        !cyclePaymentFlags.hasPendingPayment &&
        effectiveBalanceCents > 0 &&
        !isPastGracePeriod;

      const daysPastDue =
        isPastGracePeriod && dueDate ? diffDays(now, dueDate) : 0;

      const isDelinquent = isPastGracePeriod;

      const paidCyclePayments = cyclePayments.filter(
        (payment) => String(payment.status).toUpperCase() === "PAID"
      );

    const currentCycleExpectedCents = assignmentLedgerEntries
  .filter(
    (entry) =>
      entry.billingCycle === rentDates.billingCycle &&
      String(entry.chargeType ?? "").toUpperCase() !== "PROCESSING_FEE"
  )
  .reduce((sum, entry) => {
    const entryType = normalizeLedgerEntryType(entry.entryType);

    if (!entryType || entryType === "PAYMENT") {
      return sum;
    }

    return (
      sum +
      getSignedImpactCents({
        entryType,
        amountCents: entry.amountCents,
        paymentStatus: null,
      })
    );
  }, 0);

totalExpectedCents += Math.max(0, currentCycleExpectedCents);

      const cyclePaidCents = paidCyclePayments.reduce(
        (sum, payment) => sum + Math.max(0, toSafeInteger(payment.amountCents)),
        0
      );

      totalCollectedCents += cyclePaidCents;

      if (!cyclePaymentFlags.hasPendingPayment && isDelinquent) {
        delinquentCount++;
      }

      if (cyclePaymentFlags.hasPendingPayment) {
        // Pending = neither paid nor unpaid.
      } else if (rawLedgerBalanceCents > 0) {
        unpaidUnitsCount++;
      } else {
        totalPaidCount++;

        const hasManual = paidCyclePayments.some(
          (payment) => payment.paymentMethod === "MANUAL"
        );
        const hasPortal = paidCyclePayments.some(
          (payment) => payment.paymentMethod === "ACH"
        );

        if (hasManual) {
          manualPaidCount++;
        } else if (hasPortal) {
          portalPaidCount++;
        }
      }

      const unitStatus = getUnitStatus({
        balanceCents: effectiveBalanceCents,
        hasPendingPayment: cyclePaymentFlags.hasPendingPayment,
        hasFailedPayment: cyclePaymentFlags.hasFailedPayment,
        hasReversedPayment: cyclePaymentFlags.hasReversedPayment,
        isDelinquent,
        isWithinGracePeriod,
      });

      return {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        tierId: unit.tierId ?? null,
        isActive: unit.isActive === true,
        tenantName: `${assignment.firstName ?? ""} ${
          assignment.lastName ?? ""
        }`.trim(),
        balanceCents: rawLedgerBalanceCents,
        balance: formatCentsToDollars(rawLedgerBalanceCents),
        totalPaid: formatCentsToDollars(ledger.totalPaidCents),
        isDelinquent,
        daysPastDue,
        paymentStatus: unitStatus.paymentStatus,
        displayStatus: unitStatus.status,
        statusColor: unitStatus.color,
        statusLabel: unitStatus.label,
        tenantMessage: unitStatus.tenantMessage,
        tierName: unit.tier?.name ?? "Units",
        nextCycleAdjustments: unitNextEntries
          .filter(
            (entry) =>
              !entry.tenantAssignmentId ||
              entry.tenantAssignmentId === assignment.id
          )
          .map((entry) => ({
            id: entry.id,
            type: entry.entryType,
            chargeType: entry.chargeType,
            amount: entry.amountCents / 100,
            memo: entry.memo,
            effectiveDate: entry.effectiveDate.toISOString(),
            createdAt: entry.createdAt.toISOString(),
            billingCycle: entry.billingCycle,
          })),
      };
    });

    const totalExpected = Math.round(totalExpectedCents) / 100;
    const totalCollected = Math.round(totalCollectedCents) / 100;
    const exportMonths = buildExportMonths(property.billingCycleStartDate);

    if (process.env.NODE_ENV !== "production") {
      console.log("[manager-dashboard]", {
        propertyId: property.id,
        units: units.length,
        payments: payments.length,
        ledgerEntries: ledgerEntries.length,
        nextCycleEntries: nextCycleEntries.length,
      });
    }

    return NextResponse.json({
      ok: true,
      property: {
        id: property.id,
        name: property.name,
        code: property.propertyCode,
        unitCount: property.unitCount,
        managementUsers: property.managementUsers,
        billingCycleStartDate: property.billingCycleStartDate
          ? property.billingCycleStartDate.toISOString()
          : null,
        paymentStatus: {
          bankConnected: bankStatus === "CONNECTED",
          bankStatus,
          bankMessage,
        },
      },
      session: {
        role: session.role,
      },
      summary: {
        totalUnits: property.unitCount,
        occupiedUnits,
        vacantUnits: Math.max(0, property.unitCount - occupiedUnits),
        delinquentUnits: delinquentCount,
      },
      financials: {
        expected: totalExpected,
        collected: totalCollected,
        collectionRate:
          totalExpected > 0
            ? Math.round((totalCollected / totalExpected) * 100)
            : 0,
      },
      cycleSnapshot: {
        billingCycleLabel: billingLabel,
        occupiedUnitsLabel: `${occupiedUnits} / ${property.unitCount}`,
        portalPaidCount,
        manualPaidCount,
        totalPaidCount,
        unpaidUnitsCount,
        totalCollected,
        totalExpected,
        collectionRate:
          totalExpected > 0
            ? Number(((totalCollected / totalExpected) * 100).toFixed(1))
            : 0,
        difference: totalCollected - totalExpected,
      },
      units: resolvedUnits,
     tiers: tiers.map((tier: (typeof tiers)[number]) => {
  const configuredUnitCount = Number(tier.unitCount ?? 0);
  const activeUnitCount = activeUnitCountsByTier.get(tier.id) ?? 0;

  return {
    id: tier.id,
    name: tier.name,

    configuredUnitCount,
    activeUnitCount,
    availableUnitCount: Math.max(
      0,
      configuredUnitCount - activeUnitCount
    ),

    unitCount: configuredUnitCount,

    baseRent: tier.baseRentCents / 100,

    rentDueDay: tier.rentDueDay,
    gracePeriodDays: tier.gracePeriodDays,
    lateFeeInitialCents: tier.lateFeeInitialCents,
    lateFeeDailyCents: tier.lateFeeDailyCents,
    maxLateFeeDays: tier.maxLateFeeDays,
  };
}),

      exportOptions: {
        months: exportMonths,
        startYear: exportMonths[exportMonths.length - 1]?.year ?? null,
        startMonth: exportMonths[exportMonths.length - 1]?.month ?? null,
        currentYear: exportMonths[0]?.year ?? null,
        currentMonth: exportMonths[0]?.month ?? null,
      },
    });
  } catch (error) {
    console.error("dashboard error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}