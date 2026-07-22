/*
  Warnings:

  - The values [CHOOSE_MODE] on the enum `SetupStep` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `mode` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `customPostingId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the `CatalogItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomPosting` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OneTimeChargeStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "SetupStep_new" AS ENUM ('VERIFY_EMAIL', 'CONFIGURE_RECURRING_TIERS', 'CONFIGURE_RECURRING_CHARGES', 'CONFIGURE_RECURRING_BILLING', 'REVIEW_RECURRING', 'CONNECT_STRIPE', 'CHOOSE_ACCOUNT_CODE', 'COMPLETE');
ALTER TABLE "Business" ALTER COLUMN "setupStep" DROP DEFAULT;
ALTER TABLE "Business" ALTER COLUMN "setupStep" TYPE "SetupStep_new" USING ("setupStep"::text::"SetupStep_new");
ALTER TYPE "SetupStep" RENAME TO "SetupStep_old";
ALTER TYPE "SetupStep_new" RENAME TO "SetupStep";
DROP TYPE "SetupStep_old";
ALTER TABLE "Business" ALTER COLUMN "setupStep" SET DEFAULT 'VERIFY_EMAIL';
COMMIT;

-- DropForeignKey
ALTER TABLE "CatalogItem" DROP CONSTRAINT "CatalogItem_businessId_fkey";

-- DropForeignKey
ALTER TABLE "CustomPosting" DROP CONSTRAINT "CustomPosting_businessId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_customPostingId_fkey";

-- DropIndex
DROP INDEX "Business_mode_idx";

-- DropIndex
DROP INDEX "Payment_customPostingId_idx";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "mode";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "customPostingId";

-- DropTable
DROP TABLE "CatalogItem";

-- DropTable
DROP TABLE "CustomPosting";

-- DropEnum
DROP TYPE "BusinessMode";

-- CreateTable
CREATE TABLE "OneTimeCharge" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "normalizedUnitNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "OneTimeChargeStatus" NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneTimeCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OneTimeCharge_businessId_status_idx" ON "OneTimeCharge"("businessId", "status");

-- CreateIndex
CREATE INDEX "OneTimeCharge_businessId_normalizedUnitNumber_status_idx" ON "OneTimeCharge"("businessId", "normalizedUnitNumber", "status");

-- CreateIndex
CREATE INDEX "OneTimeCharge_paymentId_idx" ON "OneTimeCharge"("paymentId");

-- AddForeignKey
ALTER TABLE "OneTimeCharge" ADD CONSTRAINT "OneTimeCharge_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeCharge" ADD CONSTRAINT "OneTimeCharge_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
