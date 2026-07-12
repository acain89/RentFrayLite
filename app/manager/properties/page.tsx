"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type MaintenanceRow = {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  tenantId?: string | null;
  category: string;
  urgency: string;
  status: string;
  description: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
};

type QueueData = {
  ok: true;
  requests: MaintenanceRow[];
};

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString("en-US");
}

export default function PropertyMaintenancePage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});

  async function load() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(
        `/api/manager/maintenance?propertyId=${encodeURIComponent(propertyId)}`,
        {
          method: "GET",
        }
      );

      const result = await res.json();

      if (!res.ok) {
        setError(result?.error || "Failed to load maintenance queue.");
        return;
      }

      setData(result);

      const nextDrafts: Record<string, string> = {};
      for (const row of result.requests || []) {
        nextDrafts[row.id] = row.internalNotes || "";
      }
      setNotesDrafts(nextDrafts);
    } catch {
      setError("Failed to load maintenance queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!propertyId) return;
    load();
  }, [propertyId]);

  async function updateStatus(requestId: string, status: string) {
    try {
      setSavingId(requestId);
      setError("");

      const res = await fetch("/api/manager/maintenance/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          status,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result?.error || "Failed to update request.");
        return;
      }

      await load();
    } catch {
      setError("Failed to update request.");
    } finally {
      setSavingId("");
    }
  }

  async function saveNotes(requestId: string) {
    try {
      setSavingId(requestId);
      setError("");

      const res = await fetch("/api/manager/maintenance/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          internalNotes: notesDrafts[requestId] || "",
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result?.error || "Failed to save notes.");
        return;
      }

      await load();
    } catch {
      setError("Failed to save notes.");
    } finally {
      setSavingId("");
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;

  const propertyName = data?.requests?.[0]?.propertyName || "Property Maintenance";

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold">Property Maintenance Queue</h1>
          <div className="text-sm text-gray-600">{propertyName}</div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/manager/properties/${propertyId}`}
            className="rounded border px-4 py-2 text-sm"
          >
            Back to Property
          </Link>

          <Link
            href="/manager/maintenance"
            className="rounded border px-4 py-2 text-sm"
          >
            Global Queue
          </Link>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {!data?.requests?.length ? (
        <div className="rounded border p-3 text-sm text-gray-500">
          No maintenance requests found for this property.
        </div>
      ) : (
        <div className="space-y-3">
          {data.requests.map((row) => (
            <div key={row.id} className="space-y-4 rounded border p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div>
                  <div className="text-xs text-gray-500">Unit</div>
                  <div className="font-medium">{row.unitNumber}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Category</div>
                  <div>{row.category}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Urgency</div>
                  <div>{row.urgency}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Submitted</div>
                  <div>{fmtDateTime(row.createdAt)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Last Updated</div>
                  <div>{fmtDateTime(row.updatedAt)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Status</div>
                  <select
                    value={row.status}
                    onChange={(e) => updateStatus(row.id, e.target.value)}
                    disabled={savingId === row.id}
                    className="w-full rounded border px-2 py-2"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Description</div>
                <div>{row.description}</div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-500">Internal Notes</div>
                <textarea
                  value={notesDrafts[row.id] || ""}
                  onChange={(e) =>
                    setNotesDrafts((prev) => ({
                      ...prev,
                      [row.id]: e.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full rounded border px-3 py-2"
                  placeholder="Add manager-only notes..."
                />
                <button
                  type="button"
                  onClick={() => saveNotes(row.id)}
                  disabled={savingId === row.id}
                  className="rounded border px-3 py-2 text-sm"
                >
                  {savingId === row.id ? "Saving..." : "Save Notes"}
                </button>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    (window.location.href = `/manager/units/${row.unitId}`)
                  }
                  className="rounded border px-3 py-2 text-sm"
                >
                  Open Unit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}