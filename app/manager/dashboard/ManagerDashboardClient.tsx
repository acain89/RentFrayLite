"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import BankPanel from "./components/BankPanel";
import ManagerPanel from "./components/ManagerPanel";
import InfoPanel from "./components/InfoPanel";
import MaintPanel from "./components/MaintPanel";
import RentPanel from "./components/RentPanel";
import GpLfPanel from "./components/GpLfPanel";
import AdjustBalanceForm from "./components/AdjustBalanceForm";


export const dynamic = "force-dynamic";

type NextCycleAdjustment = {
  id: string;
  type: "CHARGE" | "CREDIT";
  chargeType: string | null;
  amount: number;
  memo: string | null;
  effectiveDate: string;
  createdAt: string;
  billingCycle: string | null;
};

type Unit = {
  unitId: string;
  unitNumber: string;
  tierId?: string | null;
  tenantName: string | null;
  balance: number;
  isDelinquent: boolean;
  daysPastDue: number;
  tierName?: string | null;
  paymentStatus: "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REVERSED";
  displayStatus?: "PAID" | "PENDING" | "FAILED" | "GRACE" | "PAST_DUE" | "UNPAID";
  statusColor?: "green" | "yellow" | "orange" | "blue" | "red";
  statusLabel?: string;
  isActive: boolean;
  nextCycleAdjustments?: NextCycleAdjustment[];
};

type DashboardPayment = {
  id: string;
  unitNumber: string;
  tierId: string;
  tierName: string;
  amount: number;
  createdAt: string;
  lastName?: string;
};

type DashboardTier = {
  id: string;
  name: string;

  // Max units allowed for this tier.
  configuredUnitCount: number;

  // Current active units assigned to this tier.
  activeUnitCount: number;

  // Remaining open slots.
  availableUnitCount: number;

  // Temporary compatibility for older UI code.
  unitCount?: number;

  baseRent?: number;
};

type DashboardData = {
  property: {
  id: string;
  name: string;
  code: string;
  unitCount: number;
  managementUsers?: {
    id: string;
    role: string;
    email: string | null;
    username: string;
    displayName: string | null;
  }[];
 paymentStatus?: {
  bankConnected?: boolean;
  bankStatus?: "NOT_CONNECTED" | "PENDING" | "CONNECTED" | "RESTRICTED";
  bankMessage?: string;
};
billingCycleStartDate?: string | null;
};
  session: {
    role: "OWNER" | "MANAGER" | "STAFF";
  };
  summary?: {
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    delinquentUnits: number;
  };
    financials?: {
    expected: number;
    collected: number;
    collectionRate: number;
    paidTotal?: number;
    pendingTotal?: number;
    processingTotal?: number;
    failedTotal?: number;
    refundedTotal?: number;
  };
  cycleSnapshot?: {
    billingCycleLabel: string;
    occupiedUnitsLabel: string;
    portalPaidCount: number;
    manualPaidCount: number;
    totalPaidCount: number;
    unpaidUnitsCount: number;
    totalCollected: number;
    totalExpected: number;
    collectionRate: number;
    difference: number;
  };
  units: Unit[];
  payments: DashboardPayment[];
  tiers: DashboardTier[];
};

type UnitStatus =
  | "PAID"
  | "GRACE"
  | "PENDING"
  | "FAILED"
  | "PAST_DUE"
  | "UNPAID"
  | "VACANT";

type PanelKey =
  | "manage"
  | "charges"
  | "rent"
  | "gplf"
  | "manager"
  | "info"
  | "maint"
  | "bank"
  | "exports"
  | null;

type UnitWithStatus = Unit & {
  status: UnitStatus;
  displayLastName: string;
};

type TierGroup = {
  tierName: string;
  units: UnitWithStatus[];
};

type RentTierDraft = {
  id: string;
  tierName: string;

  // Configured max capacity.
  unitCount: string;

  // Current assigned active units.
  activeUnitCount: number;

  // Remaining open slots.
  availableUnitCount: number;

  isNew?: boolean;
  markedForDelete?: boolean;
  baseRent: string;
  dueDay: string;
  graceDays: string;
  lateFeeEnabled: boolean;
  lateFeeAmount: string;
  lateFeeDaily: string;
  lateFeeMaxDays: string;
};

type AdditionalChargeDraft = {
  id: string;
  label: string;
  amount: string;
};

type TierChargesDraft = {
  tierId: string;
  tierName: string;
  charges: AdditionalChargeDraft[];
};

type PropertyChargesResponse = {
  ok?: boolean;
  error?: string;
  effectiveMonth?: string;
  effectiveDate?: string;
  nextEffectiveMonth?: string;
  tiers?: {
    tierId: string;
    tierName: string;
    charges?: {
      id?: string;
      label?: string;
      amount?: number;
      effectiveDate?: string;
      sortOrder?: number;
    }[];
  }[];
};

type MaintenanceRequestRow = {
  id: string;
  unitNumber: string;
  tenantName: string | null;
  category: string;
  urgency: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type MaintenanceListResponse = {
  ok?: boolean;
  error?: string;
  requests?: MaintenanceRequestRow[];
};

type MaintenanceUpdateResponse = {
  ok?: boolean;
  error?: string;
  deletedId?: string;
};

type MaintenanceAction = "COMPLETE" | "IN_PROGRESS" | "DELETE";

type ManagerRole = "MANAGER" | "STAFF";

type ManagerUser = {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string | null;
};

type ManagersListResponse = {
  ok?: boolean;
  error?: string;
  users?: ManagerUser[];
};

type ManagerMutationResponse = {
  ok?: boolean;
  error?: string;
};

type ManagerUpdatePayload = {
  role?: ManagerRole;
  isActive?: boolean;
};

type InactiveUnitRow = {
  id: string;
  unitNumber: string;
  tierName: string;
  lastActiveAt: string;
};

type InactiveUnitsResponse = {
  ok?: boolean;
  error?: string;
  units?: InactiveUnitRow[];
};

function getStatus(unit: Unit): UnitStatus {
  if (!unit.tenantName) return "VACANT";

  switch (unit.displayStatus) {
    case "PAID":
    case "GRACE":
    case "PENDING":
    case "FAILED":
    case "PAST_DUE":
    case "UNPAID":
      return unit.displayStatus;
    default:
      break;
  }

  if (unit.paymentStatus === "FAILED") return "FAILED";
  if (unit.paymentStatus === "PENDING") return "PENDING";
  if (unit.paymentStatus === "PAID") return "PAID";
  if (unit.isDelinquent) return "PAST_DUE";

  return "GRACE";
}

function getStatusDotClass(status: UnitStatus): string {
  switch (status) {
    case "PAID":
      return "bg-emerald-500 ring-2 ring-white shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_2px_6px_rgba(15,23,42,0.18)]";
    case "GRACE":
      return "bg-sky-500 ring-2 ring-white shadow-[0_0_0_1px_rgba(14,165,233,0.35),0_2px_6px_rgba(15,23,42,0.18)]";
    case "PENDING":
      return "bg-amber-400 ring-2 ring-white shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_2px_6px_rgba(15,23,42,0.18)]";
    case "FAILED":
      return "bg-orange-500 ring-2 ring-white shadow-[0_0_0_1px_rgba(249,115,22,0.35),0_2px_6px_rgba(15,23,42,0.18)]";
    case "PAST_DUE":
      return "bg-rose-500 ring-2 ring-white shadow-[0_0_0_1px_rgba(244,63,94,0.35),0_2px_6px_rgba(15,23,42,0.18)]";
    case "UNPAID":
      return "bg-sky-500 ring-2 ring-white shadow-[0_0_0_1px_rgba(14,165,233,0.35),0_2px_6px_rgba(15,23,42,0.18)]";
    case "VACANT":
      return "bg-slate-400 ring-2 ring-white shadow-[0_0_0_1px_rgba(148,163,184,0.35),0_2px_6px_rgba(15,23,42,0.15)]";
    default:
      return "bg-slate-400 ring-2 ring-white shadow-[0_0_0_1px_rgba(148,163,184,0.35),0_2px_6px_rgba(15,23,42,0.15)]";
  }
}

function getStatusText(status: UnitStatus, daysPastDue: number): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case "GRACE":
      return "In grace period";
    case "PENDING":
      return "Payment pending";
    case "FAILED":
      return "Payment failed";
      case "PAST_DUE":
  return `${daysPastDue} day${daysPastDue === 1 ? "" : "s"} past due`;
case "UNPAID":
  return "Balance due";   
    default:
      return "—";
  }
}

function toMoney(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getLastName(tenantName: string | null): string {
  const trimmed = String(tenantName ?? "").trim();
  if (!trimmed) return "-";

  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] || trimmed;
}

