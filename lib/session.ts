// lib/session.ts

import crypto from "crypto";
import { cookies } from "next/headers";

export type SessionRole =
  | "ADMIN"
  | "OWNER"
  | "MANAGER"
  | "STAFF"
  | "TENANT"
  | "MAINTENANCE";

export type SessionPayload = {
  role: SessionRole;
  propertyId?: string;
  adminAccessId?: string;
  managementUserId?: string;
  unitId?: string;
  maintenanceUserId?: string;
  iat: number;
  exp: number;
};

type CreateSessionInput =
  | {
      role: "ADMIN";
      adminAccessId?: string;
    }
  | {
      role: "OWNER" | "MANAGER" | "STAFF";
      propertyId: string;
      managementUserId: string;
    }
  | {
      role: "TENANT";
      propertyId: string;
      unitId: string;
    }
  | {
      role: "MAINTENANCE";
      propertyId: string;
      maintenanceUserId: string;
    };

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_COOKIE_NAME = "rf_session";

function getSessionSecret() {
  return process.env.SESSION_SECRET || "rentfray-dev-session-secret-change-me";
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function sign(value: string) {
  return base64UrlEncode(
    crypto.createHmac("sha256", getSessionSecret()).update(value).digest()
  );
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function isValidRole(role: unknown): role is SessionRole {
  return (
    role === "ADMIN" ||
    role === "OWNER" ||
    role === "MANAGER" ||
    role === "STAFF" ||
    role === "TENANT" ||
    role === "MAINTENANCE"
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidPayloadShape(parsed: Partial<SessionPayload>): parsed is SessionPayload {
  if (!parsed || !isValidRole(parsed.role)) {
    return false;
  }

  if (typeof parsed.iat !== "number" || typeof parsed.exp !== "number") {
    return false;
  }

  if (parsed.propertyId !== undefined && !isNonEmptyString(parsed.propertyId)) {
    return false;
  }

  if (
    parsed.adminAccessId !== undefined &&
    !isNonEmptyString(parsed.adminAccessId)
  ) {
    return false;
  }

  if (
    parsed.managementUserId !== undefined &&
    !isNonEmptyString(parsed.managementUserId)
  ) {
    return false;
  }

  if (parsed.unitId !== undefined && !isNonEmptyString(parsed.unitId)) {
    return false;
  }

  if (
    parsed.maintenanceUserId !== undefined &&
    !isNonEmptyString(parsed.maintenanceUserId)
  ) {
    return false;
  }

  if (parsed.role === "ADMIN") {
    return true;
  }

  if (
    parsed.role === "OWNER" ||
    parsed.role === "MANAGER" ||
    parsed.role === "STAFF"
  ) {
    return (
      isNonEmptyString(parsed.propertyId) &&
      isNonEmptyString(parsed.managementUserId)
    );
  }

  if (parsed.role === "TENANT") {
    return (
      isNonEmptyString(parsed.propertyId) &&
      isNonEmptyString(parsed.unitId)
    );
  }

  if (parsed.role === "MAINTENANCE") {
    return (
      isNonEmptyString(parsed.propertyId) &&
      isNonEmptyString(parsed.maintenanceUserId)
    );
  }

  return false;
}

export function createSessionToken(input: CreateSessionInput) {
  const now = Math.floor(Date.now() / 1000);

  let payload: SessionPayload;

  switch (input.role) {
    case "ADMIN":
      payload = {
        role: "ADMIN",
        ...(input.adminAccessId ? { adminAccessId: input.adminAccessId } : {}),
        iat: now,
        exp: now + SESSION_TTL_SECONDS,
      };
      break;

    case "OWNER":
    case "MANAGER":
    case "STAFF":
      payload = {
        role: input.role,
        propertyId: input.propertyId,
        managementUserId: input.managementUserId,
        iat: now,
        exp: now + SESSION_TTL_SECONDS,
      };
      break;

    case "TENANT":
      payload = {
        role: "TENANT",
        propertyId: input.propertyId,
        unitId: input.unitId,
        iat: now,
        exp: now + SESSION_TTL_SECONDS,
      };
      break;

    case "MAINTENANCE":
      payload = {
        role: "MAINTENANCE",
        propertyId: input.propertyId,
        maintenanceUserId: input.maintenanceUserId,
        iat: now,
        exp: now + SESSION_TTL_SECONDS,
      };
      break;
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, signature] = parts;

    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = sign(encodedPayload);

    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    const parsed = JSON.parse(
      base64UrlDecode(encodedPayload)
    ) as Partial<SessionPayload>;

    const now = Math.floor(Date.now() / 1000);

    if (!isValidPayloadShape(parsed)) {
      return null;
    }

    if (parsed.exp <= now) {
      return null;
    }

    if (parsed.iat > now + 60) {
      return null;
    }

    return {
      role: parsed.role,
      ...(parsed.propertyId ? { propertyId: parsed.propertyId } : {}),
      ...(parsed.adminAccessId ? { adminAccessId: parsed.adminAccessId } : {}),
      ...(parsed.managementUserId
        ? { managementUserId: parsed.managementUserId }
        : {}),
      ...(parsed.unitId ? { unitId: parsed.unitId } : {}),
      ...(parsed.maintenanceUserId
        ? { maintenanceUserId: parsed.maintenanceUserId }
        : {}),
      iat: parsed.iat,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

export async function requireRole(role: SessionRole) {
  const session = await requireSession();

  if (session.role !== role) {
    throw new Error("Forbidden");
  }

  return session;
}

export async function requireManagementSession() {
  const session = await requireSession();

  if (
    session.role !== "OWNER" &&
    session.role !== "MANAGER" &&
    session.role !== "STAFF"
  ) {
    throw new Error("Forbidden");
  }

  return session;
}

export async function requireManagerLevelSession() {
  const session = await requireSession();

  if (session.role !== "OWNER" && session.role !== "MANAGER") {
    throw new Error("Forbidden");
  }

  return session;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function refreshSessionCookie(session: SessionPayload) {
  let refreshedToken: string;

  if (session.role === "ADMIN") {
    refreshedToken = createSessionToken({
      role: "ADMIN",
      adminAccessId: session.adminAccessId,
    });
  } else if (
    session.role === "OWNER" ||
    session.role === "MANAGER" ||
    session.role === "STAFF"
  ) {
    if (!session.propertyId || !session.managementUserId) return;

    refreshedToken = createSessionToken({
      role: session.role,
      propertyId: session.propertyId,
      managementUserId: session.managementUserId,
    });
  } else if (session.role === "TENANT") {
    if (!session.propertyId || !session.unitId) return;

    refreshedToken = createSessionToken({
      role: "TENANT",
      propertyId: session.propertyId,
      unitId: session.unitId,
    });
  } else {
    if (!session.propertyId || !session.maintenanceUserId) return;

    refreshedToken = createSessionToken({
      role: "MAINTENANCE",
      propertyId: session.propertyId,
      maintenanceUserId: session.maintenanceUserId,
    });
  }

  await setSessionCookie(refreshedToken);
}