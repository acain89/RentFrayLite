import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { withAdminMutation } from "@/lib/adminMutation";
import type { SessionAuthority } from "@/lib/sessionAuthority";
import { readProvisioningAttempt, provisioningAttemptKey, provisioningRequestDigest,
  storeProvisioningAttempt } from "@/lib/stripeProvisioningAttempt";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const requestId = z.string().regex(/^req_[A-Za-z0-9]{1,100}$/);
const approvalSchema = z.object({
  version: z.literal(1), purpose: z.literal("RFL_CONNECT_CONFIRMED_REJECTION_RETRY"),
  approvalId: z.uuid(),
  businessId: id, journalId: id, expectedAttemptId: id,
  expectedCalls: z.number().int().min(0).max(1000000), expectedPendingCalls: z.literal(0),
  expectedOutcome: z.enum(["LEGACY_UNRECORDED", "UNCONFIRMED"]), expectedKey: z.string().min(1).max(255), expectedLastRequestId: requestId.nullable(),
  platformAccountId: z.string().regex(/^acct_[A-Za-z0-9]{1,100}$/),
  mode: z.enum(["live", "test"]), profile: z.enum(["LEGACY_DESTINATION", "DIRECT"]),
  parametersDigest: z.string().regex(/^[a-f0-9]{64}$/),
  rejectedRequestId: requestId, evidenceKind: z.literal("PROVIDER_VERIFIED_NO_CREATION"),
  evidenceReference: z.string().regex(/^ev_[A-Za-z0-9_-]{1,100}$/),
  terminalRejectionConfirmed: z.literal(true), allRequestsUnderKeyVerified: z.literal(true), configurationCorrected: z.literal(true),
  issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
}).strict();
type Denial = "APPROVAL_INVALID" | "APPROVAL_EXPIRED" | "TARGET_UNAVAILABLE" | "STALE_APPROVAL" | "IDENTITY_MISMATCH" | "REQUEST_MISMATCH" | "STATE_INVALID";
export class ConnectRecoveryRejected extends Error {
  constructor(readonly code: Denial) { super("Connect recovery was not authorized."); }
}

function parseApproval(text: string) {
  try {
    if (Buffer.byteLength(text) > 16384) throw Error();
    return approvalSchema.parse(JSON.parse(text));
  } catch { throw new ConnectRecoveryRejected("APPROVAL_INVALID"); }
}

/** Trusted maintenance host only; no HTTP route imports this function.
 * ADMIN authority authorizes an operator's evidence attestation, not provider
 * facts. Independently review the referenced no-creation evidence first.
 * Preview is read-only. Apply prepares an attempt; neither calls Stripe.
 */
export async function prepareConfirmedStripeRejectionRetry(approvalText: string, operator: SessionAuthority, apply = false) {
  if (typeof apply !== "boolean") throw new ConnectRecoveryRejected("APPROVAL_INVALID");
  const approval = parseApproval(approvalText);
  const authority = structuredClone(operator);
  const decision = await withAdminMutation(authority, approval.businessId, async tx => {
    // AdminAccess -> Session -> Business already locked by withAdminMutation.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StripeAccountProvisioning" WHERE "id" = ${approval.journalId} FOR UPDATE`);
    const business = await tx.business.findUnique({ where: { id: approval.businessId } });
    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
    async function audit(result: "PREPARED" | "REUSED" | Denial, metadata: Prisma.InputJsonObject = {}) {
      if (!apply) return;
      await tx.auditLog.create({ data: {
        businessId: business ? approval.businessId : null, actorType: "ADMIN", actorId: authority.adminAccessId,
        action: "STRIPE_PROVISIONING_RETRY_DECISION", targetType: "STRIPE_ACCOUNT_PROVISIONING", targetId: approval.journalId,
        summary: "Operator-controlled account-create retry decision.",
        metadata: { decision: result, approvalId: approval.approvalId, expectedAttemptId: approval.expectedAttemptId,
          rejectedRequestId: approval.rejectedRequestId, evidenceReference: approval.evidenceReference, ...metadata },
      } });
    }
    async function deny(code: Denial) { await audit(code); return { status: "REJECTED" as const, code }; }
    const issuedAt = Date.parse(approval.issuedAt), expiresAt = Date.parse(approval.expiresAt);
    if (!Number.isFinite(now.getTime()) || issuedAt > now.getTime() || expiresAt <= now.getTime() ||
        expiresAt <= issuedAt || expiresAt - issuedAt > 15 * 60 * 1000) return deny("APPROVAL_EXPIRED");
    if (!business) return deny("TARGET_UNAVAILABLE");
    const existing = await tx.stripeConnection.findUnique({ where: { businessId: approval.businessId } });
    if (existing) { await audit("REUSED"); return { status: "EXISTING_ACCOUNT" as const }; }
    const row = await tx.stripeAccountProvisioning.findUnique({ where: { id: approval.journalId } });
    if (!row || row.businessId !== approval.businessId) return deny("TARGET_UNAVAILABLE");
    if (row.stripeAccountId) { await audit("REUSED"); return { status: "EXISTING_ACCOUNT" as const }; }
    if (row.stripePlatformAccountId !== approval.platformAccountId || row.stripeMode !== approval.mode || row.chargeModel !== approval.profile)
      return deny("IDENTITY_MISMATCH");
    let state: ReturnType<typeof readProvisioningAttempt>;
    try { state = readProvisioningAttempt(row); } catch { return deny("STATE_INVALID"); }
    if (state.attempt.id !== approval.expectedAttemptId || state.attempt.calls !== approval.expectedCalls || provisioningAttemptKey(row.id, state.attempt) !== approval.expectedKey ||
        (state.attempt.lastRequestId ?? null) !== approval.expectedLastRequestId) return deny("STALE_APPROVAL");
    if (state.attempt.pendingCalls !== 0 || (state.attempt.state !== "UNCONFIRMED" &&
        !(state.attempt.kind === "LEGACY" && state.attempt.calls === 0))) return deny("STATE_INVALID");
    const observedOutcome = state.attempt.kind === "LEGACY" && state.attempt.calls === 0 ? "LEGACY_UNRECORDED" : state.attempt.state;
    if (approval.expectedOutcome !== observedOutcome || approval.expectedPendingCalls !== state.attempt.pendingCalls) return deny("STALE_APPROVAL");
    const metadata = state.request?.metadata;
    if (!metadata || metadata.rflBusinessId !== row.businessId || metadata.rflProvisioningId !== row.id ||
        metadata.product !== "RentFrayLite" || metadata.rflProvisioningModel !== row.chargeModel ||
        provisioningRequestDigest(state.request) !== approval.parametersDigest) return deny("REQUEST_MISMATCH");
    if (!apply) return { status: "VERIFIED_PREVIEW" as const, attemptId: state.attempt.id };
    const attempt = { id: randomUUID(), kind: "REPLACEMENT" as const, startedAt: now.toISOString(), state: "READY" as const, calls: 0, pendingCalls: 0 };
    await tx.stripeAccountProvisioning.update({ where: { id: row.id }, data: {
      parameters: storeProvisioningAttempt(state.request, attempt) as unknown as Prisma.InputJsonValue,
    } });
    await audit("PREPARED", { replacementAttemptId: attempt.id, evidenceKind: approval.evidenceKind,
      previousOutcome: "OPERATOR_CONFIRMED_NO_CREATION" });
    return { status: "PREPARED" as const, attemptId: attempt.id };
  });
  // Rejected decisions are committed/audited before an error reaches the caller.
  if (decision.status === "REJECTED") throw new ConnectRecoveryRejected(decision.code);
  return decision;
}
