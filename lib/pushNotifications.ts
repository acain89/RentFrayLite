import { createHash } from "node:crypto";
import type { Payment, Prisma } from "@prisma/client";
export type AchPushKind = "PENDING" | "PAID";
export function achPushKind(method: string | null, state: string): AchPushKind | null {
  return method === "ACH" && (state === "PENDING" || state === "PAID") ? state : null;
}
export function achPushMessage(kind: string) {
  return kind === "PAID" ? "An ACH payment succeeded. This does not mean funds have reached your bank account. Open your dashboard for the current status."
    : "An ACH payment started processing. It is not a completed payment. Open your dashboard for the current status.";
}
// Called ONLY by the authenticated Stripe reconciler on an applied transition.
// Durable insert shares its transaction. No browser/provider calls in this path.
export async function queueAchPushEvent(tx: Prisma.TransactionClient, payment: Pick<Payment, "id" | "businessId" | "paymentMethod">, state: string, transitionKey: string) {
  const kind = achPushKind(payment.paymentMethod, state);
  if (!kind) return;
  const id = createHash("sha256").update("ach-push:" + payment.id + ":" + transitionKey).digest("hex");
  await tx.pushEvent.upsert({ where: { id }, create: { id, paymentId: payment.id, businessId: payment.businessId, kind, expiresAt: new Date(Date.now() + 86400000) }, update: {} });
}
