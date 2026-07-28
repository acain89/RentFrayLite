import {
  PaymentMethod,
  PaymentStatus,
  SmsReceiptStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PeriodMetric = {
  count: number;
  revenueCents: number;
};

export type AdminDashboardData = {
  connectedBusinesses: number;
  payments: {
    today: PeriodMetric;
    month: PeriodMetric;
    allTime: PeriodMetric;
  };
  issues: {
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

async function paymentMetric(where: {
  status: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paidAt?: { gte: Date };
  returnedAt?: { gte: Date };
  disputedAt?: { gte: Date };
}): Promise<PeriodMetric> {
  const result = await prisma.payment.aggregate({
    where,
    _count: { _all: true },
    _sum: { platformFeeCents: true },
  });

  return {
    count: result._count._all,
    revenueCents: result._sum.platformFeeCents ?? 0,
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const today = startOfUtcDay();
  const month = startOfUtcMonth();

  const [
    connectedBusinesses,
    paidToday,
    paidMonth,
    paidAllTime,
    smsFailedToday,
    smsFailedMonth,
    smsFailedAllTime,
    achReturnsToday,
    achReturnsMonth,
    achReturnsAllTime,
    chargebacksToday,
    chargebacksMonth,
    chargebacksAllTime,
  ] = await Promise.all([
    prisma.business.count({
      where: {
        setupCompletedAt: { not: null },
        isActive: true,
        stripeConnection: {
          is: {
            readyForLive: true,
          },
        },
      },
    }),

    paymentMetric({
      status: PaymentStatus.PAID,
      paidAt: { gte: today },
    }),
    paymentMetric({
      status: PaymentStatus.PAID,
      paidAt: { gte: month },
    }),
    paymentMetric({
      status: PaymentStatus.PAID,
    }),

    prisma.smsReceipt.count({
      where: {
        status: SmsReceiptStatus.FAILED,
        updatedAt: { gte: today },
      },
    }),
    prisma.smsReceipt.count({
      where: {
        status: SmsReceiptStatus.FAILED,
        updatedAt: { gte: month },
      },
    }),
    prisma.smsReceipt.count({
      where: {
        status: SmsReceiptStatus.FAILED,
      },
    }),

    paymentMetric({
      status: PaymentStatus.RETURNED,
      paymentMethod: PaymentMethod.ACH,
      returnedAt: { gte: today },
    }),
    paymentMetric({
      status: PaymentStatus.RETURNED,
      paymentMethod: PaymentMethod.ACH,
      returnedAt: { gte: month },
    }),
    paymentMetric({
      status: PaymentStatus.RETURNED,
      paymentMethod: PaymentMethod.ACH,
    }),

    paymentMetric({
      status: PaymentStatus.DISPUTED,
      disputedAt: { gte: today },
    }),
    paymentMetric({
      status: PaymentStatus.DISPUTED,
      disputedAt: { gte: month },
    }),
    paymentMetric({
      status: PaymentStatus.DISPUTED,
    }),
  ]);

  return {
    connectedBusinesses,
    payments: {
      today: paidToday,
      month: paidMonth,
      allTime: paidAllTime,
    },
    issues: {
      smsFailed: {
        today: smsFailedToday,
        month: smsFailedMonth,
        allTime: smsFailedAllTime,
      },
      achReturns: {
        today: achReturnsToday,
        month: achReturnsMonth,
        allTime: achReturnsAllTime,
      },
      chargebacks: {
        today: chargebacksToday,
        month: chargebacksMonth,
        allTime: chargebacksAllTime,
      },
    },
  };
}