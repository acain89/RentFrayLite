import { isActiveManagerSession } from "@/lib/sessionAuthority";
import { createHash, randomBytes } from "node:crypto";
import { BusinessStatus, Prisma, SessionType } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "rfl_session";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRawSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function setSessionCookie(
  token: string,
  expiresAt: Date
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function createManagerSession(input: {
  managerId: string;
  businessId: string;
  passwordHash: string;
  email: string;
}): Promise<void> {
  const token = createRawSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.$transaction(async tx => {
    // Serialize issuance with credential updates, so a login authenticated before
    // a reset cannot recreate a session after that reset has revoked all tokens.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Manager" WHERE "id" = ${input.managerId} FOR UPDATE`);
    const manager = await tx.manager.findUnique({ where: { id: input.managerId }, include: { business: true } });
    if (!manager?.isActive || manager.businessId !== input.businessId || !manager.business.isActive ||
      manager.business.status === BusinessStatus.DISABLED || manager.passwordHash !== input.passwordHash || manager.email !== input.email) {
      throw new Error("Manager authentication changed. Please log in again.");
    }
    await tx.session.create({ data: {
      tokenHash: hashSessionToken(token), type: SessionType.MANAGER,
      managerId: input.managerId, businessId: input.businessId, expiresAt,
    } });
  });

  await setSessionCookie(token, expiresAt);
}

export async function createAdminSession(
  adminAccessId: string, codeHash: string
): Promise<void> {
  const token = createRawSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AdminAccess" WHERE "id" = ${adminAccessId} FOR UPDATE`);
    const admin = await tx.adminAccess.findUnique({ where: { id: adminAccessId } });
    if (!admin?.isActive || admin.codeHash !== codeHash) throw new Error("Administrator authentication changed. Please log in again.");
    await tx.session.create({ data: { tokenHash: hashSessionToken(token), type: SessionType.ADMIN, adminAccessId, expiresAt } });
  });

  await setSessionCookie(token, expiresAt);
}

async function clearInvalidCookie(): Promise<void> {
  try { await clearSessionCookie(); } catch (error) {
    // Server Components cannot mutate cookies. Authorization still fails there;
    // Route Handlers clear the browser cookie without weakening server revocation.
    if (!(error instanceof Error) || !error.message.startsWith("Cookies can only be modified in a Server Action or Route Handler.")) throw error;
  }
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    include: {
      manager: {
        include: {
          business: true,
        },
      },
      business: true,
      adminAccess: true,
    },
  });

  if (!session) {
    await clearInvalidCookie();
    return null;
  }

  const activePrincipal = session.type === SessionType.MANAGER
    ? isActiveManagerSession(session)
    : session.type === SessionType.ADMIN && session.adminAccess?.isActive &&
      session.adminAccessId === session.adminAccess.id && !session.managerId && !session.businessId;
  if (session.expiresAt <= new Date() || !activePrincipal) {
    await prisma.session.deleteMany({
      where: {
        id: session.id,
      },
    });

    await clearInvalidCookie();
    return null;
  }

  const renewalThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (session.lastUsedAt < renewalThreshold) {
    const renewed = await prisma.session.updateMany({
      where: {
        id: session.id,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });
    if (renewed.count !== 1) { await clearInvalidCookie(); return null; }
  }

  return session;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });
  }

  await clearSessionCookie();
}
