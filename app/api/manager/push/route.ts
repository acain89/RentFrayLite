import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { requireCredentialOrigin, PRIVATE_CREDENTIAL_HEADERS } from "@/lib/credentialRequest";
import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { parsePushSubscription, pushEndpoint, pushEndpointHash, PushInputInvalid } from "@/lib/pushSubscription";
const reply = (data: object, status = 200) => Response.json(data, { status, headers: PRIVATE_CREDENTIAL_HEADERS });
async function mutate(request: Request, remove: boolean) {
  const session = await getCurrentSession();
  if (!session || session.type !== "MANAGER" || !session.business || !session.manager) return reply({ error: "Authentication required." }, 401);
  try { requireCredentialOrigin(request); } catch { return reply({ error: "Invalid request origin." }, 403); }
  let body: Record<string, unknown>; try { body = await publicJson(request, 4096); } catch (e) { return publicJsonFailure(e); }
  try {
    const endpointHash = pushEndpointHash(pushEndpoint(body.endpoint));
    const input = remove ? null : parsePushSubscription(body);
    await withManagerMutation(session, async tx => {
      const current = await tx.managerPushSubscription.findUnique({ where: { endpointHash } });
      if (current && (current.managerId !== session.managerId || current.businessId !== session.businessId)) throw new PushInputInvalid();
      if (remove) {
        if (Object.keys(body).some(k => k !== "endpoint")) throw new PushInputInvalid();
        await tx.managerPushSubscription.updateMany({ where: { endpointHash, businessId: session.businessId!, managerId: session.managerId! }, data: { active: false } });
      } else if (input) {
        if (!current?.active && await tx.managerPushSubscription.count({ where: { managerId: session.managerId!, active: true } }) >= 10) throw new PushInputInvalid();
        if (current) {
          const saved = await tx.managerPushSubscription.updateMany({ where: { id: current.id, businessId: session.businessId!, managerId: session.managerId! }, data: { ...input, active: true, sessionId: session.id, createdAt: new Date() } });
          if (saved.count !== 1) throw new PushInputInvalid();
        } else {
          // A unique-key race must fail, never upsert into another business.
          await tx.managerPushSubscription.create({ data: { ...input, active: true, businessId: session.businessId!, managerId: session.managerId!, sessionId: session.id } });
        }
      }
    });
    return reply({ saved: true });
  } catch (error) {
    return reply({ error: error instanceof ManagerMutationUnauthorized ? "Authentication required." : "Unable to save notifications. Please retry." }, error instanceof PushInputInvalid ? 400 : error instanceof ManagerMutationUnauthorized ? 401 : 503);
  }
}
export const POST = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || session.type !== "MANAGER" || !session.manager || !session.business) return reply({ error: "Authentication required." }, 401);
  const eventId = new URL(request.url).searchParams.get("event");
  if (eventId !== null) {
    if (!/^[a-f0-9]{64}$/.test(eventId)) return reply({ authorized: false }, 400);
    const delivery = await prisma.pushDelivery.findFirst({ where: { eventId, status: { in: ["SENDING", "ACCEPTED"] }, event: { businessId: session.business.id, expiresAt: { gt: new Date() } }, subscription: { businessId: session.business.id, managerId: session.manager.id, sessionId: session.id, active: true } }, select: { id: true, event: { select: { kind: true, payment: { select: { status: true } } } } } });
    return reply({ authorized: !!delivery && delivery.event.kind === delivery.event.payment.status });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const configured = !!process.env.VAPID_PRIVATE_KEY && !!process.env.VAPID_SUBJECT && /^[A-Za-z0-9_-]{87}$/.test(publicKey);
  return reply({ publicKey: configured ? publicKey : null });
}
