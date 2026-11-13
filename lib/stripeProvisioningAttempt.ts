import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { z } from "zod";

const ref = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const requestId = z.string().regex(/^req_[A-Za-z0-9]{1,100}$/);
const attemptSchema = z.object({ id: ref, kind: z.enum(["LEGACY", "REPLACEMENT"]),
  startedAt: z.iso.datetime(), state: z.enum(["READY", "IN_FLIGHT", "UNCONFIRMED"]), calls: z.number().int().min(0).max(1000000), pendingCalls: z.number().int().min(0).max(1000000), lastRequestId: requestId.optional() }).strict();
const envelopeSchema = z.object({ rflProvisioningVersion: z.literal(1), request: z.custom<Stripe.AccountCreateParams>(
  value => !!value && typeof value === "object" && !Array.isArray(value)), attempt: attemptSchema }).strict();
export type ProvisioningAttempt = z.infer<typeof attemptSchema>;
export const STRIPE_CREATE_REPLAY_MS = 23 * 60 * 60 * 1000;

/** Deterministic JSON for signatures/digests. Never log the input or digest. */
export function provisioningCanonicalJson(value: unknown, depth = 0): string {
  if (depth > 12) throw Error("Invalid provisioning data.");
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(v => provisioningCanonicalJson(v, depth + 1)).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ":" + provisioningCanonicalJson((value as Record<string, unknown>)[key], depth + 1)).join(",") + "}";
  throw Error("Invalid provisioning data.");
}
export function provisioningRequestDigest(request: Stripe.AccountCreateParams) {
  return createHash("sha256").update(provisioningCanonicalJson(request)).digest("hex");
}
export function readProvisioningAttempt(row: { id: string; parameters: unknown; createdAt: Date }) {
  if (Buffer.byteLength(provisioningCanonicalJson(row.parameters)) > 16384) throw Error("Invalid provisioning data.");
  const raw = row.parameters;
  if (raw && typeof raw === "object" && Object.hasOwn(raw, "rflProvisioningVersion")) {
    const envelope = envelopeSchema.parse(raw);
    if (envelope.attempt.pendingCalls > envelope.attempt.calls ||
        (envelope.attempt.pendingCalls > 0 && envelope.attempt.state !== "IN_FLIGHT") ||
        (envelope.attempt.state === "IN_FLIGHT" && envelope.attempt.pendingCalls === 0) ||
        (envelope.attempt.kind === "LEGACY" && envelope.attempt.id !== row.id)) throw Error("Invalid provisioning data.");
    // The legacy row creation clock is authoritative; JSON cannot extend it.
    return { request: envelope.request, attempt: { ...envelope.attempt,
      ...(envelope.attempt.kind === "LEGACY" ? { startedAt: row.createdAt.toISOString() } : {}) } };
  }
  return { request: raw as Stripe.AccountCreateParams, attempt: {
    id: row.id, kind: "LEGACY" as const, startedAt: row.createdAt.toISOString(), state: "READY" as const, calls: 0, pendingCalls: 0,
  } as ProvisioningAttempt };
}
export function provisioningAttemptKey(journalId: string, attempt: ProvisioningAttempt) {
  return attempt.kind === "LEGACY" ? `rfl-connect-v1-${journalId}` : `rfl-connect-v2-${journalId}-${attempt.id}`;
}
export function storeProvisioningAttempt(request: Stripe.AccountCreateParams, attempt: ProvisioningAttempt) {
  return { rflProvisioningVersion: 1, request, attempt };
}
export function safeStripeRequestId(error: unknown): string | undefined {
  try { const parsed = requestId.safeParse((error as { requestId?: unknown })?.requestId); return parsed.success ? parsed.data : undefined; }
  catch { return undefined; }
}
