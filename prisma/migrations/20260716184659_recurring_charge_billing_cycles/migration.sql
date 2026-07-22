/*
  Warnings:

  - You are about to drop the column `effectiveDate` on the `RecurringCharge` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "RecurringCharge_recurringPlanId_effectiveDate_idx";

-- AlterTable
ALTER TABLE "RecurringCharge" DROP COLUMN "effectiveDate",
ADD COLUMN     "effectiveBillingCycle" TEXT,
ADD COLUMN     "endsAfterBillingCycle" TEXT,
ADD COLUMN     "sharedChargeGroupId" TEXT;

-- CreateIndex
CREATE INDEX "RecurringCharge_sharedChargeGroupId_idx" ON "RecurringCharge"("sharedChargeGroupId");

-- CreateIndex
CREATE INDEX "RecurringCharge_effectiveBillingCycle_idx" ON "RecurringCharge"("effectiveBillingCycle");

-- CreateIndex
CREATE INDEX "RecurringCharge_endsAfterBillingCycle_idx" ON "RecurringCharge"("endsAfterBillingCycle");
