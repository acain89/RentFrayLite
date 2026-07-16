import { NextResponse } from "next/server";
import { authenticateAdmin, authenticateManager } from "@/lib/auth";
import {
  createAdminSession,
  createManagerSession,
  destroyCurrentSession,
} from "@/lib/session";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter valid login information.",
      },
      { status: 400 }
    );
  }

  await destroyCurrentSession();

  if (parsed.data.type === "MANAGER") {
    const manager = await authenticateManager(
      parsed.data.email,
      parsed.data.password
    );

    if (!manager) {
      return NextResponse.json(
        {
          error: "The email or password is incorrect.",
        },
        { status: 401 }
      );
    }

    await createManagerSession({
      managerId: manager.id,
      businessId: manager.businessId,
    });

    return NextResponse.json({
      authenticated: true,
      redirectTo: "/manager/dashboard",
    });
  }

  const admin = await authenticateAdmin(parsed.data.code);

  if (!admin) {
    return NextResponse.json(
      {
        error: "The admin code is incorrect.",
      },
      { status: 401 }
    );
  }

  await createAdminSession(admin.id);

  return NextResponse.json({
    authenticated: true,
    redirectTo: "/admin",
  });
}
