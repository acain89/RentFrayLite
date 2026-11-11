-- Dormant, additive calendar facts only. No defaults or historical backfill.
-- firstStandardBillingDate is a property-local calendar date, not an instant.
ALTER TABLE "Business"
  ADD COLUMN "propertyTimeZone" TEXT,
  ADD COLUMN "firstStandardBillingDate" DATE;
