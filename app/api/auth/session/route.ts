import { SessionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
      },
      { status: 401 }
    );
  }

  if (
    session.type === SessionType.MANAGER &&
    session.manager &&
    session.business
  ) {
    return NextResponse.json({
      authenticated: true,
      type: SessionType.MANAGER,
      manager: {
        id: session.manager.id,
        email: session.manager.email,
        displayName: session.manager.displayName,
      },
      business: {
        id: session.business.id,
        name: session.business.name,
        accountCode: session.business.accountCode,
        status: session.business.status,
      },
      expiresAt: session.expiresAt,
    });
  }

  if (session.type === SessionType.ADMIN && session.adminAccess) {
    return NextResponse.json({
      authenticated: true,
      type: SessionType.ADMIN,
      expiresAt: session.expiresAt,
    });
  }

  return NextResponse.json(
    {
      authenticated: false,
    },
    { status: 401 }
  );
}
