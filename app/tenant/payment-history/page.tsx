"use client";

import { useEffect, useState } from "react";

type PaymentViewStatus =
  | "UNPAID"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REVERSED";

type PaymentRow = {
  id: string;
  amount: number;
  processingFee: number;
  totalCharged: number;
  status: PaymentViewStatus;
  timestamp: string;
  message: string;
};

type PaymentHistoryData = {
  ok: true;
  tenantName: string;
  propertyName?: string;
  unitNumber?: string;
  paymentHistory?: PaymentRow[];
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

function statusClass(status: PaymentViewStatus): string {
  switch (status) {
    case "PAID":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "FAILED":
    case "REVERSED":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export default function TenantPaymentHistoryPage() {
  const [data, setData] = useState<PaymentHistoryData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/tenant/dashboard", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });

        const result = (await res.json().catch(() => null)) as
          | PaymentHistoryData
          | { error?: string }
          | null;

        if (!res.ok || !result || !("ok" in result) || result.ok !== true) {
          setError(
            result && "error" in result && result.error
              ? result.error
              : "Failed to load payment history."
          );
          return;
        }

        setData(result);
      } catch {
        setError("Failed to load payment history.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading...</div>;
  }

  if (error) {
    return (
      <div className="space-y-3 p-6">
        <div className="text-sm text-red-600">{error}</div>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/tenant/dashboard";
          }}
          className="rounded-xl border px-4 py-2 text-sm"
        >
          Back
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-sm text-slate-600">No payment history found.</div>;
  }

  const payments = Array.isArray(data.paymentHistory) ? data.paymentHistory : [];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50 to-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <div className="text-xs font-semibold tracking-[0.2em] text-slate-700">
            RENTFRAY
          </div>

          <h1 className="mt-3 text-2xl font-semibold">Payment History</h1>

          <p className="mt-1 text-sm text-slate-600">
            {data.propertyName || "Property"} · Unit {data.unitNumber || "—"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = "/tenant/dashboard";
          }}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"
        >
          Back to dashboard
        </button>

        <div className="space-y-3">
          {payments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
              No payments found for this tenant.
            </div>
          ) : (
            payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {payment.message || "Payment"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {fmtDate(payment.timestamp)}
                    </div>
                  </div>

                  <div
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                      payment.status
                    )}`}
                  >
                    {payment.status}
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Rent payment</span>
                    <span className="font-medium">{money(payment.amount)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">Processing fee</span>
                    <span className="font-medium">
                      {money(payment.processingFee)}
                    </span>
                  </div>

                  <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                    <span>Total charged</span>
                    <span>{money(payment.totalCharged)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}