function sortUnitsByUnitNumber(a: UnitWithStatus, b: UnitWithStatus): number {
  return a.unitNumber.localeCompare(b.unitNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function slugifyTierName(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createTierDraft(tierName: string, index = 0): RentTierDraft {
  const safeName = String(tierName || `Tier ${index + 1}`).trim();

  return {
    id: `${slugifyTierName(safeName) || `tier-${index + 1}`}-${index}`,
    tierName: safeName,

    unitCount: "0",
    activeUnitCount: 0,
    availableUnitCount: 0,

    isNew: true,
    markedForDelete: false,
    baseRent: "",
    dueDay: "1",
    graceDays: "5",
    lateFeeEnabled: false,
    lateFeeAmount: "",
    lateFeeDaily: "",
    lateFeeMaxDays: "",
  };
}

function urgencyBadgeClass(urgency: string): string {
  switch (urgency.toUpperCase()) {
    case "URGENT":
      return "border-red-200 bg-red-50 text-red-700";
    case "HIGH":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "LOW":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "NORMAL":
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function statusBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "IN_PROGRESS":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "THIRD_PARTY":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "OPEN":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function OverlayShell({
  title,
  subtitle,
  onClose,
  children,
  showFooter = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  showFooter?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#173024]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--rf-border)] bg-[var(--rf-bg-panel)] shadow-[var(--rf-shadow-lg)] sm:h-auto sm:max-h-[90vh] sm:rounded-[32px]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--rf-border)] bg-[rgba(255,255,255,0.28)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-emerald-800">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-[var(--rf-text-soft)]">
                {subtitle}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rf-btn rf-btn-secondary px-3 text-sm"
          >
            Close
          </button>
        </div>

        <div className="rf-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>

        {showFooter ? (
          <div className="border-t border-[var(--rf-border)] bg-[rgba(255,255,255,0.18)] px-4 py-4 sm:px-6" />
        ) : null}
      </div>
    </div>
  );
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, next };
}

type ManageSectionItem = {
  label: string;
  description: string;
  panel: Exclude<PanelKey, "manage" | null>;
};

function ManageSection({
  title,
  helper,
  items,
  openPanel,
}: {
  title: string;
  helper: string;
  items: ManageSectionItem[];
  openPanel: (panel: Exclude<PanelKey, null>) => void;
}) {
 return (
  <section className="rounded-[26px] border border-emerald-300/60 bg-gradient-to-br from-white via-emerald-50/40 to-sky-50/30 p-4 shadow-[var(--rf-shadow-sm)]">
    <div className="mb-3">
  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
    {title}
  </h3>

  <p className="mt-1 text-xs leading-5 text-[var(--rf-text-soft)]">
    {helper}
  </p>
</div>

    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={`${title}-${item.label}`}
          type="button"
          onClick={() => openPanel(item.panel)}
          className="flex w-full flex-col gap-1 rounded-2xl border border-emerald-200/70 bg-white/70 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-sky-50 hover:shadow-[var(--rf-shadow-sm)] sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="text-sm font-semibold text-emerald-800">
            {item.label}
          </span>

          <span className="text-xs text-[var(--rf-text-soft)] sm:max-w-[62%] sm:text-right">
            {item.description}
          </span>
        </button>
      ))}
    </div>
  </section>
);
}

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitWithStatus | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [manualPaymentAmount, setManualPaymentAmount] = useState("");
  const [showManualPaymentConfirm, setShowManualPaymentConfirm] = useState(false);
  const [submittingManualPayment, setSubmittingManualPayment] = useState(false);
  const [vacatingUnit, setVacatingUnit] = useState(false);
  const [showVacateConfirm, setShowVacateConfirm] = useState(false);
  const [showInactiveConfirm, setShowInactiveConfirm] = useState(false);
  const [togglingUnitActive, setTogglingUnitActive] = useState(false);
  const [showMoveTierModal, setShowMoveTierModal] = useState(false);
  const [targetMoveTierId, setTargetMoveTierId] = useState("");
  const [movingTier, setMovingTier] = useState(false);
  const [moveTierError, setMoveTierError] = useState("");
  const [vacateError, setVacateError] = useState("");
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [localTiers, setLocalTiers] = useState<RentTierDraft[]>([]);
  const [tierCharges, setTierCharges] = useState<TierChargesDraft[]>([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargesError, setChargesError] = useState("");
  const [savingCharges, setSavingCharges] = useState(false);
  const [chargesEffectiveMonth, setChargesEffectiveMonth] = useState("");
  const viewMode: "full" = "full";
  const [exportSelectedUnit, setExportSelectedUnit] = useState("");
  const [exportUnitError, setExportUnitError] = useState("");
  const [showChangeLogin, setShowChangeLogin] = useState(false);
  const [changeCurrentLogin, setChangeCurrentLogin] = useState("");
  const [changeCurrentPassword, setChangeCurrentPassword] = useState("");
  const [changeNewEmail, setChangeNewEmail] = useState("");
  const [changeNewPassword, setChangeNewPassword] = useState("");
  const [changeConfirmPassword, setChangeConfirmPassword] = useState("");
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);
  const [inactiveUnits, setInactiveUnits] = useState<InactiveUnitRow[]>([]);
  const [inactiveUnitsLoading, setInactiveUnitsLoading] = useState(false);
  const [inactiveUnitsError, setInactiveUnitsError] = useState("");
  const [inactiveActionUnitId, setInactiveActionUnitId] = useState("");
  const [confirmReactivateUnitId, setConfirmReactivateUnitId] = useState("");
  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState("");
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [billingCycleStartDate, setBillingCycleStartDate] = useState("");
  const [billingCycleStartDateLocked, setBillingCycleStartDateLocked] = useState(false);
  const [savingBillingCycleStartDate, setSavingBillingCycleStartDate] = useState(false);


  const [gpLfSettings, setGpLfSettings] = useState({
  dueDay: "1",
  graceDays: "5",
  lateFeeEnabled: false,
  lateFeeInitial: "",
  lateFeeDaily: "",
  lateFeeMaxDays: "",
});

 const [gpLfTierMode, setGpLfTierMode] = useState<"all" | "selected">("all");
  const [gpLfSelectedTierIds, setGpLfSelectedTierIds] = useState<string[]>([]);
  const [savingGpLf, setSavingGpLf] = useState(false);
  const [gpLfSaveMessage, setGpLfSaveMessage] = useState("");

useEffect(() => {
  if (!data?.tiers?.length) {
    setLocalTiers([]);
    return;
  }

  setLocalTiers(
    data.tiers.map((tier, index) => ({
      id: tier.id,
      tierName: tier.name,
      unitCount: String(tier.configuredUnitCount ?? tier.unitCount ?? 0),
      activeUnitCount: tier.activeUnitCount ?? 0,
      availableUnitCount: tier.availableUnitCount ?? 0,
      isNew: false,
      markedForDelete: false,
      baseRent: String(tier.baseRent ?? ""),
      dueDay: String((tier as { rentDueDay?: number }).rentDueDay ?? 1),
      graceDays: String(
        (tier as { gracePeriodDays?: number }).gracePeriodDays ?? 5
      ),
      lateFeeEnabled:
        ((tier as { lateFeeInitialCents?: number }).lateFeeInitialCents ?? 0) >
          0 ||
        ((tier as { lateFeeDailyCents?: number }).lateFeeDailyCents ?? 0) > 0,
      lateFeeAmount:
        ((tier as { lateFeeInitialCents?: number }).lateFeeInitialCents ?? 0) >
        0
          ? String(
              (((tier as { lateFeeInitialCents?: number })
                .lateFeeInitialCents ?? 0) / 100)
            )
          : "",
      lateFeeDaily:
        ((tier as { lateFeeDailyCents?: number }).lateFeeDailyCents ?? 0) > 0
          ? String(
              (((tier as { lateFeeDailyCents?: number })
                .lateFeeDailyCents ?? 0) / 100)
            )
          : "",
      lateFeeMaxDays:
        ((tier as { maxLateFeeDays?: number }).maxLateFeeDays ?? 0) > 0
          ? String(
              (tier as { maxLateFeeDays?: number }).maxLateFeeDays ?? 0
            )
          : "",
    }))
  );
}, [data?.tiers]);

function updateGpLf(
  updates: Partial<typeof gpLfSettings>
): void {
  setGpLfSettings((prev) => ({
    ...prev,
    ...updates,
  }));
}

function toggleGpLfTierSelection(tierId: string): void {
  setGpLfSelectedTierIds((current) =>
    current.includes(tierId)
      ? current.filter((id) => id !== tierId)
      : [...current, tierId]
  );
}


function getGpLfSettingsFromTiers(tiers: RentTierDraft[]) {
  const source =
    tiers.find(
      (t) =>
        t.lateFeeEnabled ||
        Number(t.lateFeeAmount || 0) > 0 ||
        Number(t.lateFeeDaily || 0) > 0 ||
        Number(t.lateFeeMaxDays || 0) > 0
    ) ?? tiers[0];

  if (!source) {
    return {
      dueDay: "1",
      graceDays: "5",
      lateFeeEnabled: false,
      lateFeeInitial: "",
      lateFeeDaily: "",
      lateFeeMaxDays: "",
    };
  }

  return {
    dueDay: source.dueDay || "1",
    graceDays: source.graceDays || "5",
    lateFeeEnabled:
      source.lateFeeEnabled ||
      Number(source.lateFeeAmount || 0) > 0 ||
      Number(source.lateFeeDaily || 0) > 0,
    lateFeeInitial: source.lateFeeAmount || "",
    lateFeeDaily: source.lateFeeDaily || "",
    lateFeeMaxDays: source.lateFeeMaxDays || "",
  };
}

  type GpLfTierSnapshot = {
  id: string;
  tierName: string;
  dueDay: string;
  graceDays: string;
  lateFeeEnabled: boolean;
  lateFeeInitial: string;
  lateFeeDaily: string;
  lateFeeMaxDays: string;
};

function formatGpLfMoney(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

function getGpLfTierSnapshot(tier: RentTierDraft): GpLfTierSnapshot {
  return {
    id: tier.id,
    tierName: tier.tierName,
    dueDay: tier.dueDay || "1",
    graceDays: tier.graceDays || "0",
    lateFeeEnabled: Boolean(tier.lateFeeEnabled),
    lateFeeInitial: tier.lateFeeAmount || "0",
    lateFeeDaily: tier.lateFeeDaily || "0",
    lateFeeMaxDays: tier.lateFeeMaxDays || "0",
  };
}

function getMixedText(values: string[]): string {
  const unique = Array.from(new Set(values.map((value) => String(value).trim())));
  return unique.length <= 1 ? (unique[0] || "—") : "Mixed";
}

function getMixedBooleanText(values: boolean[]): string {
  const unique = Array.from(new Set(values));
  return unique.length <= 1 ? (unique[0] ? "Enabled" : "Disabled") : "Mixed";
}

  const managers = data?.property?.managementUsers ?? [];
  const [managersLoading, setManagersLoading] = useState(false);
  const [managersError, setManagersError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<ManagerRole>("STAFF");
  const [creatingUser, setCreatingUser] = useState(false);

  const [maintenancePin, setMaintenancePin] = useState("");
  const [maintenancePinConfirm, setMaintenancePinConfirm] = useState("");
  const [maintenanceRequests, setMaintenanceRequests] = useState<
    MaintenanceRequestRow[]
  >([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [maintenanceActionId, setMaintenanceActionId] = useState("");
  const [maintenanceActionError, setMaintenanceActionError] = useState("");
  const [savingMaintenancePin, setSavingMaintenancePin] = useState(false);
  const [maintenancePinError, setMaintenancePinError] = useState("");
  const [maintenancePinSuccess, setMaintenancePinSuccess] = useState("");
  const [maintenancePinSet, setMaintenancePinSet] = useState(false);

  const sessionRole = data?.session?.role || "OWNER";
  const canManageMoney = sessionRole === "OWNER" || sessionRole === "MANAGER";
  const canVacateUnit = sessionRole === "OWNER" || sessionRole === "MANAGER";
  const canManageMaintenance =
    sessionRole === "OWNER" || sessionRole === "MANAGER";
  const canEditRentSettings =
    sessionRole === "OWNER" || sessionRole === "MANAGER";
  const canEditLateFeeSettings =
    sessionRole === "OWNER" || sessionRole === "MANAGER";
  const canManageManagers = sessionRole === "OWNER";
  const isOwner = sessionRole === "OWNER";
  const propertyName = data?.property?.name ?? "Manager Dashboard";
  const [pendingUnitCount, setPendingUnitCount] = useState<number | null>(null);
  const [updatingUnitCount, setUpdatingUnitCount] = useState(false);
  const propertyCode = data?.property?.code ?? "----";
  const bankStatus = data?.property?.paymentStatus?.bankStatus;
  const bankMessage = data?.property?.paymentStatus?.bankMessage;

  const activeUnitCount = useMemo(() => {
  return Array.isArray(data?.units)
    ? data.units.filter((unit) => unit.isActive).length
    : 0;
}, [data?.units]);

 const [exportMonth, setExportMonth] = useState("");

const [exportType, setExportType] = useState<"balances" | "ledger" | "payments">("balances");
const [exportUnitSearch, setExportUnitSearch] = useState("");
const [exporting, setExporting] = useState(false);

async function updateUnitCount(next: number): Promise<void> {
  if (data?.property?.unitCount == null) return;
  if (updatingUnitCount) return;

  const confirmed = window.confirm(
    `Update total units to ${next}?`
  );

  if (!confirmed) return;

  try {
    setUpdatingUnitCount(true);

    const res = await fetch("/api/manager/property/unit-count", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ unitCount: next }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Failed to update unit count.");
      return;
    }

await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
  } catch {
    alert("Failed to update unit count.");
  } finally {
    setUpdatingUnitCount(false);
  }
}

async function connectBank(): Promise<void> {
  try {
    const res = await fetch("/api/stripe/connect", {
      method: "POST",
      credentials: "include",
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok || !json?.url) {
      alert(json?.error || "Failed to start bank connection.");
      return;
    }

    window.location.href = json.url;
  } catch {
    alert("Failed to start bank connection.");
  }
}

async function handleOnboard(): Promise<void> {
  try {
    const res = await fetch("/api/stripe/onboard", {
      method: "POST",
      credentials: "include",
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.url) {
      alert(json?.error || "Failed to continue Stripe setup.");
      return;
    }

    window.location.href = json.url;
  } catch {
    alert("Failed to continue Stripe setup.");
  }
}

async function logout(): Promise<void> {
  try {
    await fetch("/api/manager/session", {
      method: "DELETE",
      credentials: "include",
    });
    window.location.href = "/";
  } catch {
    alert("Logout failed");
  }
}

  async function loadDashboard(): Promise<void> {
  if (loadingDashboard) return;

  try {
    setLoadingDashboard(true);
    setLoading(true);
    setError("");

    const response = await fetch("/api/manager/dashboard", {
      credentials: "include",
      cache: "no-store",
    });

    const json = (await response.json().catch(() => null)) as
      | DashboardData
      | { error?: string }
      | null;

    if (!response.ok) {
      setError(
        json && "error" in json && typeof json.error === "string"
          ? json.error
          : "Failed to load dashboard."
      );
      setData(null);
      return;
    }

    setData(json as DashboardData);
  } catch {
    setError("Failed to load dashboard.");
    setData(null);
  } finally {
    setLoading(false);
    setLoadingDashboard(false);
  }
}

  async function loadMaintenanceRequests(): Promise<void> {
    try {
      setMaintenanceLoading(true);
      setMaintenanceError("");
      setMaintenanceActionError("");

      const response = await fetch("/api/manager/maintenance", {
        credentials: "include",
        cache: "no-store",
      });

      const json = (await response.json().catch(() => null)) as
        | MaintenanceListResponse
        | null;

      if (!response.ok || !json?.ok) {
        setMaintenanceError(json?.error || "Failed to load maintenance.");
        setMaintenanceRequests([]);
        return;
      }

      setMaintenanceRequests(Array.isArray(json.requests) ? json.requests : []);
    } catch {
      setMaintenanceError("Failed to load maintenance.");
      setMaintenanceRequests([]);
    } finally {
      setMaintenanceLoading(false);
    }
  }

async function loadMaintenancePinStatus(): Promise<void> {
  try {
    const response = await fetch("/api/manager/maintenance/pin", {
      credentials: "include",
      cache: "no-store",
    });

    const json = (await response.json().catch(() => null)) as
      | { ok?: boolean; hasPin?: boolean; error?: string }
      | null;

    if (response.ok && json?.ok) {
      setMaintenancePinSet(Boolean(json.hasPin));
    }
  } catch {
    // leave silent
  }
}

async function loadPropertyTiers(): Promise<void> {
  if (!data?.tiers?.length) {
    setLocalTiers([createTierDraft("Tier 1", 0)]);
    return;
  }

  setLocalTiers(
    data.tiers.map((tier, index) => ({
      id: tier.id,
      tierName: tier.name || `Tier ${index + 1}`,
      unitCount: String(tier.configuredUnitCount ?? tier.unitCount ?? 0),
      activeUnitCount: tier.activeUnitCount ?? 0,
      availableUnitCount: tier.availableUnitCount ?? 0,
      isNew: false,
      markedForDelete: false,
      baseRent: typeof tier.baseRent === "number" ? String(tier.baseRent) : "",
      dueDay: String((tier as { rentDueDay?: number }).rentDueDay ?? 1),
      graceDays: String(
        (tier as { gracePeriodDays?: number }).gracePeriodDays ?? 5
      ),
      lateFeeEnabled:
        ((tier as { lateFeeInitialCents?: number }).lateFeeInitialCents ?? 0) >
          0 ||
        ((tier as { lateFeeDailyCents?: number }).lateFeeDailyCents ?? 0) > 0,
      lateFeeAmount:
        ((tier as { lateFeeInitialCents?: number }).lateFeeInitialCents ?? 0) >
        0
          ? String(
              ((tier as { lateFeeInitialCents?: number })
                .lateFeeInitialCents ?? 0) / 100
            )
          : "",
      lateFeeDaily:
        ((tier as { lateFeeDailyCents?: number }).lateFeeDailyCents ?? 0) > 0
          ? String(
              ((tier as { lateFeeDailyCents?: number }).lateFeeDailyCents ??
                0) / 100
            )
          : "",
      lateFeeMaxDays:
        ((tier as { maxLateFeeDays?: number }).maxLateFeeDays ?? 0) > 0
          ? String((tier as { maxLateFeeDays?: number }).maxLateFeeDays ?? 0)
          : "",
    }))
  );
}

async function loadTierCharges(): Promise<void> {
  if (!data?.property?.id) return;

  try {
    setChargesLoading(true);
    setChargesError("");

    const res = await fetch(
      `/api/admin/properties/${data.property.id}/charges`,
      {
        credentials: "include",
        cache: "no-store",
      }
    );

    const json = (await res.json().catch(() => null)) as
      | PropertyChargesResponse
      | null;

    if (!res.ok || !json?.ok) {
      setChargesError(json?.error || "Failed to load charges.");
      setTierCharges([]);
      return;
    }

    const nextMonth = String(json?.nextEffectiveMonth || "");
    setChargesEffectiveMonth(nextMonth);

    const tiers = Array.isArray(json?.tiers) ? json.tiers : [];

    setTierCharges(
  tiers.map((tier, tierIndex) => ({
    tierId: String(tier.tierId || `tier-${tierIndex}`),
    tierName: String(tier.tierName || `Tier ${tierIndex + 1}`),

    charges:
      Array.isArray(tier.charges) && tier.charges.length > 0
        ? tier.charges.map((charge, chargeIndex) => ({
            id: String(charge.id || `charge-${tierIndex}-${chargeIndex}`),
            label: String(charge.label || ""),
            amount:
              typeof charge.amount === "number"
                ? String(charge.amount)
                : "",
          }))
        : [
            {
              id: `new-${tierIndex}-0`,
              label: "",
              amount: "",
            },
          ],
  }))
);
  } catch {
    setChargesError("Failed to load charges.");
    setTierCharges([]);
  } finally {
    setChargesLoading(false);
  }
}

function updateTierCharge(
  tierId: string,
  chargeId: string,
  updates: Partial<AdditionalChargeDraft>
): void {
  setTierCharges((current) =>
    current.map((tier) =>
      tier.tierId === tierId
        ? {
            ...tier,
            charges: tier.charges.map((charge) =>
              charge.id === chargeId
                ? {
                    ...charge,
                    ...updates,
                  }
                : charge
            ),
          }
        : tier
    )
  );
}

function addTierCharge(tierId: string): void {
  setTierCharges((current) =>
    current.map((tier) =>
      tier.tierId === tierId
        ? {
            ...tier,
            charges: [...tier.charges, createChargeDraft(tier.charges.length)],
          }
        : tier
    )
  );
}

function removeTierCharge(tierId: string, chargeId: string): void {
  setTierCharges((current) =>
    current.map((tier) =>
      tier.tierId === tierId
        ? {
            ...tier,
            charges: tier.charges.filter((charge) => charge.id !== chargeId),
          }
        : tier
    )
  );
}

async function saveTierCharges(): Promise<void> {
  if (!data?.property?.id) return;

  try {
    setSavingCharges(true);
    setChargesError("");

    const res = await fetch(
      `/api/admin/properties/${data.property.id}/charges`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          tiers: tierCharges.map((tier) => ({
            tierId: tier.tierId,
            charges: tier.charges.map((charge) => ({
              label: charge.label,
              amount: charge.amount,
              isActive: true,
            })),
          })),
        }),
      }
    );

    const json = (await res.json().catch(() => null)) as
      | PropertyChargesResponse
      | null;

    if (!res.ok || !json?.ok) {
      setChargesError(json?.error || "Failed to save charges.");
      return;
    }

    if (typeof json.effectiveDate === "string") {
      setChargesEffectiveMonth(json.effectiveDate);
    }

    await loadTierCharges();
await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
alert("Charges saved");
  } catch {
    setChargesError("Failed to save charges.");
  } finally {
    setSavingCharges(false);
  }
} 

  async function submitVacateUnit(): Promise<void> {
    if (!selectedUnit || vacatingUnit || !canVacateUnit) return;

    try {
      setVacatingUnit(true);
      setVacateError("");

      const response = await fetch("/api/manager/units/vacate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          unitId: selectedUnit.unitId,
        }),
      });

      const json = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !json?.ok) {
        setVacateError(json?.error || "Failed to vacate unit.");
        return;
      }

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          units: current.units.map((unit) =>
            unit.unitId === selectedUnit.unitId
              ? {
                  ...unit,
                  tenantName: null,
                  balance: 0,
                  isDelinquent: false,
                  daysPastDue: 0,
                }
              : unit
          ),
        };
      });

      setShowVacateConfirm(false);
      closeUnitPanel();
    } catch {
      setVacateError("Failed to vacate unit.");
    } finally {
      setVacatingUnit(false);
    }
  }

