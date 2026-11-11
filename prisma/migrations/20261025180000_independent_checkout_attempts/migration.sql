-- Preserve every historical row. NULL identities remain NULL for legacy payments.
ALTER TABLE "Payment" ADD COLUMN "checkoutAttemptId" TEXT;
CREATE UNIQUE INDEX "Payment_checkoutAttemptId_key" ON "Payment"("checkoutAttemptId");

-- Independent checkouts may share property, tier, unit, payer and billing month.
DROP INDEX "Payment_active_recurring_obligation_unique";
