import { SessionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";

export async function GET() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.ADMIN ||
    !session.adminAccess
  ) {
    return NextResponse.json(
      {
        authenticated: false,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    type: SessionType.ADMIN,
    expiresAt: session.expiresAt,
  });
}
