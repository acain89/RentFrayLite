import {
  PaymentMethod,
  Prisma,
  PaymentStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REPORT_SELECT, serializeReportPayment, type HistoryPayment } from "@/lib/transactionReporting";
import { loadReportingDisputeOutcomes } from "@/lib/paymentReportingOutcome";
import { loadSmsDeliveryMetrics, type SmsDeliveryMetric } from "@/lib/smsDeliveryReporting";

export type PeriodMetric = {
  count: number;
  /** Compatibility field: gross original tenant fees, NOT realized net revenue. */
  revenueCents: number;
  customerRefundCents: number | null;
  pendingCustomerRefundCents: number | null;
  refundObservationCount: number;
  refundUnknownCount: number;
  disputes: { active: number; won: number; lost: number; unknown: number };
  observedProcessorFeeCents: number | null;
  observedApplicationFeeCents: number | null;
  observedApplicationFeeRefundCents: number | null;
  confirmedManagementCorrectionCents: number | null;
  observedPlatformRevenueCents: number | null;
};

export type AdminDashboardData = {
  connectedBusinesses: number;
  payments: {
    today: PeriodMetric;
    month: PeriodMetric;
    allTime: PeriodMetric;
  };
  issues: {
    smsDelivery: { today: SmsDeliveryMetric; month: SmsDeliveryMetric; allTime: SmsDeliveryMetric };
    smsFailed: {
      today: number;
      month: number;
      allTime: number;
    };
    achReturns: {
      today: PeriodMetric;
      month: PeriodMetric;
      allTime: PeriodMetric;
    };
    chargebacks: {
      today: PeriodMetric;
      month: PeriodMetric;
      allTime: PeriodMetric;
    };
  };
};

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
}

function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1
  ));
}

function emptyMetric(): PeriodMetric {
  const metric: PeriodMetric = { count: 0, revenueCents: 0, customerRefundCents: null, pendingCustomerRefundCents: null,
    refundObservationCount: 0, refundUnknownCount: 0, disputes: { active: 0, won: 0, lost: 0, unknown: 0 },
    observedProcessorFeeCents: null, observedApplicationFeeCents: null, observedApplicationFeeRefundCents: null,
    confirmedManagementCorrectionCents: null, observedPlatformRevenueCents: null };
  return metric;
}

function addPaymentMetric(metric: PeriodMetric, p: HistoryPayment) {
  metric.count++; metric.revenueCents += p.platformFeeCents;
  if (p.customerRefundCents === null) metric.refundUnknownCount++;
  else metric.refundObservationCount++;
  for (const key of ["customerRefundCents", "pendingCustomerRefundCents", "observedProcessorFeeCents", "observedApplicationFeeCents", "observedApplicationFeeRefundCents", "confirmedManagementCorrectionCents", "observedPlatformRevenueCents"] as const) {
    const value = key === "observedProcessorFeeCents" ? p.verifiedProcessorFeeCents : p[key];
    if (value !== null) metric[key] = (metric[key] ?? 0) + value;
  }
  if (p.disputeOutcome === "ACTIVE") metric.disputes.active++;
  else if (p.disputeOutcome === "WON") metric.disputes.won++;
  else if (p.disputeOutcome === "LOST") metric.disputes.lost++;
  else if (p.disputeOutcome === "UNKNOWN") metric.disputes.unknown++;
}
function emptyPeriods() { return { today: emptyMetric(), month: emptyMetric(), allTime: emptyMetric() }; }

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const now = new Date(), today = startOfUtcDay(now), month = startOfUtcMonth(now);
  // One read snapshot covers business count, payment/refund/journal pages and
  // existing SMS metrics. Never mix independent financial-period scans.
  return prisma.$transaction(async tx => {
    const connectedBusinesses = await tx.business.count({ where: {
      setupCompletedAt: { not: null }, isActive: true,
      stripeConnection: { is: { readyForLive: true } },
    } });
    const payments = emptyPeriods(), achReturns = emptyPeriods(), chargebacks = emptyPeriods();
    let cursor: string | undefined;
    for (;;) {
      const rows = await tx.payment.findMany({ where: { OR: [
        { status: PaymentStatus.PAID },
        { status: PaymentStatus.RETURNED, paymentMethod: PaymentMethod.ACH },
        { status: PaymentStatus.DISPUTED },
      ] }, select: REPORT_SELECT, orderBy: { id: "asc" }, take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      const outcomes = await loadReportingDisputeOutcomes(tx, rows);
      for (const row of rows) {
        const p = serializeReportPayment(row, outcomes.get(row.id));
        const periods = row.status === PaymentStatus.PAID ? payments
          : row.status === PaymentStatus.RETURNED ? achReturns : chargebacks;
        const at = row.status === PaymentStatus.PAID ? row.paidAt
          : row.status === PaymentStatus.RETURNED ? row.returnedAt : row.disputedAt;
        addPaymentMetric(periods.allTime, p);
        if (at && at >= month) addPaymentMetric(periods.month, p);
        if (at && at >= today) addPaymentMetric(periods.today, p);
      }
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1].id;
    }
    const smsDelivery = await loadSmsDeliveryMetrics(tx, today, month);
    return { connectedBusinesses, payments, issues: {
      smsDelivery, smsFailed: { today: smsDelivery.today.total.FAILED,
        month: smsDelivery.month.total.FAILED, allTime: smsDelivery.allTime.total.FAILED },
      achReturns, chargebacks,
    } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10000, timeout: 60000 });
}
