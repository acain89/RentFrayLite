-- Additive, dormant journal only. No historical data changes.
CREATE TABLE "InstantPayoutRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "authorizationSessionId" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "stripeMode" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "pricingVersion" TEXT NOT NULL,
    "selectedAmountCents" INTEGER NOT NULL,
    "rflFeeCents" INTEGER NOT NULL,
    "expectedReceivedCents" INTEGER NOT NULL,
    "eligibleFundsCents" INTEGER NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "evidenceObservedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "stripePayoutId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "errorCode" TEXT,
    "lastObservedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstantPayoutRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstantPayoutRequest_idempotencyKey_key" ON "InstantPayoutRequest"("idempotencyKey");
CREATE UNIQUE INDEX "InstantPayoutRequest_stripePayoutId_key" ON "InstantPayoutRequest"("stripePayoutId");
CREATE INDEX "InstantPayoutRequest_businessId_createdAt_idx" ON "InstantPayoutRequest"("businessId", "createdAt");
ALTER TABLE "InstantPayoutRequest" ADD CONSTRAINT "InstantPayoutRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstantPayoutRequest" ADD CONSTRAINT "InstantPayoutRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstantPayoutRequest" ADD CONSTRAINT "InstantPayoutRequest_safety_check" CHECK (
  "stripeMode" IN ('test','live') AND "currency" = 'usd' AND "pricingVersion" = 'RFL_INSTANT_250_BPS_V1'
  AND "platformAccountId" <> "connectedAccountId"
  AND "selectedAmountCents" > 0 AND "eligibleFundsCents" >= "selectedAmountCents"
  AND "rflFeeCents" = (("selectedAmountCents"::bigint + 20) / 40)
  AND "expectedReceivedCents" = "selectedAmountCents" - "rflFeeCents"
  AND "status" IN ('RESERVED','SENDING','AMBIGUOUS','PENDING','PAID','FAILED','EXCEPTION')
);
