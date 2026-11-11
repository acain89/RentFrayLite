-- Existing properties retain unknown preferences/consent. Only future inserts default ON.
ALTER TABLE "Business" ADD COLUMN "paymentSmsEnabled" BOOLEAN,
 ADD COLUMN "smsConsentAt" TIMESTAMP(3), ADD COLUMN "smsConsentVersion" TEXT, ADD COLUMN "smsConsentPhone" TEXT;
ALTER TABLE "Business" ALTER COLUMN "paymentSmsEnabled" SET DEFAULT true;
ALTER TABLE "CheckoutSession" ADD COLUMN "smsConsentAt" TIMESTAMP(3), ADD COLUMN "smsConsentVersion" TEXT;
CREATE TABLE "SmsNotification" (
 "id" TEXT PRIMARY KEY, "paymentId" TEXT NOT NULL, "transitionKey" TEXT NOT NULL,
 "recipientType" TEXT NOT NULL, "eventType" TEXT NOT NULL, "paymentState" TEXT NOT NULL,
 "phone" TEXT NOT NULL, "phoneHash" TEXT NOT NULL, "body" TEXT NOT NULL,
 "consentVersion" TEXT, "consentAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "reasonCode" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "claimedAt" TIMESTAMP(3), "providerMessageId" TEXT, "callbackToken" TEXT NOT NULL,
 "sentAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SmsNotification_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SmsNotification_recipient_check" CHECK ("recipientType" IN ('TENANT','MANAGEMENT')),
 CONSTRAINT "SmsNotification_event_check" CHECK ("eventType" IN ('PENDING','SUCCESSFUL','FAILED')),
 CONSTRAINT "SmsNotification_status_check" CHECK ("status" IN ('QUEUED','SENDING','SENT','DELIVERED','FAILED','SUPPRESSED','AMBIGUOUS')),
 CONSTRAINT "SmsNotification_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "SmsNotification_paymentId_recipientType_transitionKey_key" ON "SmsNotification"("paymentId","recipientType","transitionKey");
CREATE UNIQUE INDEX "SmsNotification_providerMessageId_key" ON "SmsNotification"("providerMessageId");
CREATE UNIQUE INDEX "SmsNotification_callbackToken_key" ON "SmsNotification"("callbackToken");
CREATE INDEX "SmsNotification_status_nextAttemptAt_idx" ON "SmsNotification"("status","nextAttemptAt");
CREATE INDEX "SmsNotification_phoneHash_status_idx" ON "SmsNotification"("phoneHash","status");
CREATE TABLE "SmsSuppression" ("phoneHash" TEXT PRIMARY KEY, "reasonCode" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
