-- Additive only. No financial or historical records are touched.
CREATE TABLE "PublicRequestBudget" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublicRequestBudget_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "PublicRequestBudget_expiresAt_idx" ON "PublicRequestBudget"("expiresAt");
