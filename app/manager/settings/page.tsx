"use client";

import { useEffect, useState } from "react";

type SettingsData = {
  ok: true;
  propertyName: string;
  billingDay: number;
  gracePeriodDays: number;
  lateFeeMode: string;
};

export default function ManagerSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [billingDay, setBillingDay] = useState(1);
  const [gracePeriodDays, setGracePeriodDays] = useState(5);
  const [lateFeeMode, setLateFeeMode] = useState("FLAT");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/manager/settings", {
        credentials: "include",
      });
      const json = await res.json();
      if (json?.ok) {
        setData(json);
        setBillingDay(json.billingDay);
        setGracePeriodDays(json.gracePeriodDays);
        setLateFeeMode(json.lateFeeMode);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/manager/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingDay,
          gracePeriodDays,
          lateFeeMode,
        }),
      });

      const json = await res.json();
      if (json?.ok) {
        alert("Saved");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!data) {
    return <div className="p-6">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Property Settings</h1>

      <div className="space-y-4">
        <Field
          label="Billing Day"
          value={billingDay}
          onChange={(v) => setBillingDay(Number(v))}
          type="number"
        />

        <Field
          label="Grace Period (Days)"
          value={gracePeriodDays}
          onChange={(v) => setGracePeriodDays(Number(v))}
          type="number"
        />

        <div>
          <div className="text-sm text-gray-500 mb-1">Late Fee Mode</div>
          <select
            className="border rounded px-3 py-2 w-full"
            value={lateFeeMode}
            onChange={(e) => setLateFeeMode(e.target.value)}
          >
            <option value="NONE">None</option>
            <option value="FLAT">Flat Fee</option>
            <option value="DAILY">Daily Fee</option>
          </select>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="bg-black text-white px-4 py-2 rounded"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <input
        className="border rounded px-3 py-2 w-full"
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}