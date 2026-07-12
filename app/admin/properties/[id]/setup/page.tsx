// app/admin/properties/[id]/setup/page.tsx
// [path: app/admin/properties/[id]/setup/page.tsx]

"use client";

import { useEffect, useState } from "react";

type Unit = {
  id: string;
  unitNumber: string;
  portalActivated?: boolean | null;
};

type PaymentStatus = {
  stripeConnected: boolean;
  achEnabled: boolean;
  onboardingComplete: boolean;
  adminApproved: boolean;
  notes: string | null;
} | null;

type Readiness = {
  hasUnits: boolean;
  hasSettings: boolean;
  stripeConnected: boolean;
  achEnabled: boolean;
  onboardingComplete: boolean;
  adminApproved: boolean;
  paymentReady: boolean;
  readyForLive: boolean;
};

type Property = {
  id: string;
  name: string;
  code: string;
  status: string;
  settings: {
    baseRentDefault: number;
    convenienceFee: number;
  };
  units: Unit[];
  paymentConnectionStatus?: PaymentStatus;
};

const STATUS_OPTIONS = ["SETUP", "TEST", "READY", "LIVE", "SUSPENDED"] as const;

export default function PropertySetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [property, setProperty] = useState<Property | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  const [savingSetup, setSavingSetup] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [runningOverride, setRunningOverride] = useState(false);

  const [setupError, setSetupError] = useState("");
  const [setupSuccess, setSetupSuccess] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleSuccess, setLifecycleSuccess] = useState("");
  const [overrideError, setOverrideError] = useState("");
  const [overrideSuccess, setOverrideSuccess] = useState("");

  const [baseRent, setBaseRent] = useState("");
  const [convenienceFee, setConvenienceFee] = useState("");

  const [unitStart, setUnitStart] = useState("");
  const [unitEnd, setUnitEnd] = useState("");

  const [fees, setFees] = useState<{ name: string; amount: string }[]>([]);

  const [stripeConnected, setStripeConnected] = useState(false);
  const [achEnabled, setAchEnabled] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [adminApproved, setAdminApproved] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState("");

  const [selectedStatus, setSelectedStatus] = useState("SETUP");
  const [statusReason, setStatusReason] = useState("");

  const [overrideReason, setOverrideReason] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");

  useEffect(() => {
    async function resolveParams() {
      const { id } = await params;
      setPropertyId(id);
    }

    resolveParams();
  }, [params]);

  useEffect(() => {
    if (!propertyId) return;
    load();
  }, [propertyId]);

  async function load() {
    try {
      setLoading(true);
      setSetupError("");
      setPaymentError("");
      setLifecycleError("");
      setOverrideError("");

      const [setupRes, paymentRes, lifecycleRes] = await Promise.all([
        fetch(`/api/admin/properties/${propertyId}/setup`, { cache: "no-store" }),
        fetch(`/api/admin/properties/${propertyId}/payment-status`, { cache: "no-store" }),
        fetch(`/api/admin/properties/${propertyId}/lifecycle`, { cache: "no-store" }),
      ]);

      const setupData = await setupRes.json();
      const paymentData = await paymentRes.json();
      const lifecycleData = await lifecycleRes.json();

      if (!setupRes.ok) {
        setSetupError(setupData?.error || "Failed to load property setup.");
        return;
      }

      const loadedProperty: Property = {
        ...setupData.property,
        status: lifecycleData?.property?.status || setupData.property.status,
        paymentConnectionStatus: paymentData?.paymentStatus || null,
      };

      setProperty(loadedProperty);
      setReadiness(lifecycleData?.readiness || null);

      setBaseRent(String(loadedProperty.settings?.baseRentDefault ?? ""));
      setConvenienceFee(String(loadedProperty.settings?.convenienceFee ?? ""));

      const ps = paymentData?.paymentStatus;
      setStripeConnected(Boolean(ps?.stripeConnected));
      setAchEnabled(Boolean(ps?.achEnabled));
      setOnboardingComplete(Boolean(ps?.onboardingComplete));
      setAdminApproved(Boolean(ps?.adminApproved));
      setPaymentNotes(ps?.notes || "");

      setSelectedStatus(lifecycleData?.property?.status || loadedProperty.status || "SETUP");

      if (loadedProperty.units.length > 0 && !selectedUnitId) {
        setSelectedUnitId(loadedProperty.units[0].id);
      }
    } catch {
      setSetupError("Failed to load property setup.");
    } finally {
      setLoading(false);
    }
  }

  function addFee() {
    setFees((prev) => [...prev, { name: "", amount: "" }]);
  }

  function updateFee(index: number, key: "name" | "amount", value: string) {
    setFees((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value };
      return copy;
    });
  }

  async function saveSetup() {
    if (savingSetup || !propertyId) return;

    try {
      setSavingSetup(true);
      setSetupError("");
      setSetupSuccess("");

      const res = await fetch(`/api/admin/properties/${propertyId}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRent,
          convenienceFee,
          unitStart,
          unitEnd,
          recurringFees: fees,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSetupError(data?.error || "Failed to save setup.");
        return;
      }

      setSetupSuccess("Setup saved.");
      setUnitStart("");
      setUnitEnd("");
      setFees([]);
      await load();
    } catch {
      setSetupError("Failed to save setup.");
    } finally {
      setSavingSetup(false);
    }
  }

  async function savePaymentStatus() {
    if (savingPayment || !propertyId) return;

    try {
      setSavingPayment(true);
      setPaymentError("");
      setPaymentSuccess("");

      const res = await fetch(`/api/admin/properties/${propertyId}/payment-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeConnected,
          achEnabled,
          onboardingComplete,
          adminApproved,
          notes: paymentNotes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPaymentError(data?.error || "Failed to save payment status.");
        return;
      }

      setPaymentSuccess(
        data?.readyForLive
          ? "Payment status saved. Property is payment-ready."
          : "Payment status saved."
      );

      await load();
    } catch {
      setPaymentError("Failed to save payment status.");
    } finally {
      setSavingPayment(false);
    }
  }

  async function saveLifecycle() {
    if (savingLifecycle || !propertyId || !property) return;

    try {
      setSavingLifecycle(true);
      setLifecycleError("");
      setLifecycleSuccess("");

      const res = await fetch(`/api/admin/properties/${propertyId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: selectedStatus,
          reason: statusReason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLifecycleError(data?.error || "Failed to update property status.");
        return;
      }

      setLifecycleSuccess(
        `Property status updated: ${data.previousStatus} → ${data.property.status}`
      );
      setStatusReason("");
      await load();
    } catch {
      setLifecycleError("Failed to update property status.");
    } finally {
      setSavingLifecycle(false);
    }
  }

  async function runOverride(action: string) {
    if (runningOverride || !propertyId) return;

    try {
      setRunningOverride(true);
      setOverrideError("");
      setOverrideSuccess("");

      const payload: Record<string, string> = {
        action,
        reason: overrideReason,
      };

      if (action === "UNLOCK_UNIT") {
        payload.unitId = selectedUnitId;
      }

      const res = await fetch(`/api/admin/properties/${propertyId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setOverrideError(data?.error || "Override action failed.");
        return;
      }

      if (action === "FORCE_LIVE") {
        setOverrideSuccess("Force LIVE applied.");
      } else if (action === "RESET_PROPERTY") {
        setOverrideSuccess("Property reset complete.");
      } else if (action === "UNLOCK_UNIT") {
        setOverrideSuccess("Unit unlocked.");
      } else if (action === "REPAIR_PAYMENT_STATUS") {
        setOverrideSuccess("Payment status record repaired.");
      } else {
        setOverrideSuccess("Override action complete.");
      }

      setOverrideReason("");
      await load();
    } catch {
      setOverrideError("Override action failed.");
    } finally {
      setRunningOverride(false);
    }
  }

  if (loading || !property) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {property.name} ({property.code})
        </h1>
        <p className="text-sm text-neutral-600">Setup Panel</p>
      </div>

      <div className="border p-4 rounded-xl space-y-3">
        <h2 className="font-semibold">Live Readiness</h2>

        <div className="text-sm">Has units: {readiness?.hasUnits ? "YES" : "NO"}</div>
        <div className="text-sm">Has settings: {readiness?.hasSettings ? "YES" : "NO"}</div>
        <div className="text-sm">Stripe connected: {readiness?.stripeConnected ? "YES" : "NO"}</div>
        <div className="text-sm">ACH enabled: {readiness?.achEnabled ? "YES" : "NO"}</div>
        <div className="text-sm">Onboarding complete: {readiness?.onboardingComplete ? "YES" : "NO"}</div>
        <div className="text-sm">Admin approved: {readiness?.adminApproved ? "YES" : "NO"}</div>
        <div className="text-sm font-medium">
          Ready for LIVE: {readiness?.readyForLive ? "YES" : "NO"}
        </div>
      </div>

      <div className="border p-4 rounded-xl space-y-3">
        <h2 className="font-semibold">Lifecycle</h2>

        <div className="text-sm">
          <span className="font-medium">Current Status: </span>
          <span>{property.status}</span>
        </div>

        <select
          className="border p-2 w-full rounded-lg"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <textarea
          className="border p-2 w-full rounded-lg min-h-[100px]"
          placeholder="Reason for status change"
          value={statusReason}
          onChange={(e) => setStatusReason(e.target.value)}
        />

        {lifecycleError ? <div className="text-sm text-red-600">{lifecycleError}</div> : null}
        {lifecycleSuccess ? <div className="text-sm text-green-600">{lifecycleSuccess}</div> : null}

        <button
          onClick={saveLifecycle}
          className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-60"
          disabled={savingLifecycle}
        >
          {savingLifecycle ? "Saving..." : "Save Lifecycle Status"}
        </button>
      </div>

      <div className="border p-4 rounded-xl space-y-3">
        <h2 className="font-semibold">Defaults</h2>

        <input
          className="border p-2 w-full rounded-lg"
          placeholder="Base Rent"
          value={baseRent}
          onChange={(e) => setBaseRent(e.target.value)}
        />

        <input
          className="border p-2 w-full rounded-lg"
          placeholder="Convenience Fee"
          value={convenienceFee}
          onChange={(e) => setConvenienceFee(e.target.value)}
        />
      </div>

      <div className="border p-4 rounded-xl space-y-3">
        <h2 className="font-semibold">Create Units</h2>

        <div className="flex gap-2">
          <input
            className="border p-2 w-full rounded-lg"
            placeholder="Start (e.g. 1)"
            value={unitStart}
            onChange={(e) => setUnitStart(e.target.value)}
          />

          <input
            className="border p-2 w-full rounded-lg"
            placeholder="End (e.g. 50)"
            value={unitEnd}
            onChange={(e) => setUnitEnd(e.target.value)}
          />
        </div>

        <div className="text-sm text-neutral-600">
          Existing Units: {property.units.length}
        </div>
      </div>

      <div className="border p-4 rounded-xl space-y-3">
        <h2 className="font-semibold">Recurring Fees</h2>

        {fees.map((fee, index) => (
          <div key={index} className="flex gap-2">
            <input
              className="border p-2 w-full rounded-lg"
              placeholder="Fee Name"
              value={fee.name}
              onChange={(e) => updateFee(index, "name", e.target.value)}
            />

            <input
              className="border p-2 w-full rounded-lg"
              placeholder="Amount"
              value={fee.amount}
              onChange={(e) => updateFee(index, "amount", e.target.value)}
            />
          </div>
        ))}

        <button onClick={addFee} className="text-sm underline">
          + Add Fee
        </button>
      </div>

      <div className="border p-4 rounded-xl space-y-4">
        <div>
          <h2 className="font-semibold">Payment Status</h2>
          <p className="text-sm text-neutral-600">
            Track ACH/payment readiness and live gating.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stripeConnected}
            onChange={(e) => setStripeConnected(e.target.checked)}
          />
          Stripe connected
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={achEnabled}
            onChange={(e) => setAchEnabled(e.target.checked)}
          />
          ACH enabled
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onboardingComplete}
            onChange={(e) => setOnboardingComplete(e.target.checked)}
          />
          Onboarding complete
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={adminApproved}
            onChange={(e) => setAdminApproved(e.target.checked)}
          />
          Admin approved
        </label>

        <textarea
          className="border p-2 w-full rounded-lg min-h-[110px]"
          placeholder="Notes"
          value={paymentNotes}
          onChange={(e) => setPaymentNotes(e.target.value)}
        />

        {paymentError ? <div className="text-sm text-red-600">{paymentError}</div> : null}
        {paymentSuccess ? <div className="text-sm text-green-600">{paymentSuccess}</div> : null}

        <button
          onClick={savePaymentStatus}
          className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-60"
          disabled={savingPayment}
        >
          {savingPayment ? "Saving..." : "Save Payment Status"}
        </button>
      </div>

      <div className="border p-4 rounded-xl space-y-4">
        <div>
          <h2 className="font-semibold">Admin Override Tools</h2>
          <p className="text-sm text-neutral-600">Emergency-only admin controls.</p>
        </div>

        <textarea
          className="border p-2 w-full rounded-lg min-h-[100px]"
          placeholder="Override reason"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
        />

        <div className="space-y-2">
          <div className="text-sm font-medium">Unlock Unit</div>
          <select
            className="border p-2 w-full rounded-lg"
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
          >
            {property.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                Unit {unit.unitNumber}
              </option>
            ))}
          </select>

          <button
            onClick={() => runOverride("UNLOCK_UNIT")}
            className="border px-4 py-2 rounded-lg"
            disabled={runningOverride || !selectedUnitId}
          >
            Unlock Selected Unit
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runOverride("FORCE_LIVE")}
            className="border px-4 py-2 rounded-lg"
            disabled={runningOverride}
          >
            Force LIVE
          </button>

          <button
            onClick={() => runOverride("REPAIR_PAYMENT_STATUS")}
            className="border px-4 py-2 rounded-lg"
            disabled={runningOverride}
          >
            Repair Payment Status
          </button>

          <button
            onClick={() => runOverride("RESET_PROPERTY")}
            className="border px-4 py-2 rounded-lg text-red-600"
            disabled={runningOverride}
          >
            Reset Property
          </button>
        </div>

        {overrideError ? <div className="text-sm text-red-600">{overrideError}</div> : null}
        {overrideSuccess ? <div className="text-sm text-green-600">{overrideSuccess}</div> : null}
      </div>

      {setupError ? <div className="text-sm text-red-600">{setupError}</div> : null}
      {setupSuccess ? <div className="text-sm text-green-600">{setupSuccess}</div> : null}

      <button
        onClick={saveSetup}
        className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-60"
        disabled={savingSetup}
      >
        {savingSetup ? "Saving..." : "Save Setup"}
      </button>
    </div>
  );
}