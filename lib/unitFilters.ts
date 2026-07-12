// lib/unitFilters.ts

export type UnitStatus =
  | "PAID"
  | "GRACE"
  | "PARTIAL"
  | "DELINQUENT"
  | "VACANT";

export type UnitFilterInput = {
  id: string;
  unitNumber: string;
  tenantName?: string | null;
  status: UnitStatus;
};

export function filterUnitsBySearch(
  units: UnitFilterInput[],
  search: string
) {
  const q = String(search || "").toLowerCase().trim();
  if (!q) return units;

  return units.filter((u) => {
    return (
      u.unitNumber.toLowerCase().includes(q) ||
      (u.tenantName || "").toLowerCase().includes(q)
    );
  });
}

export function filterUnitsByStatus(
  units: UnitFilterInput[],
  status?: UnitStatus | null
) {
  if (!status) return units;
  return units.filter((u) => u.status === status);
}

export function sortUnitsProblemFirst(units: UnitFilterInput[]) {
  const order: Record<UnitStatus, number> = {
    DELINQUENT: 1,
    PARTIAL: 2,
    GRACE: 3,
    PAID: 4,
    VACANT: 5,
  };

  return [...units].sort((a, b) => {
    const aOrder = order[a.status];
    const bOrder = order[b.status];

    if (aOrder !== bOrder) return aOrder - bOrder;

    return a.unitNumber.localeCompare(b.unitNumber);
  });
}

export function getActiveUnitIds(
  units: { id: string; isActive: boolean }[]
): Set<string> {
  return new Set(
    units.filter((u) => u.isActive).map((u) => u.id)
  );
}

export function isActiveUnit(
  unitId: string,
  activeUnitIds: Set<string>
): boolean {
  return activeUnitIds.has(unitId);
}