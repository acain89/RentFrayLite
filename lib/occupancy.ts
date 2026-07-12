import { prisma } from "@/lib/prisma";

export async function getUnitOccupancy(unitId: string) {
  const active = await prisma.assignment.findFirst({
    where: {
      unitId,
      moveOut: null,
    },
    include: {
      tenant: true,
    },
    orderBy: {
      moveIn: "desc",
    },
  });

  return {
    isVacant: !active,
    tenant: active?.tenant ?? null,
    assignment: active ?? null,
  };
}