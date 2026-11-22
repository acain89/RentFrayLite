import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { achPushMessage } from "@/lib/pushNotifications";
export default async function ManagerPushHistory() {
  const { business } = await requireManager();
  const events = await Promise.resolve().then(() => prisma.pushEvent.findMany({ where: { businessId: business.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, kind: true, createdAt: true, deliveries: { select: { status: true } } } })).catch(() => null);
  if ((await requireManager()).business.id !== business.id) return null;
  return <section className="rfl-push-panel" aria-labelledby="push-history-heading"><h2 id="push-history-heading">Notification history</h2><p>Latest 20 ACH status events. These describe changes at the time shown; check payment history for the current status. Push-service acceptance does not confirm delivery.</p>
    {events === null ? <p>Notification history is temporarily unavailable. Payment history remains available.</p> : events.length ? <ul>{events.map(event => <li key={event.id}><time dateTime={event.createdAt.toISOString()}>{event.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</time><p>{achPushMessage(event.kind)}</p><p>{event.deliveries.some(d => d.status === "ACCEPTED") ? "Accepted by a push service; delivery unconfirmed." : event.deliveries.some(d => ["QUEUED", "SENDING"].includes(d.status)) ? "Notification queued." : "No active device or notification unavailable. Payment status is unaffected."}</p></li>)}</ul> : <p>No notification events yet.</p>}
  </section>;
}
