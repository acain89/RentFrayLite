-- Additive only: preserve all accounts, password hashes, sessions and prior tokens.
ALTER TABLE "VerificationToken" ADD COLUMN "credentialFingerprint" TEXT;
CREATE INDEX "AuditLog_action_targetId_createdAt_idx" ON "AuditLog"("action","targetId","createdAt");