async function submitToggleUnitActive(): Promise<void> {
  if (!selectedUnit || togglingUnitActive || !canVacateUnit) return;

  try {
    setTogglingUnitActive(true);

    const res = await fetch("/api/manager/units/toggle-active", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        unitId: selectedUnit.unitId,
        makeActive: !selectedUnit.isActive,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Failed to update unit status.");
      return;
    }


await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
    setShowInactiveConfirm(false);
    closeUnitPanel();
  } catch {
    alert("Failed to update unit status.");
  } finally {
    setTogglingUnitActive(false);
  }
} 

async function submitMoveTier(): Promise<void> {
  if (!selectedUnit || movingTier || !canVacateUnit) return;

  if (!targetMoveTierId) {
    setMoveTierError("Choose a target tier.");
    return;
  }

  try {
    setMovingTier(true);
    setMoveTierError("");

    const res = await fetch("/api/manager/units/move-tier", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        unitId: selectedUnit.unitId,
        targetTierId: targetMoveTierId,
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!res.ok || !json?.ok) {
      setMoveTierError(json?.error || "Failed to move unit.");
      return;
    }

    await loadDashboard();
    await loadPropertyTiers();

    setShowMoveTierModal(false);
    setTargetMoveTierId("");
    closeUnitPanel();
  } catch {
    setMoveTierError("Failed to move unit.");
  } finally {
    setMovingTier(false);
  }
} 

  async function saveMaintenancePin(): Promise<void> {
    if (savingMaintenancePin || !canManageMaintenance) return;

    if (!/^\d{4}$/.test(maintenancePin)) {
      setMaintenancePinError("PIN must be exactly 4 digits.");
      setMaintenancePinSuccess("");
      return;
    }

    if (maintenancePin !== maintenancePinConfirm) {
      setMaintenancePinError("PIN and confirm PIN must match.");
      setMaintenancePinSuccess("");
      return;
    }

    try {
      setSavingMaintenancePin(true);
      setMaintenancePinError("");
      setMaintenancePinSuccess("");

      const response = await fetch("/api/manager/maintenance/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          pin: maintenancePin,
        }),
      });

      const json = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !json?.ok) {
        setMaintenancePinError(json?.error || "Failed to save maintenance PIN.");
        return;
      }

      setMaintenancePinSuccess("Maintenance PIN saved.");
      setMaintenancePinSet(true);
      setMaintenancePin("");
      setMaintenancePinConfirm("");
    } catch {
      setMaintenancePinError("Failed to save maintenance PIN.");
    } finally {
      setSavingMaintenancePin(false);
    }
  }

  async function submitManualPayment(): Promise<void> {
    if (!selectedUnit || submittingManualPayment || !canManageMoney) return;

    const amount = Number(manualPaymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Invalid amount");
      return;
    }

    try {
      setSubmittingManualPayment(true);

      const response = await fetch("/api/manual-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          unitId: selectedUnit.unitId,
          amount,
          effectiveDate: new Date().toISOString().slice(0, 10),
        }),
      });

      const json = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok) {
        alert(json?.error || "Payment failed");
        return;
      }

      const normalizedAmount = Math.round(amount * 100) / 100;

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          units: current.units.map((unit) =>
            unit.unitId === selectedUnit.unitId
              ? {
                  ...unit,
                  balance: Math.max(
                    0,
                    Math.round(
                      (Number(unit.balance || 0) - normalizedAmount) * 100
                    ) / 100
                  ),
                }
              : unit
          ),
        };
      });

      setShowManualPaymentConfirm(false);
      closeUnitPanel();
    } catch {
      alert("Payment error");
    } finally {
      setSubmittingManualPayment(false);
    }
  }

  async function runMaintenanceAction(
    requestId: string,
    action: MaintenanceAction
  ): Promise<void> {
    if (maintenanceActionId || !canManageMaintenance) return;

    try {
      setMaintenanceActionId(requestId);
      setMaintenanceActionError("");

      const body =
        action === "DELETE"
          ? { requestId, action: "DELETE" }
          : { requestId, status: action };

      const response = await fetch("/api/manager/maintenance/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const json = (await response.json().catch(() => null)) as
        | MaintenanceUpdateResponse
        | null;

      if (!response.ok || !json?.ok) {
        setMaintenanceActionError(
          json?.error || "Failed to update maintenance request."
        );
        return;
      }

      if (action === "DELETE") {
        setMaintenanceRequests((current) =>
          current.filter((request) => request.id !== requestId)
        );
        return;
      }

      setMaintenanceRequests((current) =>
        current.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: action,
                updatedAt: new Date().toISOString(),
              }
            : request
        )
      );
    } catch {
      setMaintenanceActionError("Failed to update maintenance request.");
    } finally {
      setMaintenanceActionId("");
    }
  }

   function getExportMonthOptions(
  startDateString?: string | null
): { value: string; label: string }[] {
  if (!startDateString) return [];

  const startDate = new Date(startDateString);
  if (Number.isNaN(startDate.getTime())) return [];

  const now = new Date();

  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);

  const months: { value: string; label: string }[] = [];

  let cursor = new Date(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;

    const value = `${year}-${String(month).padStart(2, "0")}`;
    const label = cursor.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    months.push({ value, label });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months.reverse(); // newest first
}

