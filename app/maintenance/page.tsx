// /app/maintenance/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RequestRow = {
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
  requests?: RequestRow[];
};

type UpdateResponse = {
  ok?: boolean;
  error?: string;
};

type RequestAction = "COMPLETE" | "IN_PROGRESS" | "THIRD_PARTY";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export default function MaintenancePage() {
  const router = useRouter();

  const [data, setData] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [activeRequestId, setActiveRequestId] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/manager/maintenance", {
          credentials: "include",
          cache: "no-store",
        });

        const json = (await res.json().catch(() => null)) as
          | MaintenanceListResponse
          | null;

        if (!active) return;

        if (res.status === 401 || res.status === 403) {
          router.replace("/property-code");
          return;
        }

        if (!res.ok || !json?.ok) {
          setError(json?.error || "Failed to load maintenance.");
          return;
        }

        setData(Array.isArray(json.requests) ? json.requests : []);
      } catch {
        if (!active) return;
        setError("Failed to load maintenance.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const sortedRequests = useMemo(() => {
    return [...data].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );
  }, [data]);

  async function updateRequestStatus(
    requestId: string,
    nextStatus: RequestAction
  ): Promise<void> {
    if (activeRequestId) return;

    try {
      setActiveRequestId(requestId);
      setActionError("");

      const res = await fetch("/api/manager/maintenance/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          requestId,
          status: nextStatus,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | UpdateResponse
        | null;

      if (!res.ok || !json?.ok) {
        setActionError(
          json?.error || "Failed to update maintenance request."
        );
        return;
      }

      setData((current) =>
        current.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: nextStatus,
                updatedAt: new Date().toISOString(),
              }
            : request
        )
      );
    } catch {
      setActionError("Failed to update maintenance request.");
    } finally {
      setActiveRequestId("");
    }
  }

  async function deleteRequest(requestId: string): Promise<void> {
    if (activeRequestId) return;

    try {
      setActiveRequestId(requestId);
      setActionError("");

      const res = await fetch("/api/manager/maintenance/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          requestId,
          action: "DELETE",
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | UpdateResponse
        | null;

      if (!res.ok || !json?.ok) {
        setActionError(json?.error || "Failed to delete request.");
        return;
      }

      setData((current) =>
        current.filter((request) => request.id !== requestId)
      );
    } catch {
      setActionError("Failed to delete request.");
    } finally {
      setActiveRequestId("");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 text-sm text-slate-600 shadow-sm">
            Loading maintenance portal...
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="rounded-[28px] border border-red-200 bg-white px-5 py-5 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              RentFray maintenance portal
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Work Orders
            </h1>
            <p className="text-sm text-slate-600">
              Review open requests from newest to oldest and update, escalate, or
              delete them as needed.
            </p>
          </div>
        </section>

        {actionError ? (
          <div className="rounded-[24px] border border-red-200 bg-white px-4 py-4 text-sm text-red-700 shadow-sm">
            {actionError}
          </div>
        ) : null}

        {sortedRequests.length === 0 ? (
          <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              No maintenance requests.
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            {sortedRequests.map((request) => {
              const isBusy = activeRequestId === request.id;
              const normalizedStatus = request.status.toUpperCase();
              const isComplete = normalizedStatus === "COMPLETE";
              const isInProgress = normalizedStatus === "IN_PROGRESS";
              const isThirdParty = normalizedStatus === "THIRD_PARTY";

              return (
                <div
                  key={request.id}
                  className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-950">
                            Unit {request.unitNumber}
                          </div>

                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusBadgeClass(
                              request.status
                            )}`}
                          >
                            {request.status.replace(/_/g, " ")}
                          </span>

                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${urgencyBadgeClass(
                              request.urgency
                            )}`}
                          >
                            {request.urgency}
                          </span>
                        </div>

                        <div className="mt-2 text-sm font-medium text-slate-800">
                          {request.category}
                        </div>

                        <div className="mt-1 text-sm text-slate-600">
                          {request.tenantName ||
                            "No tenant name available"}
                        </div>
                      </div>

                      <div className="text-xs text-slate-500 sm:text-right">
                        <div>
                          Created {formatDate(request.createdAt)}
                        </div>
                        <div className="mt-1">
                          Updated {formatDate(request.updatedAt)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
                      {request.description}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!isInProgress && !isComplete ? (
                        <button
                          type="button"
                          onClick={() =>
                            void updateRequestStatus(
                              request.id,
                              "IN_PROGRESS"
                            )
                          }
                          disabled={isBusy}
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? "Updating..." : "In Progress"}
                        </button>
                      ) : null}

                      {!isComplete && !isThirdParty ? (
                        <button
                          type="button"
                          onClick={() =>
                            void updateRequestStatus(
                              request.id,
                              "THIRD_PARTY"
                            )
                          }
                          disabled={isBusy}
                          className="rounded-2xl border border-orange-300 bg-white px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy ? "Updating..." : "3rd Party"}
                        </button>
                      ) : null}

                      {!isComplete ? (
                        <button
                          type="button"
                          onClick={() =>
                            void updateRequestStatus(
                              request.id,
                              "COMPLETE"
                            )
                          }
                          disabled={isBusy}
                          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isBusy ? "Updating..." : "Completed"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() =>
                          void deleteRequest(request.id)
                        }
                        disabled={isBusy}
                        className="rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? "Updating..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}