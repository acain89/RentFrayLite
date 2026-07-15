-- CreateEnum
CREATE TYPE "BusinessMode" AS ENUM ('RECURRING', 'PRODUCTS_SERVICES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('SETUP', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'CHECKOUT_STARTED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'DISPUTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ACH', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentSourceType" AS ENUM ('RECURRING_PLAN', 'CATALOG_ITEM', 'CUSTOM_POSTING');

-- CreateEnum
CREATE TYPE "LateFeeType" AS ENUM ('NONE', 'FLAT');

-- CreateEnum
CREATE TYPE "CustomPostingStatus" AS ENUM ('ACTIVE', 'CHECKOUT_STARTED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SmsReceiptStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "AdminAccess" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountCodeLockedAt" TIMESTAMP(3),
    "mode" "BusinessMode",
    "status" "BusinessStatus" NOT NULL DEFAULT 'SETUP',
    "ownerName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manager" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "requirementsDue" BOOLEAN NOT NULL DEFAULT false,
    "requirementsSummary" TEXT,
    "readyForLive" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPlan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "lateFeeType" "LateFeeType" NOT NULL DEFAULT 'NONE',
    "lateFeeAmountCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringCharge" (
    "id" TEXT NOT NULL,
    "recurringPlanId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomPosting" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" "CustomPostingStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceType" "PaymentSourceType" NOT NULL,
    "sourceId" TEXT,
    "customPostingId" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "paymentMethod" "PaymentMethod",
    "payerFirstName" TEXT NOT NULL,
    "payerLastName" TEXT NOT NULL,
    "payerPhone" TEXT NOT NULL,
    "payerEmail" TEXT,
    "referenceLabel" TEXT,
    "itemDescription" TEXT NOT NULL,
    "lineItemsSnapshot" JSONB NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "processorFeeCents" INTEGER,
    "totalChargedCents" INTEGER NOT NULL,
    "businessProceedsCents" INTEGER,
    "billingCycle" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "checkoutStartedAt" TIMESTAMP(3),
    "pendingAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsReceipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "SmsReceiptStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "failureMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_accountCode_key" ON "Business"("accountCode");

-- CreateIndex
CREATE INDEX "Business_status_idx" ON "Business"("status");

-- CreateIndex
CREATE INDEX "Business_mode_idx" ON "Business"("mode");

-- CreateIndex
CREATE INDEX "Business_contactEmail_idx" ON "Business"("contactEmail");

-- CreateIndex
CREATE INDEX "Business_isActive_idx" ON "Business"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_businessId_key" ON "Manager"("businessId");

-- CreateIndex
CREATE INDEX "Manager_email_idx" ON "Manager"("email");

-- CreateIndex
CREATE INDEX "Manager_isActive_idx" ON "Manager"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_businessId_email_key" ON "Manager"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnection_businessId_key" ON "StripeConnection"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnection_stripeAccountId_key" ON "StripeConnection"("stripeAccountId");

-- CreateIndex
CREATE INDEX "StripeConnection_readyForLive_idx" ON "StripeConnection"("readyForLive");

-- CreateIndex
CREATE INDEX "StripeConnection_onboardingComplete_idx" ON "StripeConnection"("onboardingComplete");

-- CreateIndex
CREATE INDEX "RecurringPlan_businessId_sortOrder_idx" ON "RecurringPlan"("businessId", "sortOrder");

-- CreateIndex
CREATE INDEX "RecurringPlan_businessId_isActive_idx" ON "RecurringPlan"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringPlan_businessId_name_key" ON "RecurringPlan"("businessId", "name");

-- CreateIndex
CREATE INDEX "RecurringCharge_recurringPlanId_isActive_idx" ON "RecurringCharge"("recurringPlanId", "isActive");

-- CreateIndex
CREATE INDEX "RecurringCharge_recurringPlanId_effectiveDate_idx" ON "RecurringCharge"("recurringPlanId", "effectiveDate");

-- CreateIndex
CREATE INDEX "RecurringCharge_recurringPlanId_sortOrder_idx" ON "RecurringCharge"("recurringPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "CatalogItem_businessId_sortOrder_idx" ON "CatalogItem"("businessId", "sortOrder");

-- CreateIndex
CREATE INDEX "CatalogItem_businessId_isActive_idx" ON "CatalogItem"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_businessId_name_key" ON "CatalogItem"("businessId", "name");

-- CreateIndex
CREATE INDEX "CustomPosting_businessId_status_idx" ON "CustomPosting"("businessId", "status");

-- CreateIndex
CREATE INDEX "CustomPosting_businessId_expiresAt_idx" ON "CustomPosting"("businessId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeChargeId_key" ON "Payment"("stripeChargeId");

-- CreateIndex
CREATE INDEX "Payment_businessId_createdAt_idx" ON "Payment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_businessId_status_idx" ON "Payment"("businessId", "status");

-- CreateIndex
CREATE INDEX "Payment_businessId_billingCycle_idx" ON "Payment"("businessId", "billingCycle");

-- CreateIndex
CREATE INDEX "Payment_businessId_sourceType_sourceId_idx" ON "Payment"("businessId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsReceipt_paymentId_key" ON "SmsReceipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsReceipt_providerMessageId_key" ON "SmsReceipt"("providerMessageId");

-- CreateIndex
CREATE INDEX "SmsReceipt_status_idx" ON "SmsReceipt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_businessId_type_idx" ON "VerificationToken"("businessId", "type");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_idx" ON "AuditLog"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeConnection" ADD CONSTRAINT "StripeConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPlan" ADD CONSTRAINT "RecurringPlan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCharge" ADD CONSTRAINT "RecurringCharge_recurringPlanId_fkey" FOREIGN KEY ("recurringPlanId") REFERENCES "RecurringPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomPosting" ADD CONSTRAINT "CustomPosting_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customPostingId_fkey" FOREIGN KEY ("customPostingId") REFERENCES "CustomPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsReceipt" ADD CONSTRAINT "SmsReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
