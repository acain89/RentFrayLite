import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ADMIN_LOGIN_LIMIT = 10;
export const ADMIN_LOGIN_WINDOW_MS = 5 * 60 * 1000;
export const ADMIN_LOGIN_ATTEMPT_ACTION = "ADMIN_LOGIN_VERIFICATION_RESERVED";

// Public request headers do not establish a trusted source address in this repo.
// Use one durable administrator-authentication budget; managers use no such budget.
// Successful attempts count too and never reset another caller's protection.
export async function reserveAdminLogin(): Promise<string | null> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('rfl-admin-login-v1', 0))`);
    const [clock] = await tx.$queryRaw<{ now: Date }[]>(Prisma.sql`SELECT clock_timestamp() AS now`);
    const attempts = await tx.auditLog.count({ where: {
      action: ADMIN_LOGIN_ATTEMPT_ACTION,
      createdAt: { gt: new Date(clock.now.getTime() - ADMIN_LOGIN_WINDOW_MS) },
    } });
    if (attempts >= ADMIN_LOGIN_LIMIT) return null;
    const attempt = await tx.auditLog.create({ data: {
      actorType: "SECURITY", action: ADMIN_LOGIN_ATTEMPT_ACTION, targetType: "ADMIN_AUTH",
      summary: "Administrator authentication verification reserved.", createdAt: clock.now,
    } });
    return attempt.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 5000 });
}

export async function recordAdminLoginOutcome(id: string, outcome: "SUCCESS" | "FAILURE"): Promise<void> {
  await prisma.auditLog.update({ where: { id }, data: {
    summary: outcome === "SUCCESS" ? "Administrator authentication succeeded." : "Administrator authentication failed.",
    metadata: { outcome },
  } });
}
