// lib/paymentStatus.ts

/*
========================================================
PAYMENT STATUS AUTHORITY (SINGLE SOURCE OF TRUTH)
========================================================

Rules enforced:
- Only valid statuses allowed
- Only valid transitions allowed
- No fake "PAID" states from UI
- Backend/webhook must control finalization
========================================================
*/

export type PaymentStatus =
  | "UNPAID"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REVERSED";

/*
========================================================
VALID STATUS TRANSITIONS
========================================================
*/

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  UNPAID: ["PENDING"],
  PENDING: ["PAID", "FAILED", "REVERSED"],
  PAID: ["REVERSED"], // ACH reversal risk
  FAILED: ["PENDING"], // retry allowed
  REVERSED: [], // terminal (for now)
};

/*
========================================================
TRANSITION VALIDATION
========================================================
*/

export function canTransition(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/*
========================================================
ENFORCED TRANSITION (SAFE)
========================================================
*/

export function assertValidTransition(
  from: PaymentStatus,
  to: PaymentStatus
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid payment status transition: ${from} → ${to}`
    );
  }
}

/*
========================================================
STATUS HELPERS
========================================================
*/

export function isFinalStatus(status: PaymentStatus): boolean {
  return status === "PAID" || status === "FAILED" || status === "REVERSED";
}

export function isSuccessful(status: PaymentStatus): boolean {
  return status === "PAID";
}

export function isFailure(status: PaymentStatus): boolean {
  return status === "FAILED" || status === "REVERSED";
}

export function isPending(status: PaymentStatus): boolean {
  return status === "PENDING";
}

export function isUnpaid(status: PaymentStatus): boolean {
  return status === "UNPAID";
}

/*
========================================================
UI SAFETY (CRITICAL)
========================================================
Never show "paid" unless backend confirmed
========================================================
*/

export function shouldDisplayPaid(status: PaymentStatus): boolean {
  return status === "PAID";
}

/*
========================================================
PAYMENT SYSTEM READINESS
========================================================
*/

export function isPaymentReady(status: {
  stripeConnected: boolean | null;
  achEnabled: boolean | null;
}): boolean {
  return Boolean(status?.stripeConnected && status?.achEnabled);
}