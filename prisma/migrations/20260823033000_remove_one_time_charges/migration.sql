-- RFL is recurring-payment only.
-- Remove the obsolete one-time charge feature completely.

ALTER TABLE "CheckoutSession"
DROP COLUMN IF EXISTS "oneTimeChargeIds";

DROP TABLE IF EXISTS "OneTimeCharge";

DROP TYPE IF EXISTS "OneTimeChargeStatus";