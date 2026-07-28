-- AlterTable
ALTER TABLE "CheckoutSession" ADD COLUMN     "oneTimeChargeIds" JSONB;

-- DropEnum
DROP TYPE "CustomPostingStatus";
