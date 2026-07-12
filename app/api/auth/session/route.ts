// app/api/auth/session/route.ts

import { NextResponse } from "next/server";
import { getSession, clearSessionCookie } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type SessionUser = {
  role: string;
  propertyId: string | null;
  managementUserId: string | null;
  unitId: string | null;
  maintenanceUserId: string | null;
};

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({
        ok: false,
        user: null,
        onboarding: null,
      });
    }

    const user: SessionUser = {
      role: String(session.role),
      propertyId: session.propertyId ?? null,
      managementUserId: session.managementUserId ?? null,
      unitId: session.unitId ?? null,
      maintenanceUserId: session.maintenanceUserId ?? null,
    };

    return NextResponse.json({
      ok: true,
      user,
      onboarding: {
        hasProperty: Boolean(user.propertyId),
        needsSetup: false,
        needsBankConnection: false,
      },
    });
  } catch {
    return NextResponse.json({
      ok: false,
      user: null,
      onboarding: null,
    });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Use the role-specific login route for this account type.",
    },
    { status: 400 }
  );
}

export async function DELETE() {
  await clearSessionCookie();

  return NextResponse.json({
    ok: true,
  });
}