async function runExport(): Promise<void> {
  try {
    setExporting(true);

    const params = new URLSearchParams({
      month: exportMonth,
    });

    if (exportSelectedUnit.trim()) {
  params.set("unit", exportSelectedUnit.trim());
}

    const response = await fetch(`/api/exports/${exportType}?${params.toString()}`, {
      credentials: "include",
    });

    if (!response.ok) {
  let errorMessage = "Export failed.";

  try {
    const errorJson = await response.clone().json();

    if (typeof errorJson?.error === "string" && errorJson.error.trim()) {
      errorMessage = errorJson.error;
    }
  } catch {
    try {
      const errorText = await response.clone().text();

      if (errorText.trim()) {
        errorMessage = errorText;
      }
    } catch {
      //
    }
  }

  alert(errorMessage);
  return;
}

const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `rentfray-${exportType}-${exportMonth}.csv`;
document.body.appendChild(a);
a.click();
a.remove();
window.URL.revokeObjectURL(url);
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      alert(error.message);
    } else {
      alert("Export failed.");
    }
  } finally {
    setExporting(false);
  }
}

const exportMonthOptions = getExportMonthOptions(
  data?.property?.billingCycleStartDate
);


  async function createManager(): Promise<void> {
    if (!newEmail || !newPassword || !data?.property?.id) return;

    try {
      setCreatingUser(true);

      const res = await fetch(
        `/api/admin/properties/${data.property.id}/management-users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: newEmail,
            password: newPassword,
            role: newRole,
          }),
        }
      );

      const json = (await res.json().catch(() => null)) as
        | ManagerMutationResponse
        | null;

      if (!res.ok || !json?.ok) {
        alert(json?.error || "Failed to create user");
        return;
      }

      setNewEmail("");
      setNewPassword("");
      setNewRole("STAFF");

     
await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
    } finally {
      setCreatingUser(false);
    }
  }

  async function submitChangeLogin(): Promise<void> {
  try {
    const res = await fetch("/api/manager/account/change-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
  currentLogin: changeCurrentLogin,
  currentPassword: changeCurrentPassword,
  newEmail: changeNewEmail,
  newPassword: changeNewPassword,
  confirmPassword: changeConfirmPassword,
}),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Failed to update login");
      return;
    }

    alert("Login updated successfully");

    setChangeCurrentLogin("");
    setChangeCurrentPassword("");
    setChangeNewEmail("");
    setChangeNewPassword("");
    setChangeConfirmPassword("");
    setShowChangeLogin(false);
  } catch {
    alert("Failed to update login");
  }
}

async function loadInactiveUnits(): Promise<void> {
  try {
    setInactiveUnitsLoading(true);
    setInactiveUnitsError("");

    const res = await fetch("/api/manager/units/inactive", {
      credentials: "include",
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as
      | InactiveUnitsResponse
      | null;

    if (!res.ok || !json?.ok) {
      setInactiveUnitsError(json?.error || "Failed to load inactive units.");
      setInactiveUnits([]);
      return;
    }

    setInactiveUnits(Array.isArray(json.units) ? json.units : []);
  } catch {
    setInactiveUnitsError("Failed to load inactive units.");
    setInactiveUnits([]);
  } finally {
    setInactiveUnitsLoading(false);
  }
}

async function reactivateInactiveUnit(unitId: string): Promise<void> {
  try {
    setInactiveActionUnitId(unitId);

    const res = await fetch("/api/manager/units/toggle-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        unitId,
        makeActive: true,
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Failed to reactivate unit.");
      return;
    }

    setConfirmReactivateUnitId("");
    await loadInactiveUnits();
await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
  } catch {
    alert("Failed to reactivate unit.");
  } finally {
    setInactiveActionUnitId("");
  }
}

async function deleteInactiveUnit(unitId: string): Promise<void> {
  try {
    setInactiveActionUnitId(unitId);

    const res = await fetch("/api/manager/units/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        unitId,
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Failed to delete inactive unit.");
      return;
    }

   setConfirmDeleteUnitId("");
await loadInactiveUnits();
await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
  } catch {
    alert("Failed to delete inactive unit.");
  } finally {
    setInactiveActionUnitId("");
  }
}

  async function updateManager(
    userId: string,
    updates: ManagerUpdatePayload
  ): Promise<void> {
    try {
      if (!data?.property?.id) return;

      const res = await fetch(
        `/api/admin/properties/${data.property.id}/management-users`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId,
            ...updates,
          }),
        }
      );

      const json = (await res.json().catch(() => null)) as
        | ManagerMutationResponse
        | null;

      if (!res.ok || !json?.ok) {
        alert(json?.error || "Update failed");
        return;
      }

await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
    } catch {
      alert("Update failed");
    }
  }

 
useEffect(() => {
  if (
    activePanel === "manager" &&
    showInactiveUnits &&
    (sessionRole === "OWNER" || sessionRole === "MANAGER")
  ) {
    void loadInactiveUnits();
  }
}, [activePanel, showInactiveUnits, sessionRole]);

useEffect(() => {
  const raw = data?.property?.billingCycleStartDate ?? "";
  setBillingCycleStartDate(raw ? raw.slice(0, 10) : "");
}, [data]);

useEffect(() => {
  (async () => {
    await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
  })();
}, []);

useEffect(() => {
  if (!data) return;

  const configuredUnitCount = Number(data.property?.unitCount ?? 0);

  setPendingUnitCount(configuredUnitCount);
}, [data]);


useEffect(() => {
  if (activePanel !== "gplf") return;

  const nextVisibleTierIds =
    gpLfTierMode === "all"
      ? localTiers.map((tier) => tier.id)
      : gpLfSelectedTierIds;

  const visibleTiers = localTiers.filter((tier) =>
    nextVisibleTierIds.includes(tier.id)
  );

  setGpLfSettings(getGpLfSettingsFromTiers(visibleTiers));
}, [activePanel, gpLfTierMode, gpLfSelectedTierIds, localTiers]);

useEffect(() => {
  if (activePanel === "maint") {
    void loadMaintenanceRequests();
    void loadMaintenancePinStatus();
  }
}, [activePanel]);

useEffect(() => {
  if (activePanel === "charges") {
    void loadTierCharges();
  }
}, [activePanel, data?.property?.id]);

useEffect(() => {
  if (!exportMonthOptions.length) return;

  // default to most recent month
  setExportMonth(exportMonthOptions[0].value);
}, [exportMonthOptions]);

const unitsWithStatus = useMemo<UnitWithStatus[]>(() => {
  if (!data?.units?.length) return [];

  return data.units
    .map((unit) => ({
      ...unit,
      status: getStatus(unit),
      displayLastName: getLastName(unit.tenantName),
    }))
    .sort(sortUnitsByUnitNumber);
}, [data]);

const tierGroups = useMemo<TierGroup[]>(() => {
  const groups = new Map<string, UnitWithStatus[]>();

  for (const unit of unitsWithStatus) {
    const tierName = String(unit.tierName ?? "").trim() || "Units";
    const existing = groups.get(tierName) ?? [];
    existing.push(unit);
    groups.set(tierName, existing);
  }

  return Array.from(groups.entries())
    .map(([tierName, units]) => ({
      tierName,
      units: [...units].sort(sortUnitsByUnitNumber),
    }))
    .sort((a, b) =>
      a.tierName.localeCompare(b.tierName, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
}, [unitsWithStatus]);



  const sortedMaintenanceRequests = useMemo<MaintenanceRequestRow[]>(() => {
    return [...maintenanceRequests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [maintenanceRequests]);

    const stats = useMemo(() => {
    const totalUnits = unitsWithStatus.length;
    const occupiedUnits = unitsWithStatus.filter(u => u.tenantName).length;
    const vacantUnits = unitsWithStatus.filter(u => !u.tenantName).length;
    const tiers = tierGroups.length;

    return {
      totalUnits,
      occupiedUnits,
      vacantUnits,
      tiers,
    };
  }, [tierGroups.length, unitsWithStatus]);

   const gpLfVisibleTierIds = useMemo<string[]>(() => {
  return gpLfTierMode === "all"
    ? localTiers.map((tier) => tier.id)
    : gpLfSelectedTierIds;
}, [gpLfTierMode, gpLfSelectedTierIds, localTiers]);

const gpLfVisibleTiers = useMemo<GpLfTierSnapshot[]>(() => {
  return localTiers
    .filter((tier) => gpLfVisibleTierIds.includes(tier.id))
    .map(getGpLfTierSnapshot);
}, [gpLfVisibleTierIds, localTiers]);

const gpLfComparisonSummary = useMemo(() => {
  if (gpLfVisibleTiers.length === 0) {
    return null;
  }

  return {
    dueDay: getMixedText(gpLfVisibleTiers.map((tier) => tier.dueDay)),
    graceDays: getMixedText(gpLfVisibleTiers.map((tier) => tier.graceDays)),
    lateFeeStatus: getMixedBooleanText(
      gpLfVisibleTiers.map((tier) => tier.lateFeeEnabled)
    ),
    lateFeeInitial: getMixedText(
      gpLfVisibleTiers.map((tier) => tier.lateFeeInitial)
    ),
    lateFeeDaily: getMixedText(
      gpLfVisibleTiers.map((tier) => tier.lateFeeDaily)
    ),
    lateFeeMaxDays: getMixedText(
      gpLfVisibleTiers.map((tier) => tier.lateFeeMaxDays)
    ),
  };
}, [gpLfVisibleTiers]);

  function openUnitPanel(unit: UnitWithStatus): void {
    setShowVacateConfirm(false);
    setShowInactiveConfirm(false);
    setVacateError("");
    setShowMoveTierModal(false);
    setTargetMoveTierId("");
    setMoveTierError("");
    setSelectedUnit(unit);
    setManualPaymentAmount(Number(unit.balance || 0).toFixed(2));
    setShowManualPaymentConfirm(false);
  }

function goBackToManage() {
  setActivePanel("manage");
}

function updateLocalTier(
  tierId: string,
  updates: Partial<RentTierDraft>
): void {
  setLocalTiers((current) =>
    current.map((tier) =>
      tier.id === tierId
        ? {
            ...tier,
            ...updates,
          }
        : tier
    )
  );
}

function removeLocalTier(tierId: string): void {
  setLocalTiers((current) =>
    current.flatMap((tier) => {
      if (tier.id !== tierId) {
        return [tier];
      }

      if (tier.isNew) {
        return [];
      }

      return [
        {
          ...tier,
          markedForDelete: true,
        },
      ];
    })
  );

  setEditingTierId((current) =>
    current === tierId ? null : current
  );
}

function createChargeDraft(index = 0): AdditionalChargeDraft {
  return {
    id: `charge-${index}-${Date.now()}`,
    label: "",
    amount: "",
  };
}

function formatMonthLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "next month";
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function addLocalTier(): void {
  setLocalTiers((current) => {
    const nextIndex = current.length;

    return [
      ...current,
      {
         id: `new-tier-${Date.now()}`,
  tierName: `Tier ${nextIndex + 1}`,

       unitCount: "0",
       activeUnitCount: 0,
       availableUnitCount: 0,

       isNew: true,
       markedForDelete: false,
       baseRent: "",
       dueDay: "1",
       graceDays: "5",
       lateFeeEnabled: false,
       lateFeeAmount: "",
       lateFeeDaily: "",
       lateFeeMaxDays: "",
      },
    ];
  });
}

async function saveGpLfSettings(): Promise<void> {
  if (!data?.property?.id) return;

  const targetTierIds =
    gpLfTierMode === "all"
      ? localTiers.filter((t) => !t.markedForDelete).map((t) => t.id)
      : gpLfSelectedTierIds;

  if (targetTierIds.length === 0) {
    setGpLfSaveMessage("Select at least one tier.");
    return;
  }

  try {
    setSavingGpLf(true);
    setGpLfSaveMessage("");

    const tiersToUpdate = localTiers
      .filter((tier) => !tier.markedForDelete && targetTierIds.includes(tier.id))
      .map((tier) => ({
        id: tier.id,
        dueDay: gpLfSettings.dueDay,
        graceDays: gpLfSettings.graceDays,
        lateFeeEnabled: gpLfSettings.lateFeeEnabled,
        lateFeeAmount: gpLfSettings.lateFeeInitial,
        lateFeeDaily: gpLfSettings.lateFeeDaily,
        lateFeeMaxDays: gpLfSettings.lateFeeMaxDays,
      }));

    const res = await fetch(
      `/api/admin/properties/${data.property.id}/gplf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tiers: tiersToUpdate }),
      }
    );

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      setGpLfSaveMessage(json?.error || "Failed to save GP/LF settings.");
      return;
    }

    await loadDashboard();
