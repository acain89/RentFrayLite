import { randomUUID } from "node:crypto";
import * as webPush from "web-push";
import { prisma } from "@/lib/prisma";
import { isActiveManagerSession } from "@/lib/sessionAuthority";
import { pushEndpoint } from "@/lib/pushSubscription";
import { achPushMessage } from "@/lib/pushNotifications";
// At-least-once delivery: a crash after acceptance may retry. Stable notification
// tags replace duplicates on devices; payment/outbox state remains idempotent.
export async function processPushQueue(limit = 20) {
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY, subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("Push configuration unavailable.");
  const now = new Date();
  const events = await prisma.pushEvent.findMany({ where: { dispatchedAt: null }, orderBy: { createdAt: "asc" }, take: limit });
  for (const event of events) await prisma.$transaction(async tx => {
    // Never backfill to a device enrolled after the event.
    const subscriptions = event.expiresAt > now ? await tx.managerPushSubscription.findMany({ where: { businessId: event.businessId, active: true, createdAt: { lte: event.createdAt } }, select: { id: true } }) : [];
    if (subscriptions.length) await tx.pushDelivery.createMany({ data: subscriptions.map(s => ({ eventId: event.id, subscriptionId: s.id })), skipDuplicates: true });
    await tx.pushEvent.update({ where: { id: event.id }, data: { dispatchedAt: now } });
  });
  const jobs = await prisma.pushDelivery.findMany({ where: { OR: [{ status: "QUEUED", nextAttemptAt: { lte: now } }, { status: "SENDING", leaseUntil: { lt: now } }] }, orderBy: { nextAttemptAt: "asc" }, take: limit });
  let accepted = 0, skipped = 0, retrying = 0;
  for (const job of jobs) {
    const token = randomUUID();
    const claimed = await prisma.pushDelivery.updateMany({ where: { id: job.id, attempts: { lt: 5 }, OR: [{ status: "QUEUED", nextAttemptAt: { lte: now } }, { status: "SENDING", leaseUntil: { lt: now } }] }, data: { status: "SENDING", leaseToken: token, leaseUntil: new Date(Date.now() + 60000), attempts: { increment: 1 } } });
    if (claimed.count !== 1) {
      await prisma.pushDelivery.updateMany({ where: { id: job.id, attempts: { gte: 5 }, OR: [{ status: "QUEUED" }, { status: "SENDING", leaseUntil: { lt: now } }] }, data: { status: "FAILED", reason: "RETRY_LIMIT" } });
      continue;
    }
    const where = { id: job.id, status: "SENDING", leaseToken: token };
    // Read fresh ownership/session/payment facts before every provider attempt.
    const current = await prisma.pushDelivery.findUniqueOrThrow({ where: { id: job.id }, include: { event: { include: { payment: true } }, subscription: true } });
    const { event, subscription: sub } = current;
    const session = await prisma.session.findUnique({ where: { id: sub.sessionId }, include: { manager: { include: { business: true } }, business: true, adminAccess: true } });
    const eligible = sub.active && sub.createdAt <= event.createdAt && event.businessId === sub.businessId && event.payment.businessId === sub.businessId && event.payment.paymentMethod === "ACH" && event.payment.status === event.kind && event.expiresAt > new Date() && session && session.expiresAt > new Date() && isActiveManagerSession(session) && session.businessId === sub.businessId && session.managerId === sub.managerId;
    if (!eligible) { await prisma.pushDelivery.updateMany({ where, data: { status: "SKIPPED", reason: "NO_LONGER_ELIGIBLE", leaseToken: null, leaseUntil: null } }); skipped++; continue; }
    try {
      const endpoint = pushEndpoint(sub.endpoint);
      await webPush.sendNotification({ endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ kind: event.kind, tag: "rfl-ach-" + event.id, body: achPushMessage(event.kind) }), { TTL: 300, timeout: 10000, vapidDetails: { subject, publicKey, privateKey } });
      await prisma.pushDelivery.updateMany({ where, data: { status: "ACCEPTED", sentAt: new Date(), reason: null, leaseToken: null, leaseUntil: null } }); accepted++;
    } catch (error) {
      const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
      const expired = status === 404 || status === 410;
      if (expired) await prisma.managerPushSubscription.updateMany({ where: { id: sub.id, updatedAt: sub.updatedAt }, data: { active: false } });
      const retry = !expired && (status === 0 || status === 429 || status >= 500) && current.attempts < 5;
      await prisma.pushDelivery.updateMany({ where, data: { status: retry ? "QUEUED" : "FAILED", reason: expired ? "SUBSCRIPTION_EXPIRED" : "PUSH_UNAVAILABLE", nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** current.attempts)), leaseToken: null, leaseUntil: null } });
      if (retry) retrying++;
    }
  }
  return { accepted, skipped, retrying };
}
