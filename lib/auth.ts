import { BusinessStatus, SessionType } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
  const adminRecords = await prisma.adminAccess.findMany({
    where: {
      isActive: true,
    },
  });

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
    !session.business
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
