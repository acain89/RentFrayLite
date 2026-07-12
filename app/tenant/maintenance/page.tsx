// /app/tenant/maintenance/page.tsx

"use client";

import { useEffect, useState } from "react";

type MaintenanceRow = {
  id: string;
  category: string;
  urgency: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type MaintenanceData = {
  ok: true;
  propertyName: string;
  unitNumber: string;
  requests: MaintenanceRow[];
};

type ErrorResponse = {
  ok?: false;
  error?: string;
};

function fmtDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US");
}

export default function TenantMaintenancePage() {
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [category, setCategory] = useState<string>("PLUMBING");
  const [urgency, setUrgency] = useState<string>("NORMAL");
  const [description, setDescription] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  async function load(): Promise<void> {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/tenant/maintenance/list", {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as
        | MaintenanceData
        | ErrorResponse
        | null;

      if (!res.ok || !json || !("ok" in json) || !json.ok) {
        setError(
          (json as ErrorResponse)?.error || "Failed to load maintenance."
        );
        return;
      }

      setData(json as MaintenanceData);
    } catch {
      setError("Failed to load maintenance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitRequest(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();

    if (saving) return;

    try {
      setSaving(true);
      setError("");

      const res = await fetch("/api/tenant/maintenance/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          urgency,
          description,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        setError(json?.error || "Failed to submit request.");
        return;
      }

      setDescription("");
      await load();
    } catch {
      setError("Failed to submit request.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {data?.propertyName} — Unit {data?.unitNumber}
        </p>
      </div>

      <form
        onSubmit={submitRequest}
        className="space-y-4 rounded-xl border bg-white p-4"
      >
        <h2 className="text-lg font-semibold">Create Request</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm font-medium">Category</div>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="PLUMBING">PLUMBING</option>
              <option value="ELECTRICAL">ELECTRICAL</option>
              <option value="HVAC">HVAC</option>
              <option value="APPLIANCE">APPLIANCE</option>
              <option value="GENERAL">GENERAL</option>
              <option value="PEST">PEST</option>
              <option value="LOCKS">LOCKS</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-sm font-medium">Urgency</div>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
            >
              <option value="LOW">LOW</option>
              <option value="NORMAL">NORMAL</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <div className="text-sm font-medium">Description</div>
          <textarea
            className="min-h-[120px] w-full rounded-lg border px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue"
            required
          />
        </label>

        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {saving ? "Submitting..." : "Submit Request"}
        </button>
      </form>

      <div className="space-y-4 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Request History</h2>

        {!data?.requests?.length ? (
          <div className="text-sm text-neutral-600">
            No requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {data.requests.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border p-4"
              >
                <div className="flex flex-wrap gap-3 text-sm">
                  <div>
                    <span className="font-medium">Category:</span>{" "}
                    {row.category}
                  </div>
                  <div>
                    <span className="font-medium">Urgency:</span>{" "}
                    {row.urgency}
                  </div>
                  <div>
                    <span className="font-medium">Status:</span>{" "}
                    {row.status}
                  </div>
                </div>

                <div className="mt-3 whitespace-pre-wrap text-sm">
                  {row.description}
                </div>

                <div className="mt-3 text-xs text-neutral-500">
                  Created: {fmtDateTime(row.createdAt)}
                </div>
                <div className="text-xs text-neutral-500">
                  Updated: {fmtDateTime(row.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}