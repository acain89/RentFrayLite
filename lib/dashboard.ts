// lib/dashboard.ts

import { getRentDateSummary } from "@/lib/rentDates";

export type DashboardUnitStatus =
  | "PAID"
  | "GRACE"
  | "PARTIAL"
  | "DELINQUENT"
  | "VACANT";

export type DashboardCounts = {
  paid: number;
  grace: number;
  partial: number;
  delinquent: number;
  vacant: number;
};

export type DashboardSummary = {
  paidSinceClose: number;
  newPayments: number;
  delinquentUnits: number;
  openMaintenance: number;
  vacantUnits: number;
};

export type ExpectedCollected = {
  expectedRentThisCycle: number;
  collectedThisCycle: number;
  remainingThisCycle: number;
};

export type NeedsAttentionItem = {
  type: "DELINQUENT" | "PARTIAL" | "MAINTENANCE";
  unitId?: string | null;
  unitNumber?: string | null;
  requestId?: string | null;
  title: string;
  subtitle?: string | null;
  amount?: number | null;
  createdAt?: Date | string | null;
};

export type RecentActivityItem = {
  type:
    | "PAYMENT"
    | "LATE_FEE"
    | "MAINTENANCE_CREATED"
    | "MAINTENANCE_UPDATED"
    | "STATUS_CHANGE"
    | "MOVE_OUT"
    | "VACANCY";
  title: string;
  subtitle?: string | null;
  amount?: number | null;
  createdAt: Date | string;
  unitId?: string | null;
  unitNumber?: string | null;
};

export type DashboardUnitInput = {
  id: string;
  unitNumber: string;
  monthlySubtotal?: number | null;
  hasActiveTenant: boolean;
  currentCycleCharges: number;
  currentCyclePayments: number;
  currentBalance: number;
  openMaintenanceCount?: number | null;
};

export type LedgerActivityInput = {
  id: string;
  entryType?: string;
  chargeType?: string | null;
  paymentMethod?: string | null;
  amount: number;
  memo?: string | null;
  createdAt: Date | string;
  unitId?: string | null;
  unitNumber?: string | null;
};

export type MaintenanceActivityInput = {
  id: string;
  status: string;
  category: string;
  urgency: string;
  description?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  unitId?: string | null;
  unitNumber?: string | null;
};

// --- HELPERS (STRICT) ---

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDateSafe(value: Date | string): Date {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function normalizeEntryType(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

// --- CORE FUNCTIONS ---

export function getDashboardCutoffDate(now = new Date()) {
  const cutoff = new Date(now);
  const day = cutoff.getDay();

  cutoff.setHours(17, 0, 0, 0);

  if (day === 1) cutoff.setDate(cutoff.getDate() - 3);
  else if (day === 0) cutoff.setDate(cutoff.getDate() - 2);
  else cutoff.setDate(cutoff.getDate() - 1);

  return cutoff;
}

function parseDateOnly(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  return new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
}

export function getCycleDates(
  billingDay: number,
  now = new Date()
): { cycleStart: Date; cycleEnd: Date; dueDate: Date } {
  const rentDates = getRentDateSummary({
    dueDay: billingDay,
    gracePeriodDays: 0,
    lateFeeEnabled: false,
    lateFeeInitialCents: 0,
    lateFeeDailyCents: 0,
    maxLateFeeDays: 0,
    now,
  });

  const dueDate = parseDateOnly(rentDates.dueDate);

  const cycleEnd = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth() + 1,
    dueDate.getDate()
  );

  return {
    cycleStart: dueDate,
    cycleEnd,
    dueDate,
  };
}

export function getUnitStatus(input: {
  hasActiveTenant: boolean;
  currentBalance: number;
  currentCyclePayments: number;
  dueDate: Date;
  gracePeriodDays: number;
  now?: Date;
}): DashboardUnitStatus {
  const {
    hasActiveTenant,
    currentBalance,
    currentCyclePayments,
    dueDate,
    gracePeriodDays,
  } = input;

  const now = input.now ?? new Date();

  if (!hasActiveTenant) return "VACANT";
  if (currentBalance <= 0) return "PAID";

  const lateDate = new Date(dueDate);
  lateDate.setDate(lateDate.getDate() + gracePeriodDays + 1);

  if (now >= lateDate) return "DELINQUENT";
  if (currentCyclePayments > 0) return "PARTIAL";

  return "GRACE";
}

export function countStatuses(statuses: DashboardUnitStatus[]): DashboardCounts {
  const counts: DashboardCounts = {
    paid: 0,
    grace: 0,
    partial: 0,
    delinquent: 0,
    vacant: 0,
  };

  for (const s of statuses) {
    counts[s.toLowerCase() as keyof DashboardCounts]++;
  }

  return counts;
}

export function buildExpectedVsCollected(
  units: DashboardUnitInput[]
): ExpectedCollected {
  let expected = 0;
  let collected = 0;

  for (const unit of units) {
    if (unit.hasActiveTenant) {
      expected += toNumber(unit.monthlySubtotal);
    }
    collected += toNumber(unit.currentCyclePayments);
  }

  expected = toMoney(expected);
  collected = toMoney(collected);

  return {
    expectedRentThisCycle: expected,
    collectedThisCycle: collected,
    remainingThisCycle: toMoney(Math.max(expected - collected, 0)),
  };
}

export function buildDashboardSummary(args: {
  units: Array<DashboardUnitInput & { status: DashboardUnitStatus }>;
  ledgerEntriesSinceCutoff: LedgerActivityInput[];
  openMaintenanceCount: number;
}): DashboardSummary {
  let paidSinceClose = 0;
  let newPayments = 0;

  for (const entry of args.ledgerEntriesSinceCutoff) {
    const amount = toNumber(entry.amount);
    const type = normalizeEntryType(entry.entryType);

    if (type === "PAYMENT" || amount < 0) {
      if (amount < 0) {
        paidSinceClose += Math.abs(amount);
        newPayments++;
      }
    }
  }

  return {
    paidSinceClose: toMoney(paidSinceClose),
    newPayments,
    delinquentUnits: args.units.filter((u) => u.status === "DELINQUENT").length,
    openMaintenance: args.openMaintenanceCount,
    vacantUnits: args.units.filter((u) => u.status === "VACANT").length,
  };
}

export function buildNeedsAttention(
  units: Array<DashboardUnitInput & { status: DashboardUnitStatus }>,
  maintenance: MaintenanceActivityInput[]
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];

  for (const unit of units) {
    if (unit.status === "DELINQUENT" || unit.status === "PARTIAL") {
      items.push({
        type: unit.status,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        title: `Unit ${unit.unitNumber} ${unit.status.toLowerCase()}`,
        subtitle:
          unit.status === "DELINQUENT"
            ? "Past due"
            : "Partial payment made",
        amount: toNumber(unit.currentBalance),
      });
    }
  }

  for (const request of maintenance) {
    if (!["COMPLETED", "CLOSED"].includes(request.status)) {
      items.push({
        type: "MAINTENANCE",
        requestId: request.id,
        unitId: request.unitId,
        unitNumber: request.unitNumber,
        title: `Maintenance: ${request.category}`,
        subtitle: request.unitNumber
          ? `Unit ${request.unitNumber} • ${request.urgency}`
          : request.urgency,
        createdAt: request.createdAt,
      });
    }
  }

  return items;
}

