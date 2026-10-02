import { BusinessStatus, SessionType } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isStrongAdminCredential } from "@/lib/adminCredential";
import { verifyPassword } from "@/lib/password";
import { getCurrentSession } from "@/lib/session";

export async function authenticateManager(
  email: string,
  password: string
) {
  const manager = await prisma.manager.findUnique({
    where: {
      email: email.toLowerCase(),
    },
    include: {
      business: true,
    },
  });

  if (!manager || !manager.isActive) {
    return null;
  }

  if (
    !manager.business.isActive ||
    manager.business.status === BusinessStatus.DISABLED
  ) {
    return null;
  }

  const passwordValid = await verifyPassword(
    password,
    manager.passwordHash
  );

  if (!passwordValid) {
    return null;
  }

  await prisma.manager.update({
    where: {
      id: manager.id,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

  return manager;
}

export async function authenticateAdmin(code: string) {
  if (!isStrongAdminCredential(code)) return null;
  const adminRecords = await prisma.adminAccess.findMany({
    where: {
      isActive: true,
    },
  });

  // Match the normal bcrypt cost even when no administrator is configured.
  if (adminRecords.length === 0) await verifyPassword(code, "$2b$12$C6UzMDM.H6dfI/f/IKcEe.3YHFzSSehKp27eUk/zJt8CByBEGvZ0K");
  for (const admin of adminRecords) {
    const codeValid = await verifyPassword(code, admin.codeHash);

    if (codeValid) {
      await prisma.adminAccess.update({
        where: {
          id: admin.id,
        },
        data: {
          lastUsedAt: new Date(),
        },
      });

      return admin;
    }
  }

  return null;
}

export async function requireManager() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.manager ||
    !session.business || session.manager.businessId !== session.business.id
  ) {
    redirect("/login/manager");
  }

  return {
    session,
    manager: session.manager,
    business: session.business,
  };
}

export async function requireAdmin() {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.ADMIN ||
    !session.adminAccess
  ) {
    redirect("/login/admin");
  }

  return {
    session,
    adminAccess: session.adminAccess,
  };
}
