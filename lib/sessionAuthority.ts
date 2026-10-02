import { BusinessStatus, Prisma, SessionType } from "@prisma/client";

export type SessionAuthority = Prisma.SessionGetPayload<{
  include: { manager: { include: { business: true } }; business: true; adminAccess: true };
}>;

export function isActiveManagerSession(session: SessionAuthority): boolean {
  return session.type === SessionType.MANAGER && !!session.manager?.isActive &&
    !!session.business?.isActive && session.business.status !== BusinessStatus.DISABLED &&
    session.managerId === session.manager.id && session.businessId === session.business.id &&
    session.manager.businessId === session.business.id && !session.adminAccessId;
}