await loadPropertyTiers();
setGpLfSettings({
  dueDay: gpLfSettings.dueDay,
  graceDays: gpLfSettings.graceDays,
  lateFeeEnabled: gpLfSettings.lateFeeEnabled,
  lateFeeInitial: gpLfSettings.lateFeeInitial,
  lateFeeDaily: gpLfSettings.lateFeeDaily,
  lateFeeMaxDays: gpLfSettings.lateFeeMaxDays,
});
setGpLfSaveMessage("Grace period and late fee settings saved.");
  } catch {
    setGpLfSaveMessage("Failed to save GP/LF settings.");
  } finally {
    setSavingGpLf(false);
  }
}

async function saveBillingCycleStartDate(): Promise<void> {
  if (
    !data?.property?.id ||
    !billingCycleStartDate ||
    billingCycleStartDateLocked
  ) {
    return;
  }

 const confirmed = window.confirm(
  `Are you sure you want to set the billing cycle start date to ${billingCycleStartDate}?\n\nThis date determines when RentFray begins tracking billing cycles for this property.`
);

  if (!confirmed) {
    return;
  }

  try {
    setSavingBillingCycleStartDate(true);

    const res = await fetch(
      `/api/admin/properties/${data.property.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          billingCycleStartDate,
        }),
      }
    );

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      alert(json?.error || "Failed to save billing cycle start date.");
      return;
    }


    alert(
      `Billing cycle start date successfully locked to ${billingCycleStartDate}.`
    );

    await new Promise((r) => setTimeout(r, 150));
    await loadDashboard();
    setBillingCycleStartDateLocked(true);

  } catch {
    alert("Failed to save billing cycle start date.");
  } finally {
    setSavingBillingCycleStartDate(false);
  }
}

async function saveLocalRentSettings(): Promise<void> {
  if (!data?.property?.id) return;

  try {
    const res = await fetch(`/api/admin/properties/${data.property.id}/tiers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        tiers: localTiers,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      alert(json?.error || "Failed to save tiers");
      return;
    }

    setEditingTierId(null);
    await loadDashboard();
    await loadPropertyTiers();
    alert("Saved");
  } catch {
    alert("Save failed");
  }
}

 function closeUnitPanel(): void {
  setShowAdjustModal(false);
  setShowVacateConfirm(false);
  setShowInactiveConfirm(false);
  setVacateError("");
  setSelectedUnit(null);
  setManualPaymentAmount("");
  setShowManualPaymentConfirm(false);
}

