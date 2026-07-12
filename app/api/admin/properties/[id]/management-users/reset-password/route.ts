import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResetPasswordBody = {
  userId?: unknown;
  temporaryPassword?: unknown;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function isStrongEnoughTemporaryPassword(password: string): boolean {
  return password.length >= 8;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const body = (await req.json()) as ResetPasswordBody;

    const userId = clean(body.userId);
    const temporaryPassword = clean(body.temporaryPassword);

    if (!propertyId) {
      return NextResponse.json(
        { error: "Missing property id." },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing management user id." },
        { status: 400 }
      );
    }

    if (!isStrongEnoughTemporaryPassword(temporaryPassword)) {
      return NextResponse.json(
        { error: "Temporary password must be at least 8 characters." },
        { status: 400 }
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

    const user = await prisma.managementUser.findFirst({
      where: {
        id: userId,
        propertyId,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Management user not found." },
        { status: 404 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Cannot reset password for an inactive management user." },
        { status: 400 }
      );
    }

    const destinationEmail = clean(user.email || user.username).toLowerCase();

    if (!destinationEmail || !destinationEmail.includes("@")) {
      return NextResponse.json(
        {
          error:
            "This management user does not have a valid registered email address.",
        },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const updated = await prisma.managementUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustResetPassword: false,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        propertyId,
        actorType: "ADMIN",
        actorAdminId: session.adminAccessId ?? null,
        action: "MANAGEMENT_USER_PASSWORD_RESET",
        targetType: "MANAGEMENT_USER",
        targetId: user.id,
        summary: "Admin reset a management user password.",
        metadataJson: JSON.stringify({
          propertyName: property.name,
          propertyCode: property.propertyCode,
          managementUserEmail: destinationEmail,
          managementUserRole: user.role,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      user: updated,
      sendPasswordToEmail: destinationEmail,
      message:
        "Password reset. Only send the new password to the registered email shown.",
    });
  } catch (error) {
    console.error(
      "POST /api/admin/properties/[id]/management-users/reset-password failed",
      error
    );

    return NextResponse.json(
      { error: "Failed to reset management user password." },
      { status: 500 }
    );
  }
}