"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PayNowButton from "@/app/components/PayNowButton";

type PaymentViewStatus =
  | "UNPAID"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REVERSED";

type PaymentHistoryRow = {
  id: string;
  amountCents: number;
  processingFeeCents: number;
  totalChargedCents: number;
  amount: number;
  processingFee: number;
  totalCharged: number;
  status: PaymentViewStatus;
  timestamp: string;
  message: string;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
};

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  effectiveDate: string;
  memo?: string | null;
};

type StatementItem = {
  label: string;
  amount: number;
};

type StatementData = {
  rent: number;
  recurringCharges: number;
  lateFees: number;
  processingFee: number;
  credits: number;
  subtotal: number;
  totalDue: number;
  items: StatementItem[];
};

type DashboardData = {
  ok: true;
  tenantName: string;
  propertyName?: string;
  propertyStatus: string;
  paymentEnabled: boolean;
  dueDate?: string;
  graceEndsOn?: string;
  unitNumber?: string;
  unitId: string;
  balance: number;
  totalPaid: number;
  isDelinquent: boolean;
  ledger: LedgerEntry[];
  statement?: StatementData;
  paymentStatus?: PaymentViewStatus;
  paymentMessage?: string;
  latestPaymentTimestamp?: string | null;
  hasPendingPayment?: boolean;
  pendingPaymentAmount?: number;
  processingFee?: number;
  totalDue?: number;
  paymentHistory?: PaymentHistoryRow[];
};

type DashboardError = {
  error?: string;
  ok?: false;
};

