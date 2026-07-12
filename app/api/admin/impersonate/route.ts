import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  getSession,
  SESSION_COOKIE_NAME,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_BACKUP_COOKIE_NAME = "rf_admin_session";

type ImpersonateBody = {
  propertyId?: unknown;
  managementUserId?: unknown;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const cookieStore = await cookies();
    const currentAdminToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!currentAdminToken) {
      return NextResponse.json(
        { error: "Admin session token missing." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as ImpersonateBody;

    const propertyId = clean(body.propertyId);
    const managementUserId = clean(body.managementUserId);

    if (!propertyId || !managementUserId) {
      return NextResponse.json(
        { error: "Missing property or management user." },
        { status: 400 }
      );
    }

    const managementUser = await prisma.managementUser.findFirst({
      where: {
        id: managementUserId,
        propertyId,
        isActive: true,
        role: {
          in: ["OWNER", "MANAGER", "STAFF"],
        },
      },
      select: {
        id: true,
        propertyId: true,
        role: true,
        email: true,
        username: true,
      },
    });

    if (!managementUser) {
      return NextResponse.json(
        { error: "Active management user not found." },
        { status: 404 }
      );
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        propertyCode: true,
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found." },
        { status: 404 }
      );
    }

    const impersonationToken = createSessionToken({
      role: managementUser.role as "OWNER" | "MANAGER" | "STAFF",
      propertyId: managementUser.propertyId,
      managementUserId: managementUser.id,
    });

    cookieStore.set(ADMIN_BACKUP_COOKIE_NAME, currentAdminToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60,
    });

    cookieStore.set(SESSION_COOKIE_NAME, impersonationToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60,
    });

    await prisma.auditLog.create({
      data: {
        propertyId,
        actorType: "ADMIN",
        actorAdminId: session.adminAccessId ?? null,
        action: "ADMIN_IMPERSONATION_STARTED",
        targetType: "MANAGEMENT_USER",
        targetId: managementUser.id,
        summary: "Admin started viewing property as a management user.",
        metadataJson: JSON.stringify({
          propertyName: property.name,
          propertyCode: property.propertyCode,
          managementUserEmail: managementUser.email || managementUser.username,
          managementUserRole: managementUser.role,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      redirectTo: "/manager/dashboard",
    });
  } catch (error) {
    console.error("POST /api/admin/impersonate failed", error);

    return NextResponse.json(
      { error: "Failed to start manager view." },
      { status: 500 }
    );
  }
}