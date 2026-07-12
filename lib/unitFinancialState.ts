// lib/unitFinancialState.ts

import { getProcessingFeeCents } from "@/lib/billingConfig";
import { getUnitLedgerSummary, type LedgerSummary } from "@/lib/ledger";
import {
  getBusinessDate,
  getRentDateSummary,
  resolveEffectiveBillingSettings,
  type EffectiveBillingSettings,
  type RentDateSummary,
} from "@/lib/rentDates";
import {
  getUnitStatus,
  type PaymentStatus,
  type UnitStatusResult,
} from "@/lib/unitStatusEngine";
import { prisma } from "@/lib/prisma";

type UnitFinancialStateTier = {
  rentDueDay: number;
  gracePeriodDays: number;
  lateFeeInitialCents: number;
  lateFeeDailyCents: number;
  maxLateFeeDays: number;
} | null;

type UnitFinancialStatePropertySettings = {
  rentDueDay: number;
  gracePeriodDays: number;
  lateFeeEnabled: boolean;
  lateFeeFlatCents?: number | null;
} | null;

type UnitFinancialStateInput = {
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string | null;
  tier: UnitFinancialStateTier;
  propertySettings: UnitFinancialStatePropertySettings;
  billingCycleStartDate?: Date | null;
  now?: Date;
};

type CyclePaymentState = {
  hasPendingPayment: boolean;
  hasFailedPayment: boolean;
  hasReversedPayment: boolean;
  hasPaidPayment: boolean;
};

function parseDateOnly(value: string): Date | null {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

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

async function getPaymentState(input: {
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string | null;
  billingCycle: string;
}): Promise<CyclePaymentState> {
  const scopedPayments = await prisma.payment.findMany({
    where: {
      propertyId: input.propertyId,
      unitId: input.unitId,
      ...(input.tenantAssignmentId
        ? { tenantAssignmentId: input.tenantAssignmentId }
        : {}),
      OR: [
        { billingCycle: input.billingCycle },
        { status: "PENDING" },
      ],
    },
    select: {
      status: true,
      billingCycle: true,
    },
  });

    const currentCycleStatuses = scopedPayments
    .filter(
      (payment: (typeof scopedPayments)[number]) =>
        payment.billingCycle === input.billingCycle
    )
    .map((payment: (typeof scopedPayments)[number]) =>
      String(payment.status).toUpperCase()
    );

  const hasActivePendingPayment = scopedPayments.some(
    (payment: (typeof scopedPayments)[number]) =>
      String(payment.status).toUpperCase() === "PENDING"
  );

  const hasPaidPayment = currentCycleStatuses.includes("PAID");

  const hasPendingPayment = hasActivePendingPayment;

  const hasFailedPayment =
    !hasPaidPayment &&
    !hasPendingPayment &&
    currentCycleStatuses.includes("FAILED");

  const hasReversedPayment =
    !hasPaidPayment &&
    !hasPendingPayment &&
    currentCycleStatuses.includes("REVERSED");

  return {
    hasPendingPayment,
    hasFailedPayment,
    hasReversedPayment,
    hasPaidPayment,
  };
}

export type UnitFinancialState = {
  effectiveBillingSettings: EffectiveBillingSettings;
  rentDates: RentDateSummary;
  ledgerSummary: LedgerSummary;

  ledgerBalanceCents: number;
  processingFeeCents: number;
  tenantTotalDueCents: number;

  billingCycle: string;
  dueDate: string;
  graceEndsOn: string;

  isWithinGracePeriod: boolean;
  isPastGracePeriod: boolean;
  isDelinquent: boolean;
  daysPastDue: number;
  daysPastGrace: number;

  hasPendingPayment: boolean;
  hasFailedPayment: boolean;
  hasReversedPayment: boolean;
  hasPaidPayment: boolean;

  status: UnitStatusResult;
  paymentStatus: PaymentStatus;
};

export async function getUnitFinancialState(
  input: UnitFinancialStateInput
): Promise<UnitFinancialState> {
const now = getBusinessDate(
  input.now ?? new Date()
);

  const effectiveBillingSettings = resolveEffectiveBillingSettings({
    tier: input.tier,
    propertySettings: input.propertySettings,
  });

  const rentDates = getRentDateSummary({
    ...effectiveBillingSettings,
    now,
    billingCycleStartDate: input.billingCycleStartDate ?? null,
  });

  const ledgerSummary = await getUnitLedgerSummary(
    input.unitId,
    input.tenantAssignmentId ?? undefined
  );

    const cyclePaymentState = await getPaymentState({
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantAssignmentId: input.tenantAssignmentId,
    billingCycle: rentDates.billingCycle,
  });

  const rawLedgerBalanceCents = Math.max(0, ledgerSummary.balanceCents);

  const hasPendingPayment = cyclePaymentState.hasPendingPayment;
  const hasFailedPayment = cyclePaymentState.hasFailedPayment;
  const hasReversedPayment = cyclePaymentState.hasReversedPayment;
  const hasPaidPayment = cyclePaymentState.hasPaidPayment;

  const effectiveBalanceCents = hasPendingPayment ? 0 : rawLedgerBalanceCents;

  const processingFeeCents =
    effectiveBalanceCents > 0
      ? getProcessingFeeCents(effectiveBalanceCents)
      : 0;

  const tenantTotalDueCents =
    effectiveBalanceCents > 0
      ? effectiveBalanceCents + processingFeeCents
      : 0;

  const dueDate = parseDateOnly(rentDates.dueDate);
  const graceEndsOn = parseDateOnly(rentDates.graceEndsOn);

  const isPastGracePeriod =
    !hasPendingPayment &&
    effectiveBalanceCents > 0 &&
    rentDates.isDelinquent === true;

  const isWithinGracePeriod =
    !hasPendingPayment && effectiveBalanceCents > 0 && !isPastGracePeriod;

  const daysPastDue = isPastGracePeriod && dueDate ? diffDays(now, dueDate) : 0;

  const daysPastGrace =
    isPastGracePeriod && graceEndsOn ? diffDays(now, graceEndsOn) : 0;

  const status = getUnitStatus({
    balanceCents: effectiveBalanceCents,
    hasPendingPayment,
    hasFailedPayment,
    hasReversedPayment,
    isDelinquent: isPastGracePeriod,
    isWithinGracePeriod,
  });

  return {
    effectiveBillingSettings,
    rentDates,
    ledgerSummary,

    ledgerBalanceCents: rawLedgerBalanceCents,
    processingFeeCents,
    tenantTotalDueCents,

    billingCycle: rentDates.billingCycle,
    dueDate: rentDates.dueDate,
    graceEndsOn: rentDates.graceEndsOn,

    isWithinGracePeriod,
    isPastGracePeriod,
    isDelinquent: isPastGracePeriod,
    daysPastDue,
    daysPastGrace,

    hasPendingPayment,
    hasFailedPayment,
    hasReversedPayment,
    hasPaidPayment,

    status,
    paymentStatus: status.paymentStatus,
  };
}