// app/tenant/balance/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TenantInfo = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
} | null;

type BalanceData = {
  ok: true;
  property: {
    id: string;
    name: string;
    code: string;
  };
  unit: {
    id: string;
    unitNumber: string;
    bedrooms?: number | null;
    bathrooms?: number | null;
    squareFeet?: number | null;
    marketRent?: number | null;
  };
  tenant: TenantInfo;
  balance: {
    currentBalance: number;
    totalCharges: number;
    totalPaid: number;
    lastPaymentDate?: string | null;
    lastPaymentAmount: number;
  };
  delinquency: {
    isDelinquent: boolean;
    daysPastDue: number;
    lateFeesOwed: number;
    unpaidRent: number;
  };
};

function money(v: number) {
  return `$${Number(v || 0).toFixed(2)}`;
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US");
}

export default function TenantBalancePage() {
  const router = useRouter();

  const [data, setData] = useState<BalanceData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/tenant/balance", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const result = await res.json().catch(() => null);

        if (!active) return;

        if (res.status === 401 || res.status === 403) {
          router.replace("/property-code");
          return;
        }

        if (!res.ok || !result?.ok) {
          setError(result?.error || "Failed to load balance detail.");
          return;
        }

        setData(result);
      } catch {
        if (!active) return;
        setError("Failed to load balance detail.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="text-sm text-neutral-600">Loading...</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-5xl px-6 py-8 space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
          <button
            onClick={() => router.push("/tenant/dashboard")}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm"
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="text-sm text-neutral-600">No balance data found.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Balance Detail
          </h1>
          <div className="mt-2 text-sm text-neutral-600">
            {data.property.name} · Unit {data.unit.unitNumber}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Total Charges</div>
            <div className="text-lg font-semibold">
              {money(data.balance.totalCharges)}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Total Paid</div>
            <div className="text-lg font-semibold">
              {money(data.balance.totalPaid)}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Current Balance</div>
            <div className="text-lg font-semibold">
              {money(data.balance.currentBalance)}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Last Payment Date</div>
            <div className="text-sm font-medium">
              {fmtDate(data.balance.lastPaymentDate)}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Last Payment Amount</div>
            <div className="text-sm font-medium">
              {money(data.balance.lastPaymentAmount)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4">
          <h2 className="mb-3 font-semibold">Delinquency</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs text-neutral-500">Status</div>
              <div className="text-sm font-medium">
                {data.delinquency.isDelinquent ? "DELINQUENT" : "CURRENT"}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Days Past Due</div>
              <div className="text-sm font-medium">
                {data.delinquency.daysPastDue}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Late Fees Owed</div>
              <div className="text-sm font-medium">
                {money(data.delinquency.lateFeesOwed)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Unpaid Rent</div>
              <div className="text-sm font-medium">
                {money(data.delinquency.unpaidRent)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push("/tenant/payment-history")}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm"
          >
            View Payment History
          </button>

          <button
            type="button"
            onClick={() => router.push("/tenant/dashboard")}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}