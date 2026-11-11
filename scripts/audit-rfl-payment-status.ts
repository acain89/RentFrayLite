import { PaymentStatus } from "@prisma/client";

import {
  assertValidPaymentStatusTransition,
  canTransitionPaymentStatus,
  isFailedPaymentStatus,
  isPendingPaymentStatus,
  isSuccessfulPaymentStatus,
  isTerminalPaymentStatus,
} from "../lib/paymentStatus";

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`
    );
  }
}

function assertThrows(
  callback: () => void,
  label: string
): void {
  let threw = false;

  try {
    callback();
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error(`${label}: expected function to throw`);
  }
}

function testValidTransitions(): void {
  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.CREATED,
      PaymentStatus.CHECKOUT_STARTED
    ),
    true,
    "CREATED -> CHECKOUT_STARTED"
  );

  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.CREATED,
      PaymentStatus.PENDING
    ),
    true,
    "CREATED -> PENDING"
  );

  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.CREATED,
      PaymentStatus.PAID
    ),
    true,
    "CREATED -> PAID"
  );

  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.CHECKOUT_STARTED,
      PaymentStatus.PENDING
    ),
    true,
    "CHECKOUT_STARTED -> PENDING"
  );

  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.PENDING,
      PaymentStatus.PAID
    ),
    true,
    "PENDING -> PAID"
  );

  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.PAID,
      PaymentStatus.RETURNED
    ),
    true,
    "PAID -> RETURNED"
  );

  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.PAID,
      PaymentStatus.DISPUTED
    ),
    true,
    "PAID -> DISPUTED"
  );
}

function testInvalidTransitions(): void {
  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.FAILED,
      PaymentStatus.PAID
    ),
    false,
    "FAILED must not become PAID"
  );

  assertEqual(
    canTransitionPaymentStatus(
      PaymentStatus.RETURNED,
      PaymentStatus.PAID
    ),
    false,
    "RETURNED must not become PAID"
  );

  assertThrows(
    () =>
      assertValidPaymentStatusTransition(
        PaymentStatus.RETURNED,
        PaymentStatus.PAID
      ),
    "Invalid transition assertion"
  );
}

function testClassification(): void {
  assertEqual(
    isSuccessfulPaymentStatus(PaymentStatus.PAID),
    true,
    "PAID successful"
  );

  assertEqual(
    isPendingPaymentStatus(PaymentStatus.CREATED),
    true,
    "CREATED pending"
  );

  assertEqual(
    isPendingPaymentStatus(PaymentStatus.PENDING),
    true,
    "PENDING pending"
  );

  assertEqual(
    isFailedPaymentStatus(PaymentStatus.FAILED),
    true,
    "FAILED failure"
  );

  assertEqual(
    isFailedPaymentStatus(PaymentStatus.RETURNED),
    true,
    "RETURNED failure"
  );

  assertEqual(
    isTerminalPaymentStatus(PaymentStatus.RETURNED),
    true,
    "RETURNED terminal"
  );
}

function main(): void {
  testValidTransitions();
  testInvalidTransitions();
  testClassification();

  console.log(
    "PASS: RFL payment-status regression audit completed successfully."
  );
}

main();
