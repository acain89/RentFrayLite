export type PaymentStatus =
  | "UNPAID"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REVERSED";

export type UnitDisplayStatus =
  | "PAID"
  | "PENDING"
  | "FAILED"
  | "GRACE"
  | "PAST_DUE"
  | "UNPAID";

export type UnitStatusColor = "green" | "yellow" | "orange" | "blue" | "red";

export type UnitStatusInput = {
  balanceCents: number;
  hasPendingPayment: boolean;
  hasFailedPayment: boolean;
  hasReversedPayment: boolean;
  isDelinquent: boolean;
  isWithinGracePeriod: boolean;
};

export type UnitStatusResult = {
  status: UnitDisplayStatus;
  paymentStatus: PaymentStatus;
  color: UnitStatusColor;
  label: string;
  tenantMessage: string;
  canAttemptPayment: boolean;
};

export function getUnitStatus(input: UnitStatusInput): UnitStatusResult {
  const balanceCents = Math.max(0, Math.trunc(Number(input.balanceCents) || 0));

  if (input.hasPendingPayment) {
    return {
      status: "PENDING",
      paymentStatus: "PENDING",
      color: "yellow",
      label: "Payment pending",
      tenantMessage:
        "Your payment is processing. You do not need to submit another payment while this one is pending.",
      canAttemptPayment: false,
    };
  }

  if (input.hasFailedPayment || input.hasReversedPayment) {
    return {
      status: "FAILED",
      paymentStatus: "FAILED",
      color: "orange",
      label: "Payment failed",
      tenantMessage:
        "Your payment failed or was reversed. Please submit a new payment.",
      canAttemptPayment: balanceCents > 0,
    };
  }

  if (balanceCents <= 0) {
    return {
      status: "PAID",
      paymentStatus: "PAID",
      color: "green",
      label: "Paid",
      tenantMessage: "Your balance is paid.",
      canAttemptPayment: false,
    };
  }

  if (input.isDelinquent) {
    return {
      status: "PAST_DUE",
      paymentStatus: "UNPAID",
      color: "red",
      label: "Past due",
      tenantMessage: "Your balance is past due.",
      canAttemptPayment: true,
    };
  }

  if (input.isWithinGracePeriod) {
    return {
      status: "GRACE",
      paymentStatus: "UNPAID",
      color: "blue",
      label: "Balance due",
      tenantMessage:
        "You have a balance due, but you are still within the grace period.",
      canAttemptPayment: true,
    };
  }

  return {
    status: "UNPAID",
    paymentStatus: "UNPAID",
    color: "blue",
    label: "Balance due",
    tenantMessage: "You have a balance due.",
    canAttemptPayment: true,
  };
}