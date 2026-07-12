"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TenantActivateClientProps = {
  propertyCode: string;
};

type Tier = {
  id: string;
  name: string;
  baseRentCents: number;
  unitCount: number;
  occupiedUnits: number;
  availableUnits: number;
  isFull: boolean;
};

function formatMoney(cents: number): string {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition",
    "focus:border-slate-900 focus:ring-2 focus:ring-sky-200",
    hasError ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white",
  ].join(" ");
}

export default function TenantActivateClient({
  propertyCode,
}: TenantActivateClientProps) {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [confirmUnitNumber, setConfirmUnitNumber] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
const [loading, setLoading] = useState(false);

const [recentMoveIn, setRecentMoveIn] = useState<boolean | null>(null);
const [moveInDate, setMoveInDate] = useState<string>("");
const [tiers, setTiers] = useState<Tier[]>([]);
const [selectedTierId, setSelectedTierId] = useState("");

  useEffect(() => {
  if (!propertyCode) {
    router.replace("/property-code");
    return;
  }

  fetch("/api/property/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ propertyCode }),
  })
    .then((res) => res.json())
    .then((data: { tiers?: Tier[] }) => {
      if (Array.isArray(data.tiers)) {
        setTiers(data.tiers);
      }
    })
    .catch(() => {
      setTiers([]);
    });
}, [propertyCode, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanUnitNumber = unitNumber.trim().toUpperCase();
    const cleanConfirmUnitNumber = confirmUnitNumber.trim().toUpperCase();
    const cleanPin = pin.trim();
    const cleanConfirmPin = confirmPin.trim();

    if (!propertyCode) {
      setError("Missing property code.");
      return;
    }

     if (!selectedTierId) {
  setError("Select your rent tier.");
  return;
}

    if (!cleanFirstName || !cleanLastName) {
      setError("Enter your first and last name.");
      return;
    }

    if (!cleanUnitNumber || !cleanConfirmUnitNumber) {
      setError("Enter and confirm your unit number.");
      return;
    }

    if (cleanUnitNumber !== cleanConfirmUnitNumber) {
      setError("Unit numbers do not match.");
      return;
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      setError("PIN must be 4 digits.");
      return;
    }

    if (cleanPin !== cleanConfirmPin) {
      setError("PINs do not match.");
      return;
    }

    if (recentMoveIn === null) {
  setError("Please answer the move-in question.");
  return;
}

if (recentMoveIn && !moveInDate) {
  setError("Select your move-in date.");
  return;
}

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/tenant/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
  propertyCode,
tierId: selectedTierId,
firstName: cleanFirstName,
  lastName: cleanLastName,
  unitNumber: cleanUnitNumber,
  confirmUnitNumber: cleanConfirmUnitNumber,
  pin: cleanPin,
  confirmPin: cleanConfirmPin,
  recentMoveIn,
  moveInDate: moveInDate || null,
        }),
      });

      const data: { error?: string; ok?: boolean } = await res.json();

      if (!res.ok) {
        setError(data.error || "Activation failed.");
        setLoading(false);
        return;
      }

      window.location.href = "/tenant/dashboard";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (!propertyCode) return null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50 to-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-xs font-semibold tracking-[0.2em] text-slate-700">
          RENTFRAY
        </div>

        <section className="rounded-[28px] border border-sky-200 bg-white/95 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Activate your account
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Property code:{" "}
              <span className="font-mono font-semibold text-slate-900">
                {propertyCode}
              </span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
  <div>
    <p className="mb-2 text-sm font-medium text-slate-800">
      Select your rent tier
    </p>

    <div className="space-y-2">
      {tiers.map((tier) => {
        const disabled = tier.isFull;

        return (
          <button
            type="button"
            key={tier.id}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                setSelectedTierId(tier.id);
                if (error) setError("");
              }
            }}
            className={`w-full rounded-xl border px-4 py-3 text-left transition ${
              disabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70"
                : selectedTierId === tier.id
                  ? "border-slate-900 bg-slate-100"
                  : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex justify-between gap-3">
              <span>{tier.name}</span>
              <span>{formatMoney(tier.baseRentCents)}</span>
            </div>

            <div className="mt-1 text-xs">
              {disabled ? "Full" : `${tier.availableUnits} available`}
            </div>
          </button>
        );
      })}
    </div>
  </div>

  <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-800">
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (error) setError("");
                  }}
                  className={inputClass(false)}
                  placeholder="John"
                  autoComplete="given-name"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-800">
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (error) setError("");
                  }}
                  className={inputClass(false)}
                  placeholder="Doe"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-800">
                Unit ID
              </label>
              <input
                type="text"
                value={unitNumber}
                onChange={(e) => {
                  setUnitNumber(e.target.value.toUpperCase());
                  if (error) setError("");
                }}
                className={inputClass(false)}
                placeholder="101"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-800">
                Confirm Unit ID
              </label>
              <input
                type="text"
                value={confirmUnitNumber}
                onChange={(e) => {
                  setConfirmUnitNumber(e.target.value.toUpperCase());
                  if (error) setError("");
                }}
                className={inputClass(false)}
                placeholder="101"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-800">
                Create PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                  if (error) setError("");
                }}
                className={inputClass(false)}
                placeholder="••••"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-800">
                Confirm PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                  if (error) setError("");
                }}
                className={inputClass(false)}
                placeholder="••••"
                autoComplete="new-password"
              />
            </div>

           <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
  <p className="text-sm font-medium">
    Did you move into this unit within the last 30 days?
  </p>

  <div className="flex gap-3">
    <button
      type="button"
      onClick={() => setRecentMoveIn(true)}
      className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
        recentMoveIn === true ? "border-slate-900 bg-white" : "border-slate-200"
      }`}
    >
      Yes
    </button>

    <button
      type="button"
      onClick={() => {
        setRecentMoveIn(false);
        setMoveInDate("");
      }}
      className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
        recentMoveIn === false ? "border-slate-900 bg-white" : "border-slate-200"
      }`}
    >
      No
    </button>
  </div>

  {recentMoveIn === true && (
    <input
      type="date"
      value={moveInDate}
      onChange={(e) => setMoveInDate(e.target.value)}
      className={inputClass(false)}
    />
  )}
</div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Activating..." : "Activate account"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Tenants will only have to pay a single-digit processing fee.
          </div>
        </section>
      </div>
    </main>
  );
}