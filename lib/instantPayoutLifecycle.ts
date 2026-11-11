import { Prisma, type PrismaClient, type InstantPayoutRequest } from "@prisma/client";
import type Stripe from "stripe";
import { withManagerMutation, type ManagerMutationIdentity } from "@/lib/managerMutation";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { requireInstantPayoutProof, type InstantPayoutReadiness } from "@/lib/instantPayoutReadiness";
import { quoteInstantPayout } from "@/lib/instantPayoutPolicy";
import { validateStripePaymentIdentity, type StripePaymentIdentity } from "@/lib/stripePaymentContext";

const requireSafe = (ok: unknown): void => { if (!ok) throw Error("Instant Payout ownership or snapshot unverified."); };
export const instantPayoutIdempotencyKey = (requestId: string) => {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) throw Error("Invalid payout request identity.");
  return `rfl-instant-v1:${requestId}`;
};

/** Dormant, internal preparation only. No public caller, no Stripe mutation.
 * Existing management lock/session revalidation serializes duplicate requests.
 * Client request IDs are not authorization; identity comes from server session.
 */
export async function reserveInstantPayout(request: Request, identity: ManagerMutationIdentity,
  requestId: string, report: InstantPayoutReadiness) {
  requireCredentialOrigin(request);
  requireInstantPayoutProof(report);
  const idempotencyKey = instantPayoutIdempotencyKey(requestId);
  const q = quoteInstantPayout(report.quote.selectedAmountCents);
  requireSafe(q.pricingVersion === report.quote.pricingVersion && q.feeCents === report.quote.feeCents &&
    q.estimatedReceivedCents === report.quote.estimatedReceivedCents);
  return withManagerMutation(identity, async tx => {
    const business = await tx.business.findUnique({ where: { id: identity.businessId! } });
    const connection = await tx.stripeConnection.findUnique({ where: { businessId: identity.businessId! } });
    requireSafe(business?.isActive && business.status === "ACTIVE" && connection?.stripeAccountId === report.connectedAccountId);
    requireInstantPayoutProof(report);
    const existing = await tx.instantPayoutRequest.findUnique({ where: { id: requestId } });
    if (existing) {
      requireSafe(existing.managerId === identity.managerId && existing.businessId === identity.businessId &&
        existing.platformAccountId === report.platformAccountId && existing.connectedAccountId === report.connectedAccountId &&
        existing.stripeMode === report.mode && existing.destinationId === report.destinationId &&
        existing.selectedAmountCents === q.selectedAmountCents && existing.rflFeeCents === q.feeCents &&
        existing.expectedReceivedCents === q.estimatedReceivedCents && existing.pricingVersion === q.pricingVersion &&
        existing.idempotencyKey === idempotencyKey);
      return existing;
    }
    return tx.instantPayoutRequest.create({ data: {
      id: requestId, businessId: identity.businessId!, managerId: identity.managerId!, authorizationSessionId: identity.id,
      platformAccountId: report.platformAccountId, connectedAccountId: report.connectedAccountId, stripeMode: report.mode,
      destinationId: report.destinationId, currency: "usd", selectedAmountCents: q.selectedAmountCents,
      rflFeeCents: q.feeCents, expectedReceivedCents: q.estimatedReceivedCents, pricingVersion: q.pricingVersion,
      idempotencyKey, evidenceReference: report.evidenceReference!, eligibleFundsCents: report.availableCents,
      evidenceObservedAt: new Date(report.observedAt), status: "RESERVED",
    } });
  });
}

/** Recovery is observation only. No creation/recreation, even if a list is empty.
 * Future dispatch must atomically mark SENDING before its single external call.
 * This stage intentionally supplies no dispatcher/claim or scheduled worker.
 */