function openPanel(panel: Exclude<PanelKey, null>): void {
  setActivePanel(panel);

  if (panel === "gplf") {
    setGpLfTierMode("selected");
    setGpLfSelectedTierIds([]);
    setGpLfSettings({
      dueDay: "",
      graceDays: "",
      lateFeeEnabled: false,
      lateFeeInitial: "",
      lateFeeDaily: "",
      lateFeeMaxDays: "",
    });
    setGpLfSaveMessage("");
  }
}

useEffect(() => {
  if (activePanel !== "gplf") return;

  const nextVisibleTierIds =
    gpLfTierMode === "all"
      ? localTiers.filter((tier) => !tier.markedForDelete).map((tier) => tier.id)
      : gpLfSelectedTierIds;

  const visibleTiers = localTiers.filter((tier) =>
    nextVisibleTierIds.includes(tier.id)
  );

  setGpLfSettings(getGpLfSettingsFromTiers(visibleTiers));
}, [activePanel, gpLfTierMode, gpLfSelectedTierIds, localTiers]);

function closePanel(): void {
  setActivePanel(null);

  setMaintenanceError("");
  setMaintenanceActionError("");
  setMaintenancePin("");
  setMaintenancePinConfirm("");
  setMaintenancePinError("");
  setMaintenancePinSuccess("");

  setShowChangeLogin(false);
  setChangeCurrentLogin("");
  setChangeCurrentPassword("");
  setChangeNewEmail("");
  setChangeNewPassword("");
  setChangeConfirmPassword("");

  setShowInactiveUnits(false);
  setInactiveUnits([]);
  setInactiveUnitsError("");
  setInactiveActionUnitId("");
  setConfirmReactivateUnitId("");
  setConfirmDeleteUnitId("");
}  

const unitMaintenanceRequests = selectedUnit
  ? maintenanceRequests
      .filter(
        (request) =>
          request.unitNumber === selectedUnit.unitNumber &&
          request.status.toUpperCase() !== "COMPLETE"
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
  : [];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-sm">
          Loading dashboard...
        </div>
      </main>
    );
  }

if (error === "Unauthorized") {
  window.location.href = "/login/manager";
  return null;
}

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white px-6 py-5 text-sm text-red-700 shadow-sm">
          {error || "Failed to load dashboard."}
        </div>
      </main>
    );
  }

const selectedMoveTargetTier = (data?.tiers ?? []).find(
  (tier) => tier.id === targetMoveTierId
);

const selectedMoveTargetActiveCount =
  targetMoveTierId
    ? (data?.units ?? []).filter(
        (unit) =>
          unit.isActive &&
          unit.tierId === targetMoveTierId &&
          unit.unitId !== selectedUnit?.unitId
      ).length
    : 0;

const selectedMoveTargetCapacity = Number(
  selectedMoveTargetTier?.unitCount ?? 0
);

const selectedMoveTargetIsFull =
  Boolean(selectedMoveTargetTier) &&
  selectedMoveTargetCapacity > 0 &&
  selectedMoveTargetActiveCount >= selectedMoveTargetCapacity;

const canSubmitMoveTier =
  Boolean(selectedUnit) &&
  Boolean(targetMoveTierId) &&
  !selectedMoveTargetIsFull &&
  selectedUnit?.paymentStatus !== "PENDING" &&
  !movingTier;

  return (
    <>
      <main className="min-h-screen px-3 py-4 sm:px-5 sm:py-6">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.10),transparent_34%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-50 via-emerald-50/35 to-slate-100" />
        <div className="mx-auto max-w-6xl space-y-5">

       {typeof document !== "undefined" &&
document.cookie.includes("rf_admin_session=") ? (
  <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-bold text-amber-900">
          ADMIN IMPERSONATION ACTIVE
        </div>

        <div className="text-sm text-amber-800">
          You are currently viewing this property as a management user.
        </div>
      </div>

      <button
        type="button"
        onClick={async () => {
          try {
            const response = await fetch(
              "/api/admin/impersonate/exit",
              {
                method: "POST",
                credentials: "include",
              }
            );

            const data = await response.json().catch(() => null);

            if (data?.redirectTo) {
              window.location.href = data.redirectTo;
            }
          } catch {
            alert("Failed to exit impersonation.");
          }
        }}
        className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white"
      >
        Exit Impersonation
      </button>
    </div>
  </div>
) : null}

                       <section className="rounded-[28px] border border-emerald-200 bg-white px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:px-5">
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700/70">
          RentFray manager
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {propertyName}
        </h1>
        <div className="text-sm text-slate-600">
          Property Code:{" "}
          <span className="font-mono font-semibold text-slate-900">
            {propertyCode}
          </span>
        </div>
        <div className="text-sm text-[var(--rf-text-soft)]">
          Role:{" "}
          <span className="font-semibold text-slate-900">
            {sessionRole}
          </span>
        </div>
      </div>
    </div>


   <div className="flex flex-wrap gap-2">
  <button
    type="button"
    onClick={() => openPanel("manage")}
    className="rf-btn rf-btn-primary px-5 text-sm"
  >
    Manage
  </button>

  <button
    type="button"
    onClick={logout}
    className="rf-btn rf-btn-secondary px-3 text-xs"
  >
    Logout
  </button>
</div>
</div>
</section>
            
      
              
<section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-5">
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Current cycle
      </div>
      <div className="text-lg font-semibold text-slate-900">
        {data.cycleSnapshot?.billingCycleLabel || "—"}
      </div>
      <div className="text-sm text-slate-600">
        {data.cycleSnapshot?.occupiedUnitsLabel || ""}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--rf-text-muted)]">
          Collected
        </div>
        <div className="mt-1 text-base font-semibold text-[var(--rf-text)]">
          ${data.cycleSnapshot?.totalCollected?.toFixed(2) || "0.00"}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--rf-text-muted)]">
          Expected
        </div>
        <div className="mt-1 text-base font-semibold text-[var(--rf-text)]">
          ${data.cycleSnapshot?.totalExpected?.toFixed(2) || "0.00"}
        </div>
      </div>

     <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--rf-text-muted)]">
          Paid units
        </div>
        <div className="mt-1 text-base font-semibold text-[var(--rf-text)]">
          {data.cycleSnapshot?.totalPaidCount ?? 0}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--rf-text-muted)]">
          Unpaid
        </div>
        <div className="mt-1 text-base font-semibold text-[var(--rf-text)]">
          {data.cycleSnapshot?.unpaidUnitsCount ?? 0}
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--rf-text-muted)]">
        Difference
      </div>
      <div
        className={`mt-1 text-xl font-semibold ${
          (data.cycleSnapshot?.difference ?? 0) >= 0
            ? "text-[var(--rf-success)]"
            : "text-[var(--rf-danger)]"
        }`}
      >
        ${(data.cycleSnapshot?.difference ?? 0).toFixed(2)}
      </div>
    </div>
  </div>
