-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('CREATED', 'REVIEWED', 'CHECKOUT_STARTED', 'PAID', 'FAILED', 'EXPIRED', 'ABANDONED');

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "recurringChargesCents" INTEGER NOT NULL,
    "initialLateFeeCents" INTEGER NOT NULL,
    "dailyLateFeesCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3) NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'CREATED',
    "stripeCheckoutSessionId" TEXT,
    "paymentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_stripeCheckoutSessionId_key" ON "CheckoutSession"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "CheckoutSession_businessId_idx" ON "CheckoutSession"("businessId");

-- CreateIndex
CREATE INDEX "CheckoutSession_accountCode_idx" ON "CheckoutSession"("accountCode");

-- CreateIndex
CREATE INDEX "CheckoutSession_planId_idx" ON "CheckoutSession"("planId");

-- CreateIndex
CREATE INDEX "CheckoutSession_billingCycle_idx" ON "CheckoutSession"("billingCycle");

-- CreateIndex
CREATE INDEX "CheckoutSession_status_idx" ON "CheckoutSession"("status");

-- CreateIndex
CREATE INDEX "CheckoutSession_expiresAt_idx" ON "CheckoutSession"("expiresAt");

-- CreateIndex
CREATE INDEX "CheckoutSession_businessId_unitNumber_billingCycle_idx" ON "CheckoutSession"("businessId", "unitNumber", "billingCycle");
