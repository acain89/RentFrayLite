// app/manager/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DashboardData = {
  ok: true;
  propertyName: string;
  totalUnits: number;
  occupiedUnits: number;
  delinquentUnits: number;
  maintenanceOpen: number;
};

export default function ManagerDashboardPage() {
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/manager/dashboard");

        if (res.status === 401) {
          router.replace("/property-code");
          return;
        }

        const json = await res.json();

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load");
        }

        if (active) {
          setData(json);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "Something went wrong");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-white text-black px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Manager Dashboard
          </h1>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-sm text-neutral-500">Loading...</div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Content */}
        {data && (
          <>
            <div className="rounded-2xl border border-neutral-200 p-5">
              <div className="text-sm text-neutral-500">
                Property
              </div>
              <div className="mt-1 text-lg font-medium">
                {data.propertyName}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border p-4">
                <div className="text-sm text-neutral-500">
                  Total Units
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {data.totalUnits}
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm text-neutral-500">
                  Occupied
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {data.occupiedUnits}
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm text-neutral-500">
                  Delinquent
                </div>
                <div className="mt-1 text-xl font-semibold text-red-600">
                  {data.delinquentUnits}
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm text-neutral-500">
                  Maintenance
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {data.maintenanceOpen}
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push("/manager/maintenance")}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white"
            >
              View Maintenance
            </button>
          </>
        )}
      </div>
    </main>
  );
}