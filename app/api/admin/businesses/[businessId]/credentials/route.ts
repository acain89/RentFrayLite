import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    businessId: string;
  }>;
};

type CredentialPayload = {
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdminApi();

  if (auth.response) {
    return auth.response;
  }

  if (!auth.session?.adminAccess) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const adminAccess = auth.session.adminAccess;
  const { businessId } = await context.params;
  const body = (await request.json()) as CredentialPayload;

  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  const confirmPassword =
    typeof body.confirmPassword === "string"
      ? body.confirmPassword
      : "";

  if (!email && !password) {
    return NextResponse.json(
      { error: "Enter a new email or password." },
      { status: 400 }
    );
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (password && password.length < 6) {
    return NextResponse.json(
      { error: "The new password must be at least 6 characters." },
      { status: 400 }
    );
  }

  if (password && password !== confirmPassword) {
    return NextResponse.json(
      { error: "The new passwords do not match." },
      { status: 400 }
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { manager: true },
  });

  if (!business?.manager) {
    return NextResponse.json(
      { error: "Manager account not found." },
      { status: 404 }
    );
  }

  if (email && email !== business.manager.email) {
    const duplicate = await prisma.manager.findUnique({
      where: { email },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== business.manager.id) {
      return NextResponse.json(
        { error: "That email is already used by another manager." },
        { status: 409 }
      );
    }
  }

  const passwordHash = password
    ? await bcrypt.hash(password, 12)
    : undefined;

  await prisma.$transaction([
    prisma.manager.update({
      where: { id: business.manager.id },
      data: {
        ...(email ? { email } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    }),
    prisma.auditLog.create({
      data: {
        businessId,
        actorType: "ADMIN",
        actorId: adminAccess.id,
        action: "MANAGER_CREDENTIALS_UPDATED",
        targetType: "Manager",
        targetId: business.manager.id,
        summary: [
          email ? "Manager email changed" : null,
          password ? "Manager password reset" : null,
        ]
          .filter(Boolean)
          .join("; "),
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    email: email || business.manager.email,
  });
}