export async function recoverInstantPayout(prisma: PrismaClient, stripe: Stripe, requestId: string,
  identity: StripePaymentIdentity, credentialMode: "test" | "live" | "unknown") {
  const original = await prisma.instantPayoutRequest.findUnique({ where: { id: requestId } });
  requireSafe(original && original.platformAccountId === identity.platformAccountId && original.stripeMode === identity.mode);
  if (!original || original.status === "RESERVED") throw Error("No payout dispatch exists to recover.");
  const read = { timeout: 5000, maxNetworkRetries: 0 }, scoped = { ...read, stripeAccount: original.connectedAccountId };
  // Snapshot account scope: never the business's current Stripe connection.
  const [platform, platformBalance, balance] = await Promise.all([
    stripe.accounts.retrieve(read), stripe.balance.retrieve({}, read), stripe.balance.retrieve({}, scoped),
  ]);
  validateStripePaymentIdentity(identity, { platformAccountId: platform.id, livemode: platformBalance.livemode, credentialMode });
  requireSafe(balance.livemode === (identity.mode === "live"));
  let payout: Stripe.Payout | undefined;
  if (original.stripePayoutId) payout = await stripe.payouts.retrieve(original.stripePayoutId, {}, scoped);
  else {
    const page = await stripe.payouts.list({ limit: 100 }, scoped);
    const matches = page.data.filter(p => p.metadata?.rflPayoutRequestId === requestId);
    if (page.has_more || matches.length !== 1) return mark(prisma, original, "AMBIGUOUS", "PAYOUT_CREATION_UNCONFIRMED");
    payout = matches[0];
  }
  const valid = payout.id.startsWith("po_") && payout.livemode === (identity.mode === "live") &&
    payout.method === "instant" && payout.automatic === false && payout.currency === original.currency &&
    payout.amount === original.expectedReceivedCents &&
    (typeof payout.destination === "string" ? payout.destination : payout.destination?.id) === original.destinationId &&
    payout.metadata?.rflPayoutRequestId === requestId && payout.metadata?.rflBusinessId === original.businessId &&
    payout.metadata?.rflPlatformAccountId === original.platformAccountId &&
    payout.metadata?.rflConnectedAccountId === original.connectedAccountId &&
    payout.metadata?.rflPricingVersion === original.pricingVersion &&
    payout.metadata?.rflIdempotencyKey === original.idempotencyKey &&
    (!original.stripePayoutId || payout.id === original.stripePayoutId);
  if (!valid) return mark(prisma, original, "EXCEPTION", "PAYOUT_OWNERSHIP_OR_AMOUNT_MISMATCH");
  const state = payout.status === "paid" ? "PAID" : payout.status === "failed" || payout.status === "canceled" ? "FAILED" : "PENDING";
  // Do not record a fee as collected from a pending/paid payout alone. Stripe's
  // application-fee and failure-reversal records need a separate activation review.
  return mark(prisma, original, state, state === "PAID" ? "PAYOUT_FEE_COLLECTION_UNVERIFIED" : null, payout.id);
}

async function mark(prisma: PrismaClient, original: InstantPayoutRequest,
  status: "AMBIGUOUS" | "EXCEPTION" | "PENDING" | "PAID" | "FAILED", errorCode: string | null, payoutId?: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InstantPayoutRequest" WHERE "id" = ${original.id} FOR UPDATE`);
    const row = await tx.instantPayoutRequest.findUnique({ where: { id: original.id } });
    const immutable = ["id", "businessId", "managerId", "authorizationSessionId", "idempotencyKey", "platformAccountId",
      "connectedAccountId", "stripeMode", "destinationId", "currency", "pricingVersion", "selectedAmountCents",
      "rflFeeCents", "expectedReceivedCents", "eligibleFundsCents", "evidenceReference"] as const;
    requireSafe(row && immutable.every(key => row[key] === original[key]) &&
      row.evidenceObservedAt.getTime() === original.evidenceObservedAt.getTime() &&
      (!row.stripePayoutId || row.stripePayoutId === payoutId || !payoutId));
    if (!row) throw Error("Missing payout request.");
    // Paid can legitimately fail later. Stale pending/missing responses cannot
    // erase terminal observations. Exceptions require controlled review.
    if (row.status === "EXCEPTION" || ((row.status === "PAID" || row.status === "FAILED") &&
        (status === "PENDING" || status === "AMBIGUOUS" || (row.status === "FAILED" && status === "PAID")))) return row;
    return tx.instantPayoutRequest.update({ where: { id: row.id }, data: {
      status, errorCode, ...(payoutId ? { stripePayoutId: payoutId } : {}), lastObservedAt: new Date(),
    } });
  });
}
