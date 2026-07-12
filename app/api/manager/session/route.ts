import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { canManagerOperate } from "@/lib/liveGating";
import { verifyManagementPassword } from "@/lib/managementAuth";
import { checkRateLimit } from "@/lib/rateLimit";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_MANAGEMENT_ROLES = new Set(["OWNER", "MANAGER", "STAFF"]);

type LoginBody = {
  username?: string;
  email?: string;
  password?: string;
  propertyCode?: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
           const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const rateLimit = checkRateLimit(`manager-login:${ip}`, 10, 60_000);

    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a minute and try again." },
        { status: 429 }
      );
    }     

    const body = (await req.json()) as LoginBody;

    const propertyCode = clean(body.propertyCode);
    const username = clean(body.username);
    const email = clean(body.email).toLowerCase();
    const password = clean(body.password);

    const loginIdentifier = username || email;

    if (!loginIdentifier || !password) {
      return NextResponse.json({ error: "Invalid login." }, { status: 400 });
    }

    let propertyId: string | null = null;

    if (propertyCode && propertyCode.length >= 4 && propertyCode.length <= 5) {
      const property = await prisma.property.findUnique({
        where: { propertyCode },
        select: { id: true, isActive: true, status: true },
      });

      if (!property) {
        return NextResponse.json({ error: "Invalid login." }, { status: 401 });
      }

      if (!canManagerOperate(property) && property.status !== "SETUP") {
        return NextResponse.json(
          { error: "Property not available." },
          { status: 403 }
        );
      }

      propertyId = property.id;
    }

    const user = await prisma.managementUser.findFirst({
      where: {
        isActive: true,
        role: { in: ["OWNER", "MANAGER", "STAFF"] },
        ...(propertyId ? { propertyId } : {}),
        OR: [
          username ? { username } : undefined,
          email ? { email } : undefined,
        ].filter(
          (
            clause
          ): clause is { username: string } | { email: string } =>
            Boolean(clause)
        ),
      },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        isActive: true,
        propertyId: true,
      },
    });

    if (!user || !user.isActive || !ALLOWED_MANAGEMENT_ROLES.has(user.role)) {
      return NextResponse.json({ error: "Invalid login." }, { status: 401 });
    }

    const passwordOk = await verifyManagementPassword(
  password,
  user.passwordHash
);

    if (!passwordOk) {
      return NextResponse.json({ error: "Invalid login." }, { status: 401 });
    }

    const token = createSessionToken({
      role: user.role as "OWNER" | "MANAGER" | "STAFF",
      propertyId: user.propertyId,
      managementUserId: user.id,
    });

    await setSessionCookie(token);

    await prisma.managementUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      role: user.role,
    });
  } catch (error) {
    console.error("POST /api/manager/session failed", error);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie":
          "manager_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax",
      },
    }
  );
}
