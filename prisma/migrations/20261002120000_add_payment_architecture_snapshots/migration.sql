-- Additive facts only. No defaults or historical backfill: current business
-- configuration cannot prove a historical payment's account or pricing version.
CREATE TYPE "StripeChargeModel" AS ENUM ('LEGACY_DESTINATION', 'DIRECT');

ALTER TABLE "CheckoutSession"
  ADD COLUMN "pricingVersion" TEXT,
  ADD COLUMN "chargeModel" "StripeChargeModel",
  ADD COLUMN "stripeConnectedAccountId" TEXT,
  ADD COLUMN "expectedStripeProcessingFeeCents" INTEGER,
  ADD COLUMN "rflApplicationFeeCents" INTEGER,
  ADD COLUMN "expectedManagementNetCents" INTEGER;

ALTER TABLE "Payment"
  ADD COLUMN "pricingVersion" TEXT,
  ADD COLUMN "chargeModel" "StripeChargeModel",
  ADD COLUMN "stripeConnectedAccountId" TEXT,
  ADD COLUMN "expectedStripeProcessingFeeCents" INTEGER,
  ADD COLUMN "rflApplicationFeeCents" INTEGER,
  ADD COLUMN "stripeBalanceTransactionId" TEXT,
  ADD COLUMN "actualManagementNetCents" INTEGER;