</section>

            <section className="rounded-[28px] border border-slate-200 bg-white px-3 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.07)] sm:px-4">
  {tierGroups.length === 0 ? (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      No units found.
    </div>
  ) : (
    <div className="space-y-4">
      {tierGroups.map((group) => (
        <div key={group.tierName} className="space-y-2">
          <div className="px-1 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            {group.tierName}
          </div>

          <div className="space-y-2">
            {group.units.map((unit) => {
              const vacant = !unit.tenantName;

              return (
                <div
                  key={unit.unitId}
                  className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_5px_16px_rgba(15,23,42,0.06)] transition hover:border-emerald-300 hover:shadow-[0_8px_22px_rgba(15,23,42,0.09)]"
                >
                  <div className="grid w-full grid-cols-[auto_90px_minmax(70px,1fr)_minmax(64px,0.8fr)_minmax(90px,0.8fr)] items-center gap-3 px-3 py-3">
                    <span
                      className={`h-4 w-4 shrink-0 rounded-full ${getStatusDotClass(
                        unit.status
                      )}`}
                    />

                    <button
                      type="button"
                      onClick={() => openUnitPanel(unit)}
                      className="inline-flex items-center gap-1 text-left text-sm font-semibold text-emerald-700 transition hover:text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      title={`Open Unit ${unit.unitNumber}`}
                    >
                      <span className="border-b-2 border-emerald-500 leading-none">
                        Unit {unit.unitNumber}
                      </span>
                    </button>

                    <div className="min-w-0 truncate text-sm font-medium text-slate-600">
                      {unit.displayLastName}
                    </div>

                    <div className="min-w-0 text-right text-sm font-semibold tabular-nums text-slate-950">
                      {vacant ? "-" : toMoney(unit.balance)}
                    </div>

                    <div className="hidden min-w-0 truncate text-right text-xs font-medium text-slate-500 sm:block">
                      {getStatusText(unit.status, unit.daysPastDue)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  )}
</section>
           
     </div>
      </main>

      {selectedUnit ? (
  <OverlayShell
    title={`Unit ${selectedUnit.unitNumber}`}
    subtitle={`${selectedUnit.tenantName || "Tenant"} • ${getStatusText(
      selectedUnit.status,
      selectedUnit.daysPastDue
    )}`}
    onClose={closeUnitPanel}
  >
    <div className="space-y-5 pb-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Tenant
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">
            {selectedUnit.tenantName || "-"}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Balance
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">
            {toMoney(selectedUnit.balance)}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Tier
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">
            {selectedUnit.tierName || "Units"}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Status
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">
            {getStatusText(selectedUnit.status, selectedUnit.daysPastDue)}
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 mt-4 block bg-white">
        <button
          type="button"
          onClick={() => setShowAdjustModal(true)}
          disabled={!canManageMoney}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
        >
          Adjust Balance
        </button>
      </div>


     {selectedUnit.nextCycleAdjustments?.length ? (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm shadow-sm">
    <div className="font-semibold text-amber-900">Next cycle:</div>

    <div className="mt-3 space-y-3">
      {selectedUnit.nextCycleAdjustments.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-amber-200 bg-white/80 p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-950">
              {item.type === "CREDIT" ? "Credit" : "Charge"}
            </div>

            <div
              className={`font-semibold ${
                item.type === "CREDIT" ? "text-emerald-700" : "text-slate-950"
              }`}
            >
              {item.type === "CREDIT" ? "-" : "+"}
              {toMoney(item.amount)}
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-600">
            Memo: {item.memo || "No memo"}
          </div>

          <div className="mt-1 text-xs text-slate-600">
            Added: {new Date(item.createdAt).toLocaleString()}
          </div>

          <div className="mt-1 text-xs text-slate-600">
            Takes effect: {item.billingCycle || "Next billing cycle"}{" "}
            ({new Date(item.effectiveDate).toLocaleDateString()})
          </div>
        </div>
      ))}
    </div>
  </div>
) : null}

{showMoveTierModal && selectedUnit ? (
  <OverlayShell
    title={`Move Unit ${selectedUnit.unitNumber} To Another Tier`}
    subtitle="Choose the correct tier. Pending payments are blocked. Paid current-cycle balances are not adjusted."
    onClose={() => {
      if (movingTier) return;
      setShowMoveTierModal(false);
      setTargetMoveTierId("");
      setMoveTierError("");
    }}
  >
    <div className="space-y-4">
      <div className="rounded-[26px] border border-slate-200 bg-white p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Current tier
            </div>
            <div className="mt-1 font-semibold text-slate-950">
              {selectedUnit.tierName ?? "Units"}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Current status
            </div>
            <div className="mt-1 font-semibold text-slate-950">
              {getStatusText(selectedUnit.status, selectedUnit.daysPastDue)}
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Target tier
        </label>
        <select
          value={targetMoveTierId}
          onChange={(event) => {
            setTargetMoveTierId(event.target.value);
            setMoveTierError("");
          }}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          <option value="">Choose a tier</option>
          {(data?.tiers ?? [])
            .filter((tier) => tier.id !== selectedUnit.tierId)
            .map((tier) => {
              const activeCount = (data?.units ?? []).filter(
                (unit) =>
                  unit.isActive &&
                  unit.tierId === tier.id &&
                  unit.unitId !== selectedUnit.unitId
              ).length;

              return (
                <option key={tier.id} value={tier.id}>
                  {tier.name} — {activeCount}/{tier.unitCount} units
                </option>
              );
            })}
        </select>
      </div>

      {selectedMoveTargetTier ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            selectedMoveTargetIsFull
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          Target tier capacity: {selectedMoveTargetActiveCount}/
          {selectedMoveTargetCapacity}.{" "}
          {selectedMoveTargetIsFull
            ? "This tier is full. Choose another tier or increase the tier capacity first."
            : "This tier has room for this move."}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
        Unpaid current-cycle balances will be adjusted to match the new tier. If this unit has already paid this cycle, the new tier applies next cycle and management can add a manual charge or credit if needed. Past payments are never changed.
      </div>

      {moveTierError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {moveTierError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={movingTier}
          onClick={() => {
            setShowMoveTierModal(false);
            setTargetMoveTierId("");
            setMoveTierError("");
          }}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={!canSubmitMoveTier}
          onClick={submitMoveTier}
          className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {movingTier ? "Moving..." : "Move Unit"}
        </button>
      </div>
    </div>
  </OverlayShell>
) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-slate-700">
            {selectedUnit?.isActive ? (
              <>
                <span className="font-semibold text-emerald-600">
                  Unit {selectedUnit.unitNumber} is active.
                </span>{" "}
                Units must be vacated before setting as inactive.
              </>
            ) : (
              <>
                <span className="font-semibold text-red-600">
                  Unit {selectedUnit.unitNumber} is inactive.
                </span>{" "}
                This unit cannot be occupied and is excluded from the active unit
                count.
              </>
            )}
          </div>

          <button
            type="button"
            disabled={togglingUnitActive}
            onClick={submitToggleUnitActive}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              selectedUnit?.isActive
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            } ${togglingUnitActive ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {togglingUnitActive
              ? "Updating..."
              : selectedUnit?.isActive
                ? "Set Inactive"
                : "Reactivate"}
          </button>
        </div>
      </div>

       <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
   <div className="text-sm font-semibold text-slate-950">Move Unit</div>
  <div className="mt-2 text-sm leading-6 text-slate-600">
    Move this unit to a different rent tier without deleting the unit, changing tenant history, or altering past payments.
  </div>

  {!canVacateUnit ? (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      View only. Only owner and manager can move units.
    </div>
  ) : selectedUnit.paymentStatus === "PENDING" ? (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      This unit has a pending payment. Wait until it succeeds or fails before moving tiers.
    </div>
  ) : (
    <button
      type="button"
      onClick={() => {
        setTargetMoveTierId("");
        setMoveTierError("");
        setShowMoveTierModal(true);
      }}
      className="mt-4 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
    >
      Move Unit
    </button>
  )}
</div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-950">Manual Payment</div>
        <div className="mt-2 text-sm leading-6 text-slate-600">
          Record an offline payment for this unit and immediately reduce the
          balance shown on the dashboard.
        </div>

        {!canManageMoney ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            View only. Only owner and manager can record manual payments.
          </div>
        ) : (
          <>
            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Payment amount
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={manualPaymentAmount}
                onChange={(e) => setManualPaymentAmount(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="0.00"
              />
            </div>

            {!showManualPaymentConfirm ? (
              <button
                type="button"
                onClick={() => setShowManualPaymentConfirm(true)}
                className="mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Confirm
              </button>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-950">
                  Please confirm this manual payment
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  Unit {selectedUnit.unitNumber} will be credited{" "}
                  {toMoney(Number(manualPaymentAmount || 0))}.
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submitManualPayment}
                    disabled={submittingManualPayment}
                    className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {submittingManualPayment ? "Saving..." : "Confirm"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowManualPaymentConfirm(false)}
                    disabled={submittingManualPayment}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-950">Vacate Unit</div>
        <div className="mt-2 text-sm leading-6 text-slate-600">
          This action will remove tenant access, clear login credentials, mark
          the unit available, and preserve ledger history.
        </div>

        {!canVacateUnit ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            View only. Only owner and manager can vacate a unit.
          </div>
        ) : null}

        {vacateError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {vacateError}
          </div>
        ) : null}

       {!selectedUnit.tenantName ? (
  <button
    type="button"
    disabled
    className="mt-4 cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-400"
  >
    Currently Vacant
  </button>
) : !showVacateConfirm ? (
  <button
    type="button"
    onClick={() => setShowVacateConfirm(true)}
    disabled={!canVacateUnit}
    className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
  >
    Vacate Unit
  </button>
) : canVacateUnit ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-950">
              Make Unit {selectedUnit.unitNumber} vacant?
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              • Removes tenant access
              <br />
              • Clears login credentials
              <br />
              • Marks unit as available
              <br />
              • Saves move-out record
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submitVacateUnit}
                disabled={vacatingUnit}
                className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {vacatingUnit ? "Vacating..." : "Confirm"}
              </button>

              <button
                type="button"
                onClick={() => setShowVacateConfirm(false)}
                disabled={vacatingUnit}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

<div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
  <div className="text-sm font-semibold text-slate-950">Maintenance</div>
  <div className="mt-2 text-sm leading-6 text-slate-600">
    Review maintenance requests for this unit.
  </div>

  {maintenanceActionError ? (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {maintenanceActionError}
    </div>
  ) : null}

  {maintenanceLoading ? (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      Loading maintenance requests...
    </div>
  ) : maintenanceError ? (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {maintenanceError}
    </div>
  ) : unitMaintenanceRequests.length === 0 ? (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      No maintenance requests for this unit.
    </div>
  ) : (
    <div className="mt-4 space-y-3">
      {unitMaintenanceRequests.map((request) => {
        const busy = maintenanceActionId === request.id;

        return (
          <div
            key={request.id}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-950">
                  {request.category}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {request.description}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {request.urgency} • {request.status} •{" "}
                  {formatDate(request.createdAt)}
                </div>
              </div>

              {canManageMaintenance ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void runMaintenanceAction(request.id, "IN_PROGRESS")
                    }
                    disabled={busy}
                    className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    In Progress
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void runMaintenanceAction(request.id, "COMPLETE")
                    }
                    disabled={busy}
                    className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Complete
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void runMaintenanceAction(request.id, "DELETE")
                    }
                    disabled={busy}
                    className="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
    </div>
  </OverlayShell>
) : null}

      
{showAdjustModal && selectedUnit ? (
  <OverlayShell
    title="Adjust Balance"
    subtitle={`Unit ${selectedUnit.unitNumber} • ${
      selectedUnit.tenantName || "No tenant"
    }`}
    onClose={() => setShowAdjustModal(false)}
    showFooter={false}
  >
    <AdjustBalanceForm
      unitId={selectedUnit.unitId}
      onClose={() => setShowAdjustModal(false)}
      onSuccess={async () => {
        await new Promise((r) => setTimeout(r, 150));
await loadDashboard();
        closeUnitPanel();
      }}
    />
  </OverlayShell>
) : null}

{activePanel === "manage" ? (
  <OverlayShell
    title="Manage"
    onClose={closePanel}
    showFooter={false}
>
    <div className="space-y-5">
      <div className="rounded-[26px] border border-emerald-300/70 bg-gradient-to-br from-emerald-100 via-sky-100 to-white px-4 py-4 shadow-[var(--rf-shadow-sm)]">
  <p className="text-base font-semibold tracking-tight text-[var(--rf-text)] sm:text-lg">
    Everything you need to manage your property- organized in one place.
  </p>
</div>

      <ManageSection
        title="Property Setup"
        helper="Complete your account setup here. Most users only need to do this once."
        items={[
          ...(isOwner
            ? [
                {
                  label: "Account & Payouts",
                  description:
                    "Connect your bank, enable payments, and set your billing start date.",
                  panel: "bank" as const,
                },
              ]
            : []),
          {
            label: "Management Team",
            description: "Add or manage who has access to this property.",
            panel: "manager" as const,
          },
          {
            label: "Maintenance Settings",
            description: "Set a maintenance PIN and view maintenace requests.",
            panel: "maint" as const,
          },
        ]}
        openPanel={openPanel}
      />

      <ManageSection
        title="Billing Configuration"
        helper="You already set these during setup. Only change them if your pricing or rules need to be updated."
        items={[
          {
            label: "Tiers",
            description: "Change rent amounts for each unit type.",
            panel: "rent" as const,
          },
          {
            label: "Fees & Rules",
            description: "Change grace periods and late fee behavior.",
            panel: "gplf" as const,
          },
          {
            label: "Charges",
            description: "Change the recurring charges like utilities or extra fees.",
            panel: "charges" as const,
          },
        ]}
        openPanel={openPanel}
      />

      <ManageSection
        title="Operations"
        helper="Use these tools to manage and review your property as it runs."
        items={[
          {
            label: "Exports",
            description: "Download reports for payments, balances, and records.",
            panel: "exports" as const,
          },
          {
            label: "Property Info",
            description: "View your property details, codes, and overview.",
            panel: "info" as const,
          },
        ]}
        openPanel={openPanel}
      />

       <div className="pt-2">
  <button
    type="button"
    onClick={() => window.open("/tenant-instructions", "_blank")}
    className="w-full rounded-2xl bg-[#0f172a] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[#1e293b] active:scale-[0.99] shadow-md"
  >
    Tenant Instruction Sheet
  </button>
</div>   
    </div>
  </OverlayShell>
) : null} 


{activePanel === "rent" ? (
  <RentPanel
    onClose={goBackToManage}
    canEditRentSettings={canEditRentSettings}
    localTiers={localTiers}
    editingTierId={editingTierId}
    setEditingTierId={setEditingTierId}
    updateLocalTier={updateLocalTier}
    addLocalTier={addLocalTier}
removeLocalTier={removeLocalTier}
saveLocalRentSettings={saveLocalRentSettings}
  />
) : null}

{activePanel === "charges" ? (
  <OverlayShell
    title="Additional Charges"
    subtitle="Create recurring charges for each tier. New recurring charges take effect starting next billing cycle."
    onClose={goBackToManage}
  >
    <div className="space-y-5">
      {tierCharges.map((tier) => (
        <div
          key={tier.tierId}
          className="rounded-[26px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-4 shadow-[var(--rf-shadow-sm)]"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--rf-text-muted)]">
                Tier
              </div>

              <div className="mt-1 text-base font-semibold text-[var(--rf-text)]">
                {tier.tierName}
              </div>
            </div>

            <button
              type="button"
              onClick={() => addTierCharge(tier.tierId)}
              className="rf-btn rf-btn-secondary px-4 text-sm"
            >
              Add Charge
            </button>
          </div>

          <div className="mt-4 space-y-3">
  {tier.charges.map((charge) => (
    <div
      key={charge.id}
      className="rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.55)] p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                    <div>
                      <label className="rf-label">
                        Charge Label
                      </label>

                      <input
                        value={charge.label}
                        onChange={(e) =>
                          updateTierCharge(tier.tierId, charge.id, {
                            label: e.target.value,
                          })
                        }
                        placeholder="Trash Fee"
                        className="rf-input"
                      />
                    </div>

                    <div>
                      <label className="rf-label">
                        Amount
                      </label>

                      <input
                        value={charge.amount}
                        onChange={(e) =>
                          updateTierCharge(tier.tierId, charge.id, {
                            amount: e.target.value.replace(/[^0-9.]/g, ""),
                          })
                        }
                        placeholder="0.00"
                        className="rf-input"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() =>
                          removeTierCharge(tier.tierId, charge.id)
                        }
                        className="rf-btn border border-red-200 bg-red-50 px-4 text-sm text-red-700 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
        </div>
      ))}

      <button
        type="button"
        onClick={saveTierCharges}
        className="rf-btn rf-btn-primary w-full"
      >
        Save Additional Charges
      </button>
    </div>
  </OverlayShell>
) : null}

{activePanel === "bank" ? (
  <OverlayShell
    title="Account & Payouts"
    subtitle="Connect and manage the payout account for this property."
    onClose={goBackToManage}
  >
    <BankPanel
      bankStatus={bankStatus}
      bankMessage={bankMessage}
      isOwner={isOwner}
      onConnect={() => {
        void connectBank();
      }}
      onOnboard={() => {
        void handleOnboard();
      }}
      billingCycleStartDate={billingCycleStartDate}
      setBillingCycleStartDate={setBillingCycleStartDate}
      billingCycleStartDateLocked={billingCycleStartDateLocked}
      saveBillingCycleStartDate={() => {
        void saveBillingCycleStartDate();
      }}
      savingBillingCycleStartDate={savingBillingCycleStartDate}
    />
  </OverlayShell>
) : null}

      {activePanel === "gplf" ? (
  <GpLfPanel
    onClose={goBackToManage}
    canEditLateFeeSettings={canEditLateFeeSettings}
    gpLfTierMode={gpLfTierMode}
    setGpLfTierMode={setGpLfTierMode}
    localTiers={localTiers}
    gpLfSelectedTierIds={gpLfSelectedTierIds}
    toggleGpLfTierSelection={toggleGpLfTierSelection}
    gpLfVisibleTiers={gpLfVisibleTiers}
    gpLfComparisonSummary={gpLfComparisonSummary}
    formatGpLfMoney={formatGpLfMoney}
    gpLfSettings={gpLfSettings}
    updateGpLf={updateGpLf}
    saveGpLfSettings={saveGpLfSettings}
    savingGpLf={savingGpLf}
    gpLfSaveMessage={gpLfSaveMessage}
  />
) : null}

            {activePanel === "manager" ? (
  <ManagerPanel
    onClose={goBackToManage}
    sessionRole={sessionRole}
    canManageManagers={canManageManagers}
    managers={managers}
    managersLoading={managersLoading}
    managersError={managersError}
    newEmail={newEmail}
    setNewEmail={setNewEmail}
    newPassword={newPassword}
    setNewPassword={setNewPassword}
    newRole={newRole}
    setNewRole={setNewRole}
    creatingUser={creatingUser}
    createManager={createManager}
    updateManager={updateManager}
    showChangeLogin={showChangeLogin}
    setShowChangeLogin={setShowChangeLogin}
    changeCurrentLogin={changeCurrentLogin}
    setChangeCurrentLogin={setChangeCurrentLogin}
    changeCurrentPassword={changeCurrentPassword}
    setChangeCurrentPassword={setChangeCurrentPassword}
    changeNewEmail={changeNewEmail}
    setChangeNewEmail={setChangeNewEmail}
    changeNewPassword={changeNewPassword}
    setChangeNewPassword={setChangeNewPassword}
    changeConfirmPassword={changeConfirmPassword}
    setChangeConfirmPassword={setChangeConfirmPassword}
    submitChangeLogin={submitChangeLogin}
    showInactiveUnits={showInactiveUnits}
    setShowInactiveUnits={setShowInactiveUnits}
    inactiveUnits={inactiveUnits}
    inactiveUnitsLoading={inactiveUnitsLoading}
    inactiveUnitsError={inactiveUnitsError}
    inactiveActionUnitId={inactiveActionUnitId}
    confirmReactivateUnitId={confirmReactivateUnitId}
    setConfirmReactivateUnitId={setConfirmReactivateUnitId}
    confirmDeleteUnitId={confirmDeleteUnitId}
    setConfirmDeleteUnitId={setConfirmDeleteUnitId}
    reactivateInactiveUnit={reactivateInactiveUnit}
    deleteInactiveUnit={deleteInactiveUnit}
  />
) : null}


{activePanel === "info" ? (
  <InfoPanel
    onClose={goBackToManage}
    propertyName={propertyName}
    propertyCode={propertyCode}
  />
) : null}

{activePanel === "exports" ? (
  <OverlayShell
    title="Exports"
    subtitle="Download balances, ledger, or payments"
    onClose={goBackToManage}
  >
    <div className="space-y-4">

      {/* Export Type */}
      <select
        value={exportType}
        onChange={(e) =>
          setExportType(e.target.value as "balances" | "ledger" | "payments")
        }
        className="rf-input w-full"
      >
        <option value="balances">Balances</option>
        <option value="ledger">Ledger</option>
        <option value="payments">Payments</option>
      </select>

      {/* Month */}
      <select
        value={exportMonth}
        onChange={(e) => setExportMonth(e.target.value)}
        className="rf-input w-full"
      >
        {exportMonthOptions.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      {/* Unit filter */}
      <input
        value={exportSelectedUnit}
        onChange={(e) => setExportSelectedUnit(e.target.value)}
        placeholder="Unit (optional)"
        className="rf-input w-full"
      />

      {/* Download */}
      <button
        onClick={runExport}
        disabled={exporting || !exportMonth}
        className="rf-btn rf-btn-primary w-full"
      >
        {exporting ? "Exporting..." : "Download CSV"}
      </button>

    </div>
  </OverlayShell>
) : null}

{activePanel === "maint" && (
  <MaintPanel
    onClose={goBackToManage}
    canManageMaintenance={canManageMaintenance}
    maintenancePin={maintenancePin}
    setMaintenancePin={setMaintenancePin}
    maintenancePinConfirm={maintenancePinConfirm}
    setMaintenancePinConfirm={setMaintenancePinConfirm}
    maintenancePinSet={maintenancePinSet}
    savingMaintenancePin={savingMaintenancePin}
    maintenancePinError={maintenancePinError}
    maintenancePinSuccess={maintenancePinSuccess}
    saveMaintenancePin={saveMaintenancePin}
    maintenanceLoading={maintenanceLoading}
    maintenanceError={maintenanceError}
    maintenanceRequests={maintenanceRequests}
    maintenanceActionId={maintenanceActionId}
    maintenanceActionError={maintenanceActionError}
    runMaintenanceAction={runMaintenanceAction}
  />
)}
</>
);
}