export function buildRecentActivity(args: {
  ledgerEntriesSinceCutoff: LedgerActivityInput[];
  maintenanceSinceCutoff: MaintenanceActivityInput[];
}): RecentActivityItem[] {
  const items: RecentActivityItem[] = [];

  for (const entry of args.ledgerEntriesSinceCutoff) {
    const amount = toNumber(entry.amount);
    const type = normalizeEntryType(entry.entryType);
    const chargeType = normalizeEntryType(entry.chargeType);

    if (type === "PAYMENT" || amount < 0) {
      items.push({
        type: "PAYMENT",
        title: "Payment received",
        subtitle: entry.unitNumber
          ? `Unit ${entry.unitNumber}`
          : entry.memo || null,
        amount: Math.abs(amount),
        createdAt: entry.createdAt,
        unitId: entry.unitId,
        unitNumber: entry.unitNumber,
      });
    } else if (type === "CHARGE" && chargeType === "LATE_FEE") {
      items.push({
        type: "LATE_FEE",
        title: "Late fee applied",
        subtitle: entry.unitNumber
          ? `Unit ${entry.unitNumber}`
          : entry.memo || null,
        amount,
        createdAt: entry.createdAt,
        unitId: entry.unitId,
        unitNumber: entry.unitNumber,
      });
    }
  }

  for (const request of args.maintenanceSinceCutoff) {
    const created = toDateSafe(request.createdAt);
    const updated = toDateSafe(request.updatedAt || request.createdAt);

    items.push({
      type:
        updated.getTime() !== created.getTime()
          ? "MAINTENANCE_UPDATED"
          : "MAINTENANCE_CREATED",
      title: `Maintenance ${request.status.toLowerCase()}`,
      subtitle: request.unitNumber
        ? `Unit ${request.unitNumber} • ${request.category}`
        : request.category,
      createdAt: updated,
      unitId: request.unitId,
      unitNumber: request.unitNumber,
    });
  }

  return items.sort(
    (a, b) =>
      toDateSafe(b.createdAt).getTime() -
      toDateSafe(a.createdAt).getTime()
  );
}

export function percentCollected(data: ExpectedCollected) {
  if (data.expectedRentThisCycle <= 0) return 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (data.collectedThisCycle / data.expectedRentThisCycle) * 100
      )
    )
  );
}