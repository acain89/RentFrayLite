// app/api/admin/session/route.ts

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, getSession, setSessionCookie } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type AdminSessionRequest = {
  code?: unknown;
};

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true, role: "ADMIN" });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AdminSessionRequest;
    const code = String(body.code ?? "").trim();

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { ok: false, error: "Invalid admin code." },
        { status: 400 }
      );
    }

    const adminAccess = await prisma.adminAccess.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        codeHash: true,
      },
    });

    if (!adminAccess) {
      return NextResponse.json(
        { ok: false, error: "Admin access is not configured." },
        { status: 500 }
      );
    }

    const isValid = await bcrypt.compare(code, adminAccess.codeHash);

    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "Invalid admin code." },
        { status: 401 }
      );
    }

    const token = createSessionToken({ role: "ADMIN" });
    await setSessionCookie(token);

    await prisma.adminAccess.update({
      where: { id: adminAccess.id },
      data: { lastUsedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      role: "ADMIN",
    });
  } catch (error) {
    console.error("POST /api/admin/session failed", error);

    return NextResponse.json(
      { ok: false, error: "Admin login failed." },
      { status: 500 }
    );
  }
}
