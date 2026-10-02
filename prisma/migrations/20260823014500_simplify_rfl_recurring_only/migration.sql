-- RFL is recurring-payment only.
-- Legacy database audit confirmed there are no rows using:
-- REFUNDED, CATALOG_ITEM, or CUSTOM_POSTING.

-- The partial unique index references both enum types being replaced,
-- so remove it before changing those types.
DROP INDEX IF EXISTS "Payment_active_recurring_obligation_unique";


-- ============================================================
-- PaymentStatus: remove REFUNDED
-- ============================================================

ALTER TABLE "Payment"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "PaymentStatus"
RENAME TO "PaymentStatus_old";

CREATE TYPE "PaymentStatus" AS ENUM (
  'CREATED',
  'CHECKOUT_STARTED',
  'PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'DISPUTED',
  'RETURNED'
);

ALTER TABLE "Payment"
ALTER COLUMN "status"
TYPE "PaymentStatus"
USING ("status"::text::"PaymentStatus");

ALTER TABLE "Payment"
ALTER COLUMN "status"
SET DEFAULT 'CREATED';

DROP TYPE "PaymentStatus_old";


-- ============================================================
-- PaymentSourceType: recurring payments only
-- ============================================================

ALTER TYPE "PaymentSourceType"
RENAME TO "PaymentSourceType_old";

CREATE TYPE "PaymentSourceType" AS ENUM (
  'RECURRING_PLAN'
);

ALTER TABLE "Payment"
ALTER COLUMN "sourceType"
TYPE "PaymentSourceType"
USING ("sourceType"::text::"PaymentSourceType");

DROP TYPE "PaymentSourceType_old";


-- ============================================================
-- Remove obsolete refund field
-- ============================================================

ALTER TABLE "Payment"
DROP COLUMN "refundedAt";


-- ============================================================
-- Restore recurring-payment duplicate protection
-- ============================================================

CREATE UNIQUE INDEX
"Payment_active_recurring_obligation_unique"
ON "Payment" (
  "businessId",
  "sourceId",
  "billingCycle",
  "referenceLabel"
)
WHERE
  "sourceType" = 'RECURRING_PLAN'::"PaymentSourceType"
  AND "sourceId" IS NOT NULL
  AND "billingCycle" IS NOT NULL
  AND "referenceLabel" IS NOT NULL
  AND "status" IN (
    'CREATED'::"PaymentStatus",
    'CHECKOUT_STARTED'::"PaymentStatus",
    'PENDING'::"PaymentStatus",
    'PAID'::"PaymentStatus",
    'DISPUTED'::"PaymentStatus"
  );