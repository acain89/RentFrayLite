
import {
  formatBillingCycleLabel as formatBillingCycleLabelFromCalendar,
  getBillingCycle,
} from "@/lib/billingCalendar";
import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { getPropertyLocalDate } from "@/lib/propertyBillingCalendar";
import { reportingMonthRange, reportingTimeZone } from "@/lib/reportingCalendar";
import { primaryPaymentStatus } from "@/lib/transactionReportView";

export type DashboardPaymentStatus = "PENDING" | "SUCCESSFUL" | "FAILED";

export type DashboardPayment = {
  paymentType: "Custom" | "Standard";
  id: string;
  status: DashboardPaymentStatus;
  statusDetail: string;
  customerName: string;
  reference: string;
  amountCents: number;
  paymentMethod: "ACH" | "CARD" | "-";
  timestamp: string;
};

// Standard cycles use immutable snapshots; Custom uses original transaction time.
export function getDashboardPaymentScope(businessId: string, billingCycle: string, propertyTimeZone: string | null = null): Prisma.PaymentWhereInput {
  return { businessId, OR: [
    { sourceType: "RECURRING_PLAN", billingCycle },
    { sourceType: "CUSTOM_PAYMENT", createdAt: reportingMonthRange(billingCycle, reportingTimeZone(propertyTimeZone)) },
  ] };
}

export function getCurrentBillingCycle(
  date = new Date(), propertyTimeZone: string | null = null
): string {
  return propertyTimeZone === null ? getBillingCycle(date) : getPropertyLocalDate(date, reportingTimeZone(propertyTimeZone)).slice(0, 7);
}

export function formatBillingCycleLabel(
  billingCycle: string
): string {
  return formatBillingCycleLabelFromCalendar(billingCycle);
}

export function getDashboardStatus(status: PaymentStatus): DashboardPaymentStatus | null {
  return primaryPaymentStatus(status);
}

export function getPaymentMethodLabel(method: PaymentMethod | null): "ACH" | "CARD" | "-" {
  return method === PaymentMethod.ACH ? "ACH" : method === PaymentMethod.CARD ? "CARD" : "-";
}
