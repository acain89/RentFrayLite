-- Additive observations only; existing Payment rows/snapshots are untouched.
CREATE TABLE "CustomerRefundObservation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "stripeRefundId" TEXT NOT NULL,
  "stripePlatformAccountId" TEXT NOT NULL,
  "stripeAccountId" TEXT NOT NULL,
  "stripeMode" TEXT NOT NULL,
  "chargeModel" "StripeChargeModel",
  "pricingVersion" TEXT,
  "stripeChargeId" TEXT NOT NULL,
  "stripePaymentIntentId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerRefundObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerRefund_amount_check" CHECK ("amountCents" > 0),
  CONSTRAINT "CustomerRefund_currency_check" CHECK ("currency" = 'usd'),
  CONSTRAINT "CustomerRefund_mode_check" CHECK ("stripeMode" IN ('test','live')),
  CONSTRAINT "CustomerRefund_status_check" CHECK ("status" IN ('pending','requires_action','succeeded','failed','canceled'))
);
CREATE UNIQUE INDEX "CustomerRefund_scope_identity_key" ON "CustomerRefundObservation"("stripePlatformAccountId","stripeAccountId","stripeMode","stripeRefundId");
CREATE INDEX "CustomerRefundObservation_paymentId_status_idx" ON "CustomerRefundObservation"("paymentId","status");
ALTER TABLE "CustomerRefundObservation" ADD CONSTRAINT "CustomerRefundObservation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
