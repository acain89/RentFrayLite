import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { isNewManagementPassword, isManagementLoginPassword, MANAGEMENT_PASSWORD_REQUIREMENT, invalidateManagementResetTokens } from "@/lib/managementCredential";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { SessionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clearSessionCookie, getCurrentSession } from "@/lib/session";

type SecurityPayload = {
  action?: unknown;
  currentPassword?: unknown;
  newEmail?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

export async function PATCH(request: NextRequest) {
  try {
    return await updateSecurity(request);
  } catch (error) {
    if (error instanceof ManagerMutationUnauthorized) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    throw error;
  }
}

async function updateSecurity(request: NextRequest) {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.manager ||
    !session.business
  ) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try{requireCredentialOrigin(request);}catch{return NextResponse.json({error:"Invalid request origin."},{status:403});}
  const businessId = session.business.id;

  let body: SecurityPayload;

  try {
    body = (await publicJson(request, 4096)) as SecurityPayload;
  } catch (error) { return publicJsonFailure(error); }

  const action =
    typeof body.action === "string" ? body.action : "";

  const currentPassword =
    typeof body.currentPassword === "string"
      ? body.currentPassword
      : "";

  if (!isManagementLoginPassword(currentPassword)) {
    return NextResponse.json(
      { error: "Enter your current password." },
      { status: 400 }
    );
  }

  const manager = await prisma.manager.findUnique({
    where: { id: session.manager.id },
  });

  if (!manager || !manager.isActive) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const validCurrentPassword = await verifyPassword(
    currentPassword,
    manager.passwordHash
  );

  if (!validCurrentPassword) {
    return NextResponse.json(
      { error: "Your current password is incorrect." },
      { status: 401 }
    );
  }

  if (action === "EMAIL") {
    const newEmail =
      typeof body.newEmail === "string"
        ? body.newEmail.trim().toLowerCase()
        : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json(
        { error: "Enter a valid new email address." },
        { status: 400 }
      );
    }

    if (newEmail === manager.email) {
      return NextResponse.json(
        { error: "That is already your login email." },
        { status: 400 }
      );
    }

    const duplicate = await prisma.manager.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== manager.id) {
      return NextResponse.json(
        { error: "That email is already used by another account." },
        { status: 409 }
      );
    }

    await withManagerMutation(session, async tx => {
      await tx.manager.update({
        where: { id: manager.id, passwordHash: manager.passwordHash, email: manager.email, isActive: true },
        data: { email: newEmail },
      });
      await invalidateManagementResetTokens(tx,businessId);
      await tx.session.deleteMany({ where: { managerId: manager.id } });
      await tx.auditLog.create({
        data: {
          businessId,
          actorType: "MANAGER",
          actorId: manager.id,
          action: "MANAGER_EMAIL_CHANGED",
          targetType: "Manager",
          targetId: manager.id,
          summary: "Manager login email changed.",
        },
      });
    });

    await clearSessionCookie();
    return NextResponse.json({
      success: true,
      requiresLogin: true,
      email: newEmail,
      message: "Login email updated. Please log in again.",
    });
  }

  if (action === "PASSWORD") {
    const newPassword =
      typeof body.newPassword === "string"
        ? body.newPassword
        : "";

    const confirmPassword =
      typeof body.confirmPassword === "string"
        ? body.confirmPassword
        : "";

    if(!isNewManagementPassword(newPassword))return NextResponse.json({error:MANAGEMENT_PASSWORD_REQUIREMENT},{status:400});

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "The new passwords do not match." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await withManagerMutation(session, async tx => {
      await tx.manager.update({
        where: { id: manager.id, passwordHash: manager.passwordHash, email: manager.email, isActive: true },
        data: { passwordHash },
      });
      await invalidateManagementResetTokens(tx,businessId);
      await tx.session.deleteMany({ where: { managerId: manager.id } });
      await tx.auditLog.create({
        data: {
          businessId,
          actorType: "MANAGER",
          actorId: manager.id,
          action: "MANAGER_PASSWORD_CHANGED",
          targetType: "Manager",
          targetId: manager.id,
          summary: "Manager login password changed.",
        },
      });
    });

    await clearSessionCookie();
    return NextResponse.json({
      success: true,
      requiresLogin: true,
      message: "Password updated. Please log in again.",
    });
  }

  return NextResponse.json(
    { error: "Invalid security action." },
    { status: 400 }
  );
}
