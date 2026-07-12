import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUnitLedgerSummary } from "@/lib/ledger";
import { getUnitDelinquencySummary } from "@/lib/delinquency";
import ManualPaymentForm from "./ManualPaymentForm";
import ManualChargeForm from "./ManualChargeForm";
import PostRentButton from "./PostRentButton";

function centsToDollars(cents: number | null | undefined): number {
  return Number(cents || 0) / 100;
}

function money(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function moneyFromCents(cents: number | null | undefined): string {
  return money(centsToDollars(cents));
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US");
}

function formatDayLabel(days: number): string {
  if (days <= 0) return "Current";
  if (days === 1) return "1 day past due";
  return `${days} days past due`;
}

function sectionCardClasses(emphasis = false): string {
  return [
    "rounded-3xl border shadow-sm",
    emphasis
      ? "border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]"
      : "border-slate-200/80 bg-white",
  ].join(" ");
}

type UnitStatus = "PAID" | "PARTIAL" | "GRACE" | "DELINQUENT" | "VACANT";

function resolveStatus(
  balanceDollars: number,
  isDelinquent: boolean,
  hasTenant: boolean,
  daysPastDue: number
): UnitStatus {
  if (!hasTenant) return "VACANT";
  if (balanceDollars <= 0) return "PAID";
  if (isDelinquent) return "DELINQUENT";
  if (daysPastDue > 0) return "GRACE";
  return "PARTIAL";
}

function statusPillClasses(status: UnitStatus): string {
  switch (status) {
    case "DELINQUENT":
      return "border-red-200 bg-red-50 text-red-700";
    case "GRACE":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "PARTIAL":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "PAID":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "VACANT":
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function balanceToneClasses(status: UnitStatus, balanceDollars: number): string {
  if (status === "DELINQUENT") return "text-red-600";
  if (status === "GRACE") return "text-amber-600";
  if (status === "PAID" || balanceDollars <= 0) return "text-emerald-600";
  if (status === "VACANT") return "text-slate-500";
  return "text-slate-900";
}

function paymentStatusClasses(status: string | null): string {
  switch (status) {
    case "UNPAID":
      return "bg-slate-100 border-slate-200 text-slate-700";
    case "PENDING":
      return "bg-amber-50 border-amber-200 text-amber-700";
    case "PAID":
      return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "FAILED":
      return "bg-red-50 border-red-200 text-red-700";
    case "REVERSED":
      return "bg-purple-50 border-purple-200 text-purple-700";
    default:
      return "bg-slate-100 border-slate-200 text-slate-600";
  }
}

function paymentStatusMessage(status: string | null): string {
  switch (status) {
    case "UNPAID":
      return "Payment record exists but has not been completed yet.";
    case "PENDING":
      return "Payment is pending and awaiting completion or confirmation.";
    case "PAID":
      return "Payment successfully completed and recorded.";
    case "FAILED":
      return "Payment failed and may need to be retried.";
    case "REVERSED":
      return "Payment was reversed after being recorded.";
    default:
      return "No payment lifecycle details are available.";
  }
}

function getCycleStart(now: Date, billingDay: number): Date {
  const safeBillingDay = Math.min(Math.max(Number(billingDay || 1), 1), 28);
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    safeBillingDay,
    0,
    0,
    0,
    0
  );

  if (now.getDate() >= safeBillingDay) {
    return currentMonthStart;
  }

  return new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    safeBillingDay,
    0,
    0,
    0,
    0
  );
}

function getNextBillingDate(cycleStart: Date): Date {
  return new Date(
    cycleStart.getFullYear(),
    cycleStart.getMonth() + 1,
    cycleStart.getDate(),
    0,
    0,
    0,
    0
  );
}

function formatTenantName(firstName?: string | null, lastName?: string | null): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || "Vacant";
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function UnitDetail({ params }: Props) {
  const { id } = await params;

  if (!id) {
    throw new Error("Missing unit id");
  }

  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      tier: true,
      property: {
        include: {
          settings: true,
        },
      },
      tenantAssignments: {
        where: {
          isCurrent: true,
          moveOutDate: null,
        },
        orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
      },
      ledgerEntries: {
        where: {
          voidedAt: null,
        },
        orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
      },
      payments: {
        orderBy: [{ createdAt: "desc" }],
      },
      notes: {
  orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
},

      maintenanceRequests: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          category: true,
          status: true,
          urgency: true,
          description: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  });

  if (!unit) {
   

   return (
      <div className="min-h-[50vh] bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-lg font-semibold text-slate-900">Unit not found</div>
            <div className="mt-2 text-sm text-slate-600">
              The requested unit could not be located.
            </div>
            <Link
              href="/manager/units"
              className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back to units
            </Link>
          </div>
        </div>
      </div>
    );
  }

  type ActiveAssignment = (typeof unit.tenantAssignments)[number];
  type LedgerEntry = (typeof unit.ledgerEntries)[number];
  type PaymentRow = (typeof unit.payments)[number];
  type NoteRow = (typeof unit.notes)[number];

  const activeAssignment: ActiveAssignment | null = unit.tenantAssignments[0] ?? null;
  const tenantDisplayName = activeAssignment
    ? formatTenantName(activeAssignment.firstName, activeAssignment.lastName)
    : "Vacant";

  const summary = await getUnitLedgerSummary(unit.id);
  const delinquency = await getUnitDelinquencySummary(unit.id);

  const latestPayment: PaymentRow | null = unit.payments[0] ?? null;
  const propertySettings = unit.property.settings ?? null;

  const balanceDollars = centsToDollars(summary.balanceCents);
  const totalChargesDollars = centsToDollars(summary.totalChargesCents);
  const totalPaidDollars = centsToDollars(summary.totalPaidCents);
  const amountDueNow = centsToDollars(delinquency.amountDueNowCents);
  const daysPastDue = Number(delinquency.daysPastDue || 0);
  const hasBalance = Number(summary.balanceCents || 0) > 0;

  const status = resolveStatus(
    balanceDollars,
    delinquency.isDelinquent,
    Boolean(activeAssignment),
    daysPastDue
  );

  const currentLedgerEntries: LedgerEntry[] = activeAssignment
    ? unit.ledgerEntries.filter((entry: LedgerEntry) => {
        const entryDate = new Date(entry.effectiveDate).getTime();
        const moveInDate = activeAssignment.moveInDate
          ? new Date(activeAssignment.moveInDate).getTime()
          : Number.NEGATIVE_INFINITY;

        const sameTenantOrUnitLevel =
          !entry.tenantAssignmentId || entry.tenantAssignmentId === activeAssignment.id;

        return entryDate >= moveInDate && sameTenantOrUnitLevel;
      })
    : [];

  let runningBalanceCents = 0;
  const ledgerRows = currentLedgerEntries.map((entry: LedgerEntry) => {
    runningBalanceCents += Number(entry.amountCents || 0);
    return {
      ...entry,
      runningBalanceCents,
    };
  });

  const rentDueDay = Number(unit.tier?.rentDueDay ?? propertySettings?.rentDueDay ?? 1);
  const gracePeriodDays = Number(
    unit.tier?.gracePeriodDays ?? propertySettings?.gracePeriodDays ?? 0
  );
  const baseRentCents = Number(unit.baseRentCents ?? unit.tier?.baseRentCents ?? 0);
  const lateFeeType = unit.tier?.lateFeeType ?? "FLAT";
  const lateFeeInitialCents = Number(unit.tier?.lateFeeInitialCents ?? 0);
  const lateFeeDailyCents = Number(unit.tier?.lateFeeDailyCents ?? 0);
  const maxLateFeeDays = Number(unit.tier?.maxLateFeeDays ?? 0);
  const processingFeeCents = Number(unit.tier?.processingFeeCents ?? 0);

  const today = new Date();
  const cycleStart = getCycleStart(today, rentDueDay);
  const nextBillingDate = getNextBillingDate(cycleStart);

  const hasRentChargeThisCycle = currentLedgerEntries.some((entry: LedgerEntry) => {
    const effectiveDate = new Date(entry.effectiveDate);
    return (
      entry.entryType === "CHARGE" &&
      entry.chargeType === "RENT" &&
      effectiveDate >= cycleStart &&
      effectiveDate < nextBillingDate
    );
  });

  const upcomingCharge = hasRentChargeThisCycle
    ? null
    : {
        amount: centsToDollars(baseRentCents),
        effectiveDate: nextBillingDate,
      };

  const recommendedLateFeeCents = delinquency.isDelinquent
    ? lateFeeInitialCents +
      Math.max(0, Math.min(daysPastDue - 1, maxLateFeeDays)) * lateFeeDailyCents
    : 0;

  const lateFeeEligible =
    Boolean(activeAssignment) && delinquency.isDelinquent && Number(summary.balanceCents || 0) > 0;

  const lastPaymentAmount = latestPayment ? centsToDollars(latestPayment.amountCents) : null;
  const lastPaymentDate =
    latestPayment?.paidAt ??
    latestPayment?.reversedAt ??
    latestPayment?.failedAt ??
    latestPayment?.createdAt ??
    null;

  const attentionMessage =
    status === "DELINQUENT"
      ? `Immediate action recommended. This unit is delinquent and ${formatDayLabel(
          daysPastDue
        ).toLowerCase()}.`
      : status === "GRACE"
      ? `Payment window is active. This unit is in grace and ${formatDayLabel(
          daysPastDue
        ).toLowerCase()}.`
      : status === "PARTIAL"
      ? "A balance remains on this unit. Review payment activity and next recommended action."
      : status === "PAID"
      ? "This unit is currently clear with no outstanding balance."
      : "This unit is vacant. Tenant-facing ledger activity is inactive until a new tenant is assigned.";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/manager/units"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Back to units
              </Link>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${statusPillClasses(
                  status
                )}`}
              >
                {status}
              </span>
              {activeAssignment ? (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  Active tenant
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  No active tenant
                </span>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Unit {unit.unitNumber}
              </h1>
              <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <span>
                  Tenant:{" "}
                  <span className="font-semibold text-slate-900">{tenantDisplayName}</span>
                </span>
                <span>
                  Market rent:{" "}
                  <span className="font-semibold text-slate-900">
                    {moneyFromCents(baseRentCents)}
                  </span>
                </span>
                <span>
                  Move-in:{" "}
                  <span className="font-semibold text-slate-900">
                    {fmtDate(activeAssignment?.moveInDate)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/manager/units/${unit.id}/history`}
              className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              View history
            </Link>

            {activeAssignment && (
              <>
                <Link
                  href={`/manager/units/${unit.id}/tenants`}
                  className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                >
                  Tenant details
                </Link>
                <Link
                  href={`/manager/units/${unit.id}/move-out`}
                  className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                >
                  Move out
                </Link>
              </>
            )}

            <a
              href={`/api/exports/ledger?unitId=${unit.id}`}
              className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              Export ledger
            </a>

            <a
              href={`/api/exports/payments?unitId=${unit.id}`}
              className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              Export payments
            </a>
          </div>
        </div>

        <section className={`${sectionCardClasses(true)} overflow-hidden`}>
          <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="border-b border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Current balance
                </div>
                {status === "DELINQUENT" && (
                  <span className="inline-flex rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-200">
                    Urgent
                  </span>
                )}
                {status === "GRACE" && (
                  <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                    Grace period
                  </span>
                )}
              </div>

              <div
                className={`mt-5 text-4xl font-bold tracking-tight sm:text-5xl ${
                  status === "DELINQUENT"
                    ? "text-red-300"
                    : status === "GRACE"
                    ? "text-amber-200"
                    : status === "PAID"
                    ? "text-emerald-300"
                    : status === "VACANT"
                    ? "text-slate-300"
                    : "text-white"
                }`}
              >
                {money(balanceDollars)}
              </div>

              <div className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                {attentionMessage}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Amount due now
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">{money(amountDueNow)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Days past due
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {daysPastDue > 0 ? daysPastDue : 0}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    Last payment
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {lastPaymentAmount !== null ? money(lastPaymentAmount) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Action center
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Prioritize the next move fast. High-value actions stay visible first.
              </div>

              {activeAssignment ? (
                <div className="mt-6 space-y-4">
                  <div>
                    <div className="mb-3 text-sm font-semibold text-slate-900">
                      Primary actions
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <PostRentButton unitId={unit.id} />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Payment status
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-900">
                        {hasBalance ? "Outstanding balance remains" : "No outstanding balance"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Use manual payment or rent posting tools below to update the ledger.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Late fee status
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-900">
                        {lateFeeEligible ? "Eligible to post late fee" : "Not currently eligible"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Recommended amount:{" "}
                        <span className="font-semibold text-slate-900">
                          {moneyFromCents(recommendedLateFeeCents)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Secondary actions
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link
                        href={`/manager/units/${unit.id}/history`}
                        className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Review history
                      </Link>
                      <Link
                        href={`/manager/units/${unit.id}/tenants`}
                        className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Open tenant record
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm font-semibold text-slate-900">Vacant unit</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    Tenant-facing balance and current-occupancy ledger views are inactive until a
                    new tenant is assigned.
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={sectionCardClasses(true)}>
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="text-lg font-semibold text-slate-950">Payment activity</div>
            <div className="mt-1 text-sm text-slate-600">
              Latest payment lifecycle status and recent activity.
            </div>
          </div>

          <div className="p-6">
            {!latestPayment ? (
              <div className="text-sm text-slate-500">No recent payment activity.</div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm text-slate-500">Latest payment</div>
                    <div className="text-lg font-semibold text-slate-950">
                      {moneyFromCents(latestPayment.amountCents)}
                    </div>
                  </div>

                  <div
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${paymentStatusClasses(
                      latestPayment.status
                    )}`}
                  >
                    {latestPayment.status}
                  </div>
                </div>

                <div className="text-sm text-slate-600">
                  {paymentStatusMessage(latestPayment.status)}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Processing fee
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {moneyFromCents(latestPayment.processingFeeCents)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Method
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {latestPayment.paymentMethod || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Paid at
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {fmtDate(latestPayment.paidAt)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Created
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {fmtDate(latestPayment.createdAt)}
                    </div>
                  </div>
                </div>

                {(latestPayment.failedAt || latestPayment.reversedAt) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Failed at
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-950">
                        {fmtDate(latestPayment.failedAt)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Reversed at
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-950">
                        {fmtDate(latestPayment.reversedAt)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <section className={sectionCardClasses()}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="text-lg font-semibold text-slate-950">Financial snapshot</div>
                <div className="mt-1 text-sm text-slate-600">
                  Core balance, charges, payments, and timeline at a glance.
                </div>
              </div>

              <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Current balance
                  </div>
                  <div
                    className={`mt-2 text-2xl font-bold ${balanceToneClasses(
                      status,
                      balanceDollars
                    )}`}
                  >
                    {money(balanceDollars)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Total charges
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-950">
                    {money(totalChargesDollars)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Total paid
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-950">
                    {money(totalPaidDollars)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Last payment date
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {fmtDate(lastPaymentDate)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Last payment amount
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {lastPaymentAmount !== null ? money(lastPaymentAmount) : "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Occupancy status
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {activeAssignment ? "Occupied" : "Vacant"}
                  </div>
                </div>
              </div>
            </section>

            {activeAssignment && (
              <section className={sectionCardClasses()}>
                <div className="border-b border-slate-200 px-6 py-5">
                  <div className="text-lg font-semibold text-slate-950">Ledger actions</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Post charges and record payments without leaving the unit.
                  </div>
                </div>

                <div className="grid gap-6 p-6 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 text-sm font-semibold text-slate-900">Add charge</div>
                    <ManualChargeForm
                      propertyId={unit.propertyId}
                      unitId={unit.id}
                      tenantId={activeAssignment.id}
                      defaultRent={centsToDollars(baseRentCents)}
                    />
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 text-sm font-semibold text-slate-900">
                      Record payment
                    </div>
                    <ManualPaymentForm
                      propertyId={unit.propertyId}
                      unitId={unit.id}
                      tenantId={activeAssignment.id}
                    />
                  </div>
                </div>
              </section>
            )}

            <section className={sectionCardClasses()}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">Ledger</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Current-occupancy ledger entries with running balance.
                    </div>
                  </div>
                  <a
                    href={`/api/exports/ledger?unitId=${unit.id}`}
                    className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Export ledger
                  </a>
                </div>
              </div>

              <div className="p-6">
                {ledgerRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    No current tenant ledger entries.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ledgerRows
                      .slice()
                      .reverse()
                      .map((entry) => {
                        const entryAmountDollars = centsToDollars(entry.amountCents);
                        const isCredit = entryAmountDollars < 0;

                        return (
                          <div
                            key={entry.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-950">
                                    {entry.entryType}
                                  </span>
                                  {entry.chargeType && (
                                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                      {entry.chargeType}
                                    </span>
                                  )}
                                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                    {fmtDate(entry.effectiveDate)}
                                  </span>
                                </div>
                                <div className="mt-2 text-sm text-slate-600">
                                  {entry.memo || "—"}
                                </div>
                                {(entry.paymentMethod || entry.referenceNumber) && (
                                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                                    {entry.paymentMethod && <span>Method: {entry.paymentMethod}</span>}
                                    {entry.referenceNumber && (
                                      <span>Ref: {entry.referenceNumber}</span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="sm:text-right">
                                <div
                                  className={`text-lg font-bold ${
                                    isCredit ? "text-emerald-600" : "text-slate-950"
                                  }`}
                                >
                                  {money(entryAmountDollars)}
                                </div>
                                <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                                  Running balance: {moneyFromCents(entry.runningBalanceCents)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className={sectionCardClasses()}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="text-lg font-semibold text-slate-950">Delinquency</div>
                <div className="mt-1 text-sm text-slate-600">
                  Due dates, grace timing, and urgency signals.
                </div>
              </div>

              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Due date
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {fmtDate(delinquency.dueDate)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Grace ends
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {fmtDate(delinquency.graceEndsOn)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Amount due now
                  </div>
                  <div className="mt-2 text-lg font-semibold text-red-600">
                    {money(amountDueNow)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Status
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {delinquency.isDelinquent ? "Delinquent" : "Current"}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{formatDayLabel(daysPastDue)}</div>
                </div>
              </div>
            </section>

            <section className={sectionCardClasses()}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="text-lg font-semibold text-slate-950">Rent cycle</div>
                <div className="mt-1 text-sm text-slate-600">
                  Current billing position and upcoming charge timing.
                </div>
              </div>

              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Billing day
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">{rentDueDay}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Cycle start
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {fmtDate(cycleStart)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Next rent date
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {fmtDate(nextBillingDate)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Rent status
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {hasRentChargeThisCycle ? "Already posted" : "Ready to post"}
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Upcoming rent charge
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {upcomingCharge
                      ? `${money(upcomingCharge.amount)} scheduled for ${fmtDate(
                          upcomingCharge.effectiveDate
                        )}`
                      : "Already charged this cycle"}
                  </div>
                </div>
              </div>
            </section>

            <section className={sectionCardClasses()}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="text-lg font-semibold text-slate-950">Late fee guidance</div>
                <div className="mt-1 text-sm text-slate-600">
                  Current rule set and posting recommendation.
                </div>
              </div>

              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Late fee type
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">{lateFeeType}</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Grace period days
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {gracePeriodDays}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Initial late fee
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {moneyFromCents(lateFeeInitialCents)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Daily late fee
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {moneyFromCents(lateFeeDailyCents)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Max late-fee days
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {maxLateFeeDays}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Tier processing fee
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {moneyFromCents(processingFeeCents)}
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Posting recommendation
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    {lateFeeEligible
                      ? `Eligible to post ${moneyFromCents(
                          recommendedLateFeeCents
                        )} based on current delinquency timing.`
                      : "No late fee is currently recommended for this unit."}
                  </div>
                </div>
              </div>
            </section>

            <section className={sectionCardClasses()}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="text-lg font-semibold text-slate-950">Notes</div>
                <div className="mt-1 text-sm text-slate-600">
                  Unit-specific notes and pinned context.
                </div>
              </div>

              <div className="p-6">
                {unit.notes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    No notes have been added for this unit.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unit.notes.map((note: NoteRow) => (
                      <div
                        key={note.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {note.isPinned && (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                              Pinned
                            </span>
                          )}
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                            {note.noteType}
                          </span>
                          <span className="text-xs text-slate-500">
                            {fmtDate(note.createdAt)}
                          </span>
                        </div>
                        <div className="mt-3 text-sm leading-6 text-slate-700">
                          {note.content}
                        </div>
                        {note.createdBy && (
                          <div className="mt-2 text-xs text-slate-500">
                            Created by: {note.createdBy}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className={sectionCardClasses()}>
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="text-lg font-semibold text-slate-950">
                  Maintenance request history for this unit
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  All maintenance activity, newest first.
                </div>
              </div>

              <div className="p-6">
                {!unit.maintenanceRequests || unit.maintenanceRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    No maintenance requests have been submitted for this unit.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unit.maintenanceRequests.map(
  (req: (typeof unit.maintenanceRequests)[number]) => {
    return (
      <div
        key={req.id}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            {req.category}
          </span>

          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
              req.urgency === "HIGH"
                ? "bg-red-50 text-red-700 border border-red-200"
                : req.urgency === "LOW"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            {req.urgency}
          </span>

          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            {req.status}
          </span>

          <span className="text-xs text-slate-500">
            {fmtDate(req.createdAt)}
          </span>
        </div>

        <div className="mt-3 text-sm leading-6 text-slate-700">
          {req.description}
        </div>

        {req.completedAt && (
          <div className="mt-2 text-xs text-emerald-600">
            Completed: {fmtDate(req.completedAt)}
          </div>
        )}
      </div>
    );
  }
)}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}