import { SessionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";

export async function requireAdminApi() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.ADMIN ||
    !session.adminAccess
  ) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      ),
    };
  }

  return {
    session,
    response: null,
  };
}