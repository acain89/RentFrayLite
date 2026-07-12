"use client";

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
  unitCount: number;
};

type SimpleDashboardProps = {
  data: {
    payments: DashboardPayment[];
    tiers: DashboardTier[];
    totalUnits: number;
    property?: {
      name?: string;
      code?: string;
    };
  };
};

type TierPaymentGroup = {
  id: string;
  name: string;
  payments: DashboardPayment[];
};

function toMoney(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getNextMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatCycleLabel(date: Date): string {
  const start = getMonthStart(date);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return `${start.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  })} – ${end.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  })}`;
}

function normalizeLastName(value?: string): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || "—";
}

export default function SimpleDashboard({
  data,
}: SimpleDashboardProps) {
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const tiers = Array.isArray(data.tiers) ? data.tiers : [];
  const propertyName = data.property?.name?.trim() || "Property";
  const propertyCode = data.property?.code?.trim() || "----";

  const now = new Date();
  const monthStart = getMonthStart(now);
  const nextMonthStart = getNextMonthStart(now);

  const billingCyclePayments = payments
    .filter((payment) => {
      const createdAt = new Date(payment.createdAt);

      return (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt >= monthStart &&
        createdAt < nextMonthStart
      );
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const totalCollected = billingCyclePayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  );

  const totalUnitsForCycle = new Set(
    billingCyclePayments.map((payment) => payment.unitNumber)
  ).size;

  const tierGroups: TierPaymentGroup[] = tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    payments: billingCyclePayments.filter(
      (payment) => payment.tierId === tier.id
    ),
  }));

  const uncategorizedPayments = billingCyclePayments.filter(
    (payment) => !tiers.some((tier) => tier.id === payment.tierId)
  );

  if (uncategorizedPayments.length > 0) {
    tierGroups.push({
      id: "uncategorized",
      name: "Uncategorized",
      payments: uncategorizedPayments,
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {propertyName}
          </h1>

          <div className="text-sm text-slate-600">
            Property Code:{" "}
            <span className="font-mono font-semibold text-slate-900">
              {propertyCode}
            </span>
          </div>

          <div className="pt-1 text-sm text-slate-600">
            Billing Cycle:{" "}
            <span className="font-semibold text-slate-900">
              {formatCycleLabel(now)}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Total Units
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {totalUnitsForCycle}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Units with portal payments this cycle
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Payments Logged
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {billingCyclePayments.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Current billing cycle only
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Total Collected
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {toMoney(totalCollected)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Current billing cycle only
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {tierGroups.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            No tiers found.
          </div>
        ) : (
          tierGroups.map((tier) => (
            <div
              key={tier.id}
              className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold tracking-tight text-slate-950">
                    {tier.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Portal payments for this billing cycle
                  </div>
                </div>

                <div className="text-sm font-semibold text-slate-900">
                  {tier.payments.length}
                </div>
              </div>

              {tier.payments.length === 0 ? (
                <div className="mt-4 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No payments this month.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {tier.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 text-sm text-slate-700">
                          <span className="font-semibold text-slate-950">
                            Unit {payment.unitNumber}
                          </span>{" "}
                          — Payment of{" "}
                          <span className="font-semibold text-slate-950">
                            {toMoney(payment.amount)}
                          </span>{" "}
                          —{" "}
                          <span className="font-semibold text-slate-950">
                            {normalizeLastName(payment.lastName)}
                          </span>
                        </div>

                        <div className="shrink-0 text-sm text-slate-500">
                          {formatDate(payment.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}