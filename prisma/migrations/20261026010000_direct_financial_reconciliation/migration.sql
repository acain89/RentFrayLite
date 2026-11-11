-- Additive journal only. Existing Payment rows and historical snapshots are untouched.
CREATE TYPE "DirectReconciliationStatus" AS ENUM ('WAITING_DATA','REQUIRED','CORRECTED','RECONCILED','EXCEPTION');
CREATE TABLE "DirectFinancialReconciliation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "status" "DirectReconciliationStatus" NOT NULL DEFAULT 'WAITING_DATA',
  "reasonCode" TEXT,
  "refreshRequested" BOOLEAN NOT NULL DEFAULT false,
  "expectedSnapshot" JSONB NOT NULL,
  "initialObservation" JSONB,
  "latestObservation" JSONB,
  "applicationFeeId" TEXT,
  "actualProcessorFeeCents" INTEGER,
  "observedManagementNetCents" INTEGER,
  "correctionCents" INTEGER NOT NULL DEFAULT 0,
  "confirmedCorrectionCents" INTEGER NOT NULL DEFAULT 0,
  "unresolvedShortfallCents" INTEGER,
  "idempotencyKey" TEXT,
  "reservedAt" TIMESTAMP(3),
  "stripeRefundId" TEXT,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectFinancialReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DirectFinancialReconciliation_amounts_check" CHECK (
    "correctionCents" >= 0 AND "confirmedCorrectionCents" >= 0 AND "confirmedCorrectionCents" <= "correctionCents" AND
    ("unresolvedShortfallCents" IS NULL OR "unresolvedShortfallCents" >= 0) AND
    ("actualProcessorFeeCents" IS NULL OR "actualProcessorFeeCents" >= 0)),
  CONSTRAINT "DirectFinancialReconciliation_reservation_check" CHECK (
    ("reservedAt" IS NULL AND "idempotencyKey" IS NULL AND "correctionCents" = 0 AND "stripeRefundId" IS NULL) OR
    ("reservedAt" IS NOT NULL AND "idempotencyKey" IS NOT NULL AND "correctionCents" > 0)),
  CONSTRAINT "DirectFinancialReconciliation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DirectFinancialReconciliation_paymentId_key" ON "DirectFinancialReconciliation"("paymentId");
CREATE UNIQUE INDEX "DirectFinancialReconciliation_applicationFeeId_key" ON "DirectFinancialReconciliation"("applicationFeeId");
CREATE UNIQUE INDEX "DirectFinancialReconciliation_idempotencyKey_key" ON "DirectFinancialReconciliation"("idempotencyKey");
CREATE UNIQUE INDEX "DirectFinancialReconciliation_stripeRefundId_key" ON "DirectFinancialReconciliation"("stripeRefundId");
CREATE INDEX "DirectFinancialReconciliation_status_updatedAt_idx" ON "DirectFinancialReconciliation"("status","updatedAt");
