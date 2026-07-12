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
};

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition",
    "focus:border-slate-900 focus:ring-2 focus:ring-sky-200",
    hasError ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white",
  ].join(" ");
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TenantActivateClient({
  propertyCode,
}: TenantActivateClientProps) {
  const router = useRouter();

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string>("");

  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [unitNumber, setUnitNumber] = useState<string>("");
  const [confirmUnitNumber, setConfirmUnitNumber] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");

  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [alreadyActivated, setAlreadyActivated] = useState<boolean>(false);
  const [recentMoveIn, setRecentMoveIn] = useState<boolean | null>(null);
  const [moveInDate, setMoveInDate] = useState<string>("");

  useEffect(() => {
    if (!propertyCode) {
      router.replace("/property-code");
      return;
    }

    localStorage.setItem("rf_property_code", propertyCode);

    // 🔒 FETCH TIERS
    fetch("/api/property/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyCode }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.tiers && Array.isArray(data.tiers)) {
          setTiers(data.tiers);
        }
      })
      .catch(() => {});
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
    setAlreadyActivated(false);

    try {
      const res = await fetch("/api/tenant/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          propertyCode,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          unitNumber: cleanUnitNumber,
          confirmUnitNumber: cleanConfirmUnitNumber,
          tierId: selectedTierId,
          pin: cleanPin,
          confirmPin: cleanConfirmPin,
recentMoveIn,
moveInDate: moveInDate || null,
        }),
      });

      const data: { error?: string } = await res.json();

      if (!res.ok) {
        const message = data.error || "Activation failed.";

        if (message.toLowerCase().includes("already been activated")) {
          setAlreadyActivated(true);
        }

        setError(message);
        setLoading(false);
        return;
      }

      router.replace("/tenant/dashboard");
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
              Property code{" "}
              <span className="font-mono font-semibold text-slate-900">
                {propertyCode}
              </span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 🔒 TIER SELECTOR */}
            <div>
              <p className="mb-2 text-sm font-medium">Select your rent tier</p>

              <div className="space-y-2">
                {tiers.map((tier) => (
                  <button
                    type="button"
                    key={tier.id}
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      selectedTierId === tier.id
                        ? "border-slate-900 bg-slate-100"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>{tier.name}</span>
                      <span>{formatMoney(tier.baseRentCents)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* name */}
            <div className="grid grid-cols-2 gap-3">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass(false)}
                placeholder="First name"
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass(false)}
                placeholder="Last name"
              />
            </div>

            <input
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value.toUpperCase())}
              className={inputClass(false)}
              placeholder="Unit ID"
            />

            <input
              value={confirmUnitNumber}
              onChange={(e) =>
                setConfirmUnitNumber(e.target.value.toUpperCase())
              }
              className={inputClass(false)}
              placeholder="Confirm Unit ID"
            />

            <input
              type="password"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className={inputClass(false)}
              placeholder="PIN"
            />

            <input
              type="password"
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className={inputClass(false)}
              placeholder="Confirm PIN"
            />

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {alreadyActivated && (
              <button
                type="button"
                onClick={() =>
                  router.push(`/login/tenant?code=${propertyCode}`)
                }
                className="w-full rounded-2xl bg-slate-700 px-4 py-3 text-sm font-semibold text-white"
              >
                Go to Tenant Login
              </button>
            )}

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

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white"
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