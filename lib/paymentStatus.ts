import { PaymentStatus } from "@prisma/client";

export const DUPLICATE_PAYMENT_BLOCK_STATUSES: readonly PaymentStatus[] =
  Object.values(PaymentStatus).filter(
    blocksDuplicatePayment
  );

/**
 * RentFrayLite payment-status authority.
 *
 * SINGLE SOURCE OF TRUTH for:
 * - legal payment status transitions
 * - terminal/success/failure classifications
 * - whether a payment blocks another attempt
 *
 * Stripe/webhook/routes should consume these rules rather than
 * independently deciding which state changes are valid.
 */

const VALID_TRANSITIONS: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = {
[PaymentStatus.CREATED]: [
  PaymentStatus.CHECKOUT_STARTED,
  PaymentStatus.PENDING,
  PaymentStatus.PAID,
  PaymentStatus.EXPIRED,
  PaymentStatus.FAILED,
],

  [PaymentStatus.CHECKOUT_STARTED]: [
    PaymentStatus.PENDING,
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
  ],

  [PaymentStatus.PENDING]: [
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.RETURNED,
  ],

[PaymentStatus.PAID]: [
  PaymentStatus.DISPUTED,
  PaymentStatus.RETURNED,
],

  [PaymentStatus.FAILED]: [],

  [PaymentStatus.EXPIRED]: [],

  [PaymentStatus.DISPUTED]: [
    PaymentStatus.PAID,
    PaymentStatus.RETURNED,
  ],

  [PaymentStatus.RETURNED]: [],
};

export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  if (from === to) {
    return true;
  }

  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Webhook transitions require a current Stripe observation, not an event
 * snapshot. Final-looking states may only recover on explicit settlement or
 * dispute-resolution evidence; ordinary processing can never reopen them.
 */
export function canApplyStripePaymentState(
  from: PaymentStatus,
  to: PaymentStatus,
  evidence: { settled: boolean; disputeResolved: boolean }
): boolean {
  if (from === to) return false;
  if (to === PaymentStatus.PENDING) {
    return from === PaymentStatus.CREATED || from === PaymentStatus.CHECKOUT_STARTED;
  }
  if (to === PaymentStatus.PAID) {
    if (!evidence.settled) return false;
    if (from === PaymentStatus.DISPUTED || from === PaymentStatus.RETURNED) {
      return evidence.disputeResolved;
    }
    // A declined card attempt can later succeed in the same hosted Checkout.
    return from === PaymentStatus.FAILED || from === PaymentStatus.EXPIRED ||
      canTransitionPaymentStatus(from, to);
  }
  if (to === PaymentStatus.RETURNED || to === PaymentStatus.DISPUTED) {
    // A dispute/return may arrive before the original success notification.
    return evidence.settled && from !== PaymentStatus.RETURNED;
  }
  return canTransitionPaymentStatus(from, to);
}

export function assertValidPaymentStatusTransition(
  from: PaymentStatus,
  to: PaymentStatus
): void {
  if (!canTransitionPaymentStatus(from, to)) {
    throw new Error(
      `Invalid payment status transition: ${from} -> ${to}`
    );
  }
}

export function isSuccessfulPaymentStatus(
  status: PaymentStatus
): boolean {
  return status === PaymentStatus.PAID;
}

export function isPendingPaymentStatus(
  status: PaymentStatus
): boolean {
  return (
    status === PaymentStatus.CREATED ||
    status === PaymentStatus.CHECKOUT_STARTED ||
    status === PaymentStatus.PENDING
  );
}

export function isFailedPaymentStatus(
  status: PaymentStatus
): boolean {
  return (
    status === PaymentStatus.FAILED ||
    status === PaymentStatus.EXPIRED ||
    status === PaymentStatus.RETURNED
  );
}

export function isDisputedPaymentStatus(
  status: PaymentStatus
): boolean {
  return status === PaymentStatus.DISPUTED;
}

export function isTerminalPaymentStatus(
  status: PaymentStatus
): boolean {
  return (
    status === PaymentStatus.FAILED ||
    status === PaymentStatus.EXPIRED ||
    status === PaymentStatus.RETURNED
  );
}

/**
 * A payment in one of these states should prevent another payment for the
 * same recurring-plan + unit + billing-cycle obligation.
 */
export function blocksDuplicatePayment(
  status: PaymentStatus
): boolean {
  return (
    status === PaymentStatus.CREATED ||
    status === PaymentStatus.CHECKOUT_STARTED ||
    status === PaymentStatus.PENDING ||
    status === PaymentStatus.PAID ||
    status === PaymentStatus.DISPUTED
  );
}
