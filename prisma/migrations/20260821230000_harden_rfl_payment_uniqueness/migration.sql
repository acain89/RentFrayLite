/*
  RentFrayLite recurring-payment uniqueness invariant.

  For a recurring plan, only one payment may exist for the same:

    business
    + recurring plan
    + billing cycle
    + unit/reference

  while that obligation is still active or already successfully paid.

  FAILED / EXPIRED / REFUNDED / RETURNED rows intentionally do not
  participate so a legitimate retry can create a new payment record.
*/

CREATE UNIQUE INDEX "Payment_active_recurring_obligation_unique"
ON "Payment" (
  "businessId",
  "sourceId",
  "billingCycle",
  "referenceLabel"
)
WHERE
  "sourceType" = 'RECURRING_PLAN'
  AND "sourceId" IS NOT NULL
  AND "billingCycle" IS NOT NULL
  AND "referenceLabel" IS NOT NULL
  AND "status" IN (
    'CREATED',
    'CHECKOUT_STARTED',
    'PENDING',
    'PAID',
    'DISPUTED'
  );