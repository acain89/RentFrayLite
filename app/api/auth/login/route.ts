import { reserveAdminLogin, recordAdminLoginOutcome, ADMIN_LOGIN_WINDOW_MS } from "@/lib/adminLoginThrottle";
import { NextResponse } from "next/server";
import {
  authenticateAdmin,
  authenticateManager,
} from "@/lib/auth";
import {
  createAdminSession,
  createManagerSession,
  destroyCurrentSession,
} from "@/lib/session";
import { getSetupRoute } from "@/lib/setupProgress";
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

  let adminAttempt: string | null = null;
  const isAdmin = !!body && typeof body === "object" && "type" in body && body.type === "ADMIN";
  if (isAdmin) {
    try { adminAttempt = await reserveAdminLogin(); } catch {
      return NextResponse.json({ error: "Unable to sign in. Please try again later." }, { status: 503 });
    }
    if (!adminAttempt) return NextResponse.json({ error: "Too many administrator sign-in attempts. Try again later." }, {
      status: 429, headers: { "Retry-After": String(ADMIN_LOGIN_WINDOW_MS / 1000) },
    });
  }
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    if (adminAttempt) {
      await recordAdminLoginOutcome(adminAttempt, "FAILURE");
      return NextResponse.json({ error: "Unable to sign in." }, { status: 401 });
    }
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
      passwordHash: manager.passwordHash,
      email: manager.email,
    });

    const setupRoute = getSetupRoute(manager.business);

    return NextResponse.json({
      authenticated: true,
      redirectTo:
        setupRoute === "/manager/dashboard"
          ? "/manager/dashboard"
          : "/setup/continue",
    });
  }

  const admin = await authenticateAdmin(parsed.data.code);

  if (!admin) {
    await recordAdminLoginOutcome(adminAttempt!, "FAILURE");
    return NextResponse.json(
      {
        error: "Unable to sign in.",
      },
      { status: 401 }
    );
  }

  await recordAdminLoginOutcome(adminAttempt!, "SUCCESS");
  await createAdminSession(admin.id, admin.codeHash);

  return NextResponse.json({
    authenticated: true,
    redirectTo: "/admin",
  });
}