function money(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";

  const raw =
    value instanceof Date ? value.toISOString() : String(value).trim();

  const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${Number(month)}/${Number(day)}/${year}`;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
  });
}

function normalizePaymentStatus(value: unknown): PaymentViewStatus | undefined {
  const status = String(value ?? "").trim().toUpperCase();

  if (
    status === "UNPAID" ||
    status === "PENDING" ||
    status === "PAID" ||
    status === "FAILED" ||
    status === "REVERSED"
  ) {
    return status;
  }

  return undefined;
}

function normalizeDashboardData(value: unknown): DashboardData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Partial<DashboardData>;

  if (data.ok !== true) {
    return null;
  }

  if (typeof data.tenantName !== "string") {
    return null;
  }

  if (typeof data.propertyStatus !== "string") {
    return null;
  }

  if (typeof data.paymentEnabled !== "boolean") {
    return null;
  }

  if (typeof data.unitId !== "string") {
    return null;
  }

  if (typeof data.balance !== "number") {
    return null;
  }

  if (typeof data.totalPaid !== "number") {
    return null;
  }

  if (typeof data.isDelinquent !== "boolean") {
    return null;
  }

  const ledger: LedgerEntry[] = Array.isArray(data.ledger)
    ? data.ledger
        .filter((entry): entry is LedgerEntry => {
          if (!entry || typeof entry !== "object") {
            return false;
          }

          const candidate = entry as Partial<LedgerEntry>;

          return (
            typeof candidate.id === "string" &&
            typeof candidate.type === "string" &&
            typeof candidate.amount === "number" &&
            typeof candidate.effectiveDate === "string"
          );
        })
        .map((entry) => ({
          id: entry.id,
          type: entry.type,
          amount: entry.amount,
          effectiveDate: entry.effectiveDate,
          memo: entry.memo ?? null,
        }))
    : [];

  let statement: StatementData | undefined;

  if (data.statement && typeof data.statement === "object") {
    const candidate = data.statement as Partial<StatementData>;

    const items: StatementItem[] = Array.isArray(candidate.items)
      ? candidate.items
          .filter((item): item is StatementItem => {
            if (!item || typeof item !== "object") {
              return false;
            }

            const row = item as Partial<StatementItem>;

            return (
              typeof row.label === "string" &&
              typeof row.amount === "number"
            );
          })
          .map((item) => ({
            label: item.label,
            amount: item.amount,
          }))
      : [];

    if (
      typeof candidate.rent === "number" &&
      typeof candidate.recurringCharges === "number" &&
      typeof candidate.lateFees === "number" &&
      typeof candidate.credits === "number" &&
      typeof candidate.subtotal === "number" &&
      typeof candidate.totalDue === "number" &&
      typeof candidate.processingFee === "number"
    ) {
      statement = {
        rent: candidate.rent,
        recurringCharges: candidate.recurringCharges,
        lateFees: candidate.lateFees,
        processingFee: candidate.processingFee,
        credits: candidate.credits,
        subtotal: candidate.subtotal,
        totalDue: candidate.totalDue,
        items,
      };
    }
  }

const paymentHistory: PaymentHistoryRow[] = Array.isArray(data.paymentHistory)
  ? data.paymentHistory
      .filter((payment): payment is PaymentHistoryRow => {
        if (!payment || typeof payment !== "object") return false;

        const row = payment as Partial<PaymentHistoryRow>;

        return (
          typeof row.id === "string" &&
          typeof row.amount === "number" &&
          typeof row.processingFee === "number" &&
          typeof row.totalCharged === "number" &&
          typeof row.timestamp === "string"
        );
      })
      .map((payment) => ({
        id: payment.id,
        amountCents: Number(payment.amountCents || 0),
        processingFeeCents: Number(payment.processingFeeCents || 0),
        totalChargedCents: Number(payment.totalChargedCents || 0),
        amount: Number(payment.amount || 0),
        processingFee: Number(payment.processingFee || 0),
        totalCharged: Number(payment.totalCharged || 0),
        status: normalizePaymentStatus(payment.status) ?? "UNPAID",
        timestamp: payment.timestamp,
        message: String(payment.message || ""),
        stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
        stripeSessionId: payment.stripeSessionId ?? null,
      }))
  : [];

  return {
    ok: true,
    tenantName: data.tenantName,
    propertyName:
      typeof data.propertyName === "string" ? data.propertyName : undefined,
    propertyStatus: data.propertyStatus,
    paymentEnabled: data.paymentEnabled,
    dueDate: typeof data.dueDate === "string" ? data.dueDate : undefined,
    graceEndsOn:
      typeof data.graceEndsOn === "string" ? data.graceEndsOn : undefined,
    unitNumber:
      typeof data.unitNumber === "string" ? data.unitNumber : undefined,
    unitId: data.unitId,
    balance: data.balance,
    totalPaid: data.totalPaid,
    isDelinquent: data.isDelinquent,
    ledger,
    statement,
    paymentStatus: normalizePaymentStatus(data.paymentStatus),
    paymentMessage:
      typeof data.paymentMessage === "string" ? data.paymentMessage : undefined,
    latestPaymentTimestamp:
      typeof data.latestPaymentTimestamp === "string" ||
      data.latestPaymentTimestamp === null
        ? data.latestPaymentTimestamp
        : undefined,
    hasPendingPayment: Boolean(data.hasPendingPayment),
pendingPaymentAmount:
  typeof data.pendingPaymentAmount === "number"
    ? data.pendingPaymentAmount
    : undefined,
processingFee:
  typeof data.processingFee === "number" ? data.processingFee : undefined,
totalDue:
  typeof data.totalDue === "number" ? data.totalDue : undefined,
paymentHistory,
  };
}

export default function TenantDashboard() {
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  async function logout(): Promise<void> {
    try {
      await fetch("/api/tenant/session", {
        method: "DELETE",
        credentials: "include",
      });
      window.location.href = "/";
    } catch {
      alert("Logout failed");
    }
  }

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/tenant/dashboard", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });

        const result: unknown = await res.json().catch(() => null);

        if (!active) return;

        if (res.status === 401 || res.status === 403) {
          router.replace("/property-code");
          return;
        }

        if (!res.ok) {
          const apiError =
            result && typeof result === "object"
              ? (result as DashboardError).error
              : undefined;

          setError(apiError || "Failed to load dashboard.");
          return;
        }

        const normalized = normalizeDashboardData(result);

        if (!normalized) {
          setError("Failed to load dashboard.");
          return;
        }

        setData(normalized);
      } catch {
        if (!active) return;
        setError("Failed to load dashboard.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Loading...
      </main>
    );
  }

  if (error === "Unauthorized") {
    router.replace("/property-code");
    return null;
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="space-y-3 text-center">
          <div className="text-sm text-red-600">
            {error || "Error loading."}
          </div>
          <button
            type="button"
            onClick={() => router.replace("/property-code")}
            className="rounded-xl border px-4 py-2 text-sm"
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  const ledger = Array.isArray(data.ledger) ? data.ledger : [];
  const statement = data.statement;
  const paymentBlocked = !data.paymentEnabled;
  const isPending = data.paymentStatus === "PENDING";
  const totalDue = statement?.totalDue ?? data.balance;
  const pendingMessage =
    data.paymentMessage || "Payment in progress — no further action required";

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50 to-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <div className="text-xs font-semibold tracking-[0.2em] text-slate-700">
            RENTFRAY
          </div>

          <h1 className="mt-3 text-2xl font-semibold">{data.tenantName}</h1>

          <button
            type="button"
            onClick={logout}
            className="mt-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Logout
          </button>

          <p className="mt-1 text-sm text-slate-600">
            {data.propertyName || "Property"} · Unit {data.unitNumber || "—"}
          </p>
        </div>

        <div className="rounded-[28px] border border-sky-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs text-slate-500">Current Balance</p>

          {isPending ? (
            <>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-600">
                Payment Pending
              </p>
              <p className="mt-2 text-sm font-medium text-amber-700">
                {pendingMessage}
              </p>
              {data.latestPaymentTimestamp ? (
                <p className="mt-2 text-sm text-slate-500">
                  Submitted on {fmtDate(data.latestPaymentTimestamp)}
                </p>
              ) : null}
            </>
          ) : (
            <>
              {totalDue <= 0 ? (
  <>
    <p className="mt-2 text-4xl font-semibold tracking-tight">
      {money(0)}
    </p>

    <p className="mt-3 text-sm font-semibold text-green-700">
      You're all paid up. Check back on your next due date.
    </p>
  </>
) : (
  <>
    <p className="mt-2 text-4xl font-semibold tracking-tight">
      {money(totalDue)}
    </p>

    <p className="mt-2 text-sm font-medium">
      {data.isDelinquent ? (
        <span className="text-red-600">Past Due</span>
      ) : (
        <span className="text-green-600">Current</span>
      )}
    </p>
  </>
)}
</>
)}
</div>

        {statement ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Current Statement
            </h2>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              {statement.items.length > 0 ? (
                statement.items.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span className="break-words">{item.label}</span>
                    </div>

                    <span
                      className={`shrink-0 font-medium ${
                        item.amount < 0 ? "text-emerald-600" : "text-slate-900"
                      }`}
                    >
                      {item.amount < 0
                        ? `- ${money(Math.abs(item.amount))}`
                        : money(item.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">
                  No charges have been posted for this billing period yet.
                </div>
              )}

              <div className="my-2 border-t border-slate-200" />

              {(statement.processingFee ?? 0) > 0 && (
              <div className="flex justify-between">
              <span>Processing Fee</span>
              <span className="font-medium">
              {money(statement.processingFee)}
              </span>
              </div>
                )}

              <div className="border-t border-slate-200 pt-3" />

              {isPending ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-base font-semibold text-amber-800">
                    Payment in progress
                  </div>
                   <div className="mt-2 space-y-1 text-sm text-amber-800">
  <div className="flex justify-between gap-3">
    <span>Payment amount</span>
    <span className="font-semibold">
      {money(data.paymentHistory?.[0]?.amount ?? data.balance)}
    </span>
  </div>

  <div className="flex justify-between gap-3">
    <span>Processing fee</span>
    <span className="font-semibold">
      {money(data.paymentHistory?.[0]?.processingFee ?? 0)}
    </span>
  </div>

  <div className="flex justify-between gap-3 border-t border-amber-200 pt-1">
    <span>Total submitted</span>
    <span className="font-semibold">
      {money(data.paymentHistory?.[0]?.totalCharged ?? data.pendingPaymentAmount ?? totalDue)}
    </span>
  </div>
</div>
                  <div className="mt-1 text-sm text-amber-700">
                    No further action is required while your bank processes this
                    payment.
                  </div>
                  {data.latestPaymentTimestamp ? (
                    <div className="mt-1 text-sm text-amber-700">
                      Submitted on {fmtDate(data.latestPaymentTimestamp)}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-base font-semibold text-slate-950">
                    <span>
                      Total due
                      {data.dueDate ? ` on ${fmtDate(data.dueDate)}` : ""}
                    </span>
                    <span>{money(totalDue)}</span>
                  </div>

                  {data.graceEndsOn ? (
                    <div className="text-sm text-slate-500">
                      Grace period ends {fmtDate(data.graceEndsOn)}.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

         {totalDue > 0 ? (
  <div className="space-y-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <p className="text-sm font-semibold">Make a Payment</p>
      <p className="mt-1 text-sm text-slate-600">
        Amount due: <span className="font-semibold">{money(totalDue)}</span>
      </p>
    </div>

    {isPending ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {pendingMessage}
      </div>
    ) : null}

    {paymentBlocked && !isPending ? (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Payments are currently disabled.
      </div>
    ) : null}

    <PayNowButton
      unitId={data.unitId}
      amount={totalDue}
      disabled={paymentBlocked || isPending}
      disabledReason={
        isPending
          ? pendingMessage
          : paymentBlocked
            ? "Payments are currently disabled for this property."
            : "Payment is not available right now."
      }
    />
  </div>
) : null}        

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => router.push("/tenant/payment-history")}
            className="rounded-xl border px-4 py-3 text-sm"
          >
            Payments
          </button>

          <button
            type="button"
            onClick={() => router.push("/tenant/maintenance")}
            className="rounded-xl border px-4 py-3 text-sm"
          >
            Maintenance
          </button>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Recent Activity</h2>

          <div className="space-y-2">
            {ledger.length === 0 ? (
              <div className="rounded-xl border bg-white px-4 py-3 text-sm text-slate-500">
                No activity yet.
              </div>
            ) : (
              ledger.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border bg-white p-3 text-sm"
                >
                  <div className="flex justify-between gap-3">
                    <span>{entry.type}</span>
                    <span>{money(entry.amount)}</span>
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {fmtDate(entry.effectiveDate)}
                  </div>

                  {entry.memo ? (
                    <div className="mt-1 text-xs text-slate-500">
                      {entry.memo}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}