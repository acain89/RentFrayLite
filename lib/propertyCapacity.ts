import { prisma } from "@/lib/prisma";

export async function getInactiveUnitCount(propertyId: string): Promise<number> {
  return prisma.unit.count({
    where: { propertyId, isActive: false },
  });
}

export async function getConfiguredUnitCount(propertyId: string): Promise<number> {
  const result = await prisma.propertyTier.aggregate({
    where: {
      propertyId,
      isActive: true,
    },
    _sum: {
      unitCount: true,
    },
  });

  return result._sum.unitCount ?? 0;
}

export async function getEffectiveUnitCount(propertyId: string): Promise<number> {
  return prisma.unit.count({
    where: {
      propertyId,
      isActive: true,
    },
  });
}

export async function getOccupiedUnitCount(propertyId: string): Promise<number> {
  return prisma.tenantAssignment.count({
    where: {
      propertyId,
      isCurrent: true,
      moveOutDate: null,
      unit: {
        isActive: true,
      },
    },
  });
}

export async function getActiveTierUnitCount(
  propertyId: string,
  tierId: string
): Promise<number> {
  return prisma.unit.count({
    where: {
      propertyId,
      tierId,
      isActive: true,
    },
  });
}

export async function getOccupiedTierUnitCount(
  propertyId: string,
  tierId: string
): Promise<number> {
  return prisma.tenantAssignment.count({
    where: {
      propertyId,
      isCurrent: true,
      moveOutDate: null,
      unit: {
        tierId,
        isActive: true,
      },
    },
  });
}

export async function canActivateUnit(propertyId: string): Promise<boolean> {
  const [configuredUnitCount, activeUnitCount] = await Promise.all([
    getConfiguredUnitCount(propertyId),
    getEffectiveUnitCount(propertyId),
  ]);

  return activeUnitCount < configuredUnitCount;
}

export async function canActivateTier(
  propertyId: string,
  tierId: string
): Promise<boolean> {
  const tier = await prisma.propertyTier.findFirst({
    where: {
      id: tierId,
      propertyId,
      isActive: true,
    },
    select: {
      unitCount: true,
    },
  });

  if (!tier || tier.unitCount <= 0) return false;

  const activeTierUnitCount = await getActiveTierUnitCount(propertyId, tierId);

  return activeTierUnitCount < tier.unitCount;
}

export async function validateTierCapacityUpdate(
  propertyId: string,
  tierId: string,
  nextTierUnitCount: number
): Promise<{ valid: boolean; error?: string }> {
  if (!Number.isInteger(nextTierUnitCount) || nextTierUnitCount < 0) {
    return { valid: false, error: "Tier unit count must be 0 or higher." };
  }

  const activeTierUnitCount = await getActiveTierUnitCount(propertyId, tierId);

  if (nextTierUnitCount < activeTierUnitCount) {
    return {
      valid: false,
      error: "Tier unit count cannot be lower than active units in this tier.",
    };
  }

  return { valid: true };
}

export async function validateUnitCapacityUpdate(
  propertyId: string,
  nextConfiguredUnitCount: number
): Promise<{ valid: boolean; error?: string }> {
  if (!Number.isInteger(nextConfiguredUnitCount) || nextConfiguredUnitCount < 1) {
    return { valid: false, error: "Unit count must be a positive integer." };
  }

  const occupiedUnitCount = await getOccupiedUnitCount(propertyId);

  if (nextConfiguredUnitCount < occupiedUnitCount) {
    return {
      valid: false,
      error: "Total units cannot be lower than occupied unit count.",
    };
  }

  return { valid: true };
}

export async function getCapacitySnapshot(propertyId: string): Promise<{
  configuredUnitCount: number;
  inactiveUnitCount: number;
  effectiveUnitCount: number;
  occupiedUnitCount: number;
}> {
  const [configuredUnitCount, inactiveUnitCount, effectiveUnitCount, occupiedUnitCount] =
    await Promise.all([
      getConfiguredUnitCount(propertyId),
      getInactiveUnitCount(propertyId),
      getEffectiveUnitCount(propertyId),
      getOccupiedUnitCount(propertyId),
    ]);

  return {
    configuredUnitCount,
    inactiveUnitCount,
    effectiveUnitCount,
    occupiedUnitCount,
  };
}