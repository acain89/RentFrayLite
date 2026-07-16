-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('MANAGER', 'ADMIN');

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "businessId" TEXT,
    "managerId" TEXT,
    "adminAccessId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_businessId_idx" ON "Session"("businessId");

-- CreateIndex
CREATE INDEX "Session_managerId_idx" ON "Session"("managerId");

-- CreateIndex
CREATE INDEX "Session_adminAccessId_idx" ON "Session"("adminAccessId");

-- CreateIndex
CREATE INDEX "Session_type_expiresAt_idx" ON "Session"("type", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminAccess_isActive_idx" ON "AdminAccess"("isActive");

-- CreateIndex
CREATE INDEX "CustomPosting_status_expiresAt_idx" ON "CustomPosting"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Payment_customPostingId_idx" ON "Payment"("customPostingId");

-- CreateIndex
CREATE INDEX "VerificationToken_type_expiresAt_idx" ON "VerificationToken"("type", "expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminAccessId_fkey" FOREIGN KEY ("adminAccessId") REFERENCES "AdminAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
