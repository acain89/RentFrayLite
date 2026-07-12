import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_BACKUP_COOKIE_NAME = "rf_admin_session";

async function restoreAdminSession() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(ADMIN_BACKUP_COOKIE_NAME)?.value;

  if (!adminToken) {
    return false;
  }

  cookieStore.set(SESSION_COOKIE_NAME, adminToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  cookieStore.set(ADMIN_BACKUP_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return true;
}

export async function POST() {
  const restored = await restoreAdminSession();

  if (!restored) {
    return NextResponse.json(
      { error: "No admin session to restore." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    redirectTo: "/admin",
  });
}

export async function GET(_req: NextRequest) {
  const restored = await restoreAdminSession();

  if (!restored) {
    return NextResponse.redirect(new URL("/login/admin", _req.url));
  }

  return NextResponse.redirect(new URL("/admin", _req.url));
}