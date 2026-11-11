import { createHmac } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const PUBLIC_REQUEST_LIMITS = {
  LOOKUP: { limit: 120, windowMs: 10 * 60_000, globalLimit: 3000 },
  SIGNUP: { limit: 3, windowMs: 60 * 60_000, globalLimit: 100 },
  SESSION: { limit: 30, windowMs: 10 * 60_000, globalLimit: 1000 },
  START: { limit: 30, windowMs: 5 * 60_000, globalLimit: 1000 },
} as const;
type Kind = keyof typeof PUBLIC_REQUEST_LIMITS;

/** No raw email, phone, IP, browser identifier, or financial data is stored.
 * A route-wide lock makes both budgets atomic across application instances.
 * The global one-minute budget also bounds keys created by identity rotation.
 * START counts work on one immutable attempt, never creates payment attempts.
 */
export async function reservePublicRequest(db: PrismaClient, kind: Kind, identity: string) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Public request protection unavailable.");
  const digest = createHmac("sha256", secret).update("rfl-public-budget-v1\0" + kind + "\0" + identity).digest("hex");
  const policy = PUBLIC_REQUEST_LIMITS[kind];
  return db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${"rfl-public-budget-v1:" + kind}, 0))`);
    const [clock] = await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS now`);
    const now = clock.now;
    // Bounded indexed cleanup; denied traffic cannot allocate new rows.
    const expired = await tx.publicRequestBudget.findMany({ where: { key: { startsWith: kind + ":" }, expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: 100, select: { key: true } });
    if (expired.length) await tx.publicRequestBudget.deleteMany({ where: { key: { in: expired.map(row => row.key) } } });
    const specs = [
      { key: kind + ":global", limit: policy.globalLimit, windowMs: 60_000 },
      { key: kind + ":" + digest, limit: policy.limit, windowMs: policy.windowMs },
    ];
    const rows = await Promise.all(specs.map(spec => tx.publicRequestBudget.findUnique({ where: { key: spec.key } })));
    let retryAfter = 0;
    for (let i = 0; i < specs.length; i++) {
      const row = rows[i];
      if (row && row.expiresAt > now && row.count >= specs[i].limit) retryAfter = Math.max(retryAfter, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000));
    }
    if (retryAfter) return { allowed: false, retryAfter };
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i], row = rows[i];
      const data = row && row.expiresAt > now ? { count: row.count + 1, expiresAt: row.expiresAt } : { count: 1, expiresAt: new Date(now.getTime() + spec.windowMs) };
      await tx.publicRequestBudget.upsert({ where: { key: spec.key }, create: { key: spec.key, ...data }, update: data });
    }
    return { allowed: true, retryAfter: 0 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 5000 });
}

export async function publicRequestGuard(db: PrismaClient, kind: Kind, identity: string): Promise<Response | null> {
  try {
    const reservation = await reservePublicRequest(db, kind, identity);
    return reservation.allowed ? null : Response.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(reservation.retryAfter), "Cache-Control": "no-store" } });
  } catch {
    // Fail closed without revealing database or configuration details.
    return Response.json({ error: "Temporarily unavailable. Please try again later." }, { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });
  }
}
