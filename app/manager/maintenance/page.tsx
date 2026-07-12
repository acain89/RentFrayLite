// app/manager/maintenance/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RequestRow = {
  id: string;
  unitNumber: string;
  category: string;
  urgency: string;
  status: string;
  description: string;
  createdAt: string;
};

type MaintenanceData = {
  ok: true;
  propertyName: string;
  requests: RequestRow[];
};

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-US");
}

export default function ManagerMaintenancePage() {
  const router = useRouter();

  const [data, setData] = useState<MaintenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/manager/maintenance");

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
            Maintenance
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
            <div className="text-sm text-neutral-500">
              {data.propertyName}
            </div>

            <div className="space-y-3">
              {data.requests.length === 0 && (
                <div className="text-sm text-neutral-500">
                  No maintenance requests.
                </div>
              )}

              {data.requests.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-neutral-200 p-4"
                >
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">
                      Unit {r.unitNumber}
                    </span>
                    <span className="text-neutral-500">
                      {fmtDate(r.createdAt)}
                    </span>
                  </div>

                  <div className="mt-2 text-sm">
                    {r.category} • {r.urgency}
                  </div>

                  <div className="mt-2 text-sm text-neutral-600">
                    {r.description}
                  </div>

                  <div className="mt-3 text-sm font-medium">
                    Status:{" "}
                    <span
                      className={
                        r.status === "OPEN"
                          ? "text-red-600"
                          : "text-green-600"
                      }
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}