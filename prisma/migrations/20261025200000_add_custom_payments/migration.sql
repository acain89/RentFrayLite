ALTER TYPE "PaymentSourceType" ADD VALUE 'CUSTOM_PAYMENT';
ALTER TABLE "CheckoutSession"
  ADD COLUMN "sourceType" "PaymentSourceType" NOT NULL DEFAULT 'RECURRING_PLAN',
  ALTER COLUMN "planId" DROP NOT NULL,
  ALTER COLUMN "billingCycle" DROP NOT NULL,
  ALTER COLUMN "dueDate" DROP NOT NULL,
  ALTER COLUMN "graceEndsAt" DROP NOT NULL;

-- Text comparisons allow the enum addition and checks in the same migration.
-- Existing standard checkout snapshots are retained without recalculation.
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_source_shape_check" CHECK (
  ("sourceType"::text = 'RECURRING_PLAN' AND "planId" IS NOT NULL AND "billingCycle" IS NOT NULL
    AND "dueDate" IS NOT NULL AND "graceEndsAt" IS NOT NULL)
  OR
  ("sourceType"::text = 'CUSTOM_PAYMENT' AND "planId" IS NULL AND "billingCycle" IS NULL
    AND "dueDate" IS NULL AND "graceEndsAt" IS NULL AND "baseAmountCents" = "subtotalCents"
    AND "recurringChargesCents" = 0 AND "initialLateFeeCents" = 0 AND "dailyLateFeesCents" = 0)
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_custom_source_shape_check" CHECK (
  "sourceType"::text <> 'CUSTOM_PAYMENT' OR ("sourceId" IS NULL AND "billingCycle" IS NULL)
);
