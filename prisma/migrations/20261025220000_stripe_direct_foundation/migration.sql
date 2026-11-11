-- Additive ownership facts only. No historical inference or repricing.
ALTER TABLE "CheckoutSession" ADD COLUMN "stripePlatformAccountId" TEXT, ADD COLUMN "stripeMode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripePlatformAccountId" TEXT, ADD COLUMN "stripeMode" TEXT;
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_stripe_identity_pair_check" CHECK (
  ("stripePlatformAccountId" IS NULL AND "stripeMode" IS NULL)
  OR ("stripePlatformAccountId" IS NOT NULL AND "stripeMode" IS NOT NULL AND "stripeMode" IN ('test','live'))
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_stripe_identity_pair_check" CHECK (
  ("stripePlatformAccountId" IS NULL AND "stripeMode" IS NULL)
  OR ("stripePlatformAccountId" IS NOT NULL AND "stripeMode" IS NOT NULL AND "stripeMode" IN ('test','live'))
);
CREATE TABLE "StripeAccountProvisioning" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "chargeModel" "StripeChargeModel" NOT NULL,
  "stripePlatformAccountId" TEXT NOT NULL,
  "stripeMode" TEXT NOT NULL,
  "parameters" JSONB NOT NULL,
  "stripeAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripeAccountProvisioning_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StripeAccountProvisioning_mode_check" CHECK ("stripeMode" IN ('test','live'))
);
CREATE UNIQUE INDEX "StripeAccountProvisioning_businessId_key" ON "StripeAccountProvisioning"("businessId");
CREATE UNIQUE INDEX "StripeAccountProvisioning_stripeAccountId_key" ON "StripeAccountProvisioning"("stripeAccountId");
