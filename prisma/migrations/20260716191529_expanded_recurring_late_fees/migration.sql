ALTER TABLE "RecurringPlan"
ADD COLUMN "initialLateFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dailyLateFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dailyLateFeeMaxDays" INTEGER NOT NULL DEFAULT 0;

UPDATE "RecurringPlan"
SET "initialLateFeeCents" =
  CASE
    WHEN "lateFeeType" = 'FLAT'
      THEN "lateFeeAmountCents"
    ELSE 0
  END;

ALTER TABLE "RecurringPlan"
DROP COLUMN "lateFeeType",
DROP COLUMN "lateFeeAmountCents";

ALTER TABLE "RecurringPlan"
ALTER COLUMN "gracePeriodDays" SET DEFAULT 1;

DROP TYPE "LateFeeType";