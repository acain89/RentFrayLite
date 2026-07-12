// app/tenant/login/page.tsx

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function TenantLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const code = searchParams.get("code") || "";

  const [unitNumber, setUnitNumber] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!code) {
    router.replace("/property-code");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;

    const cleanUnit = unitNumber.trim().toUpperCase();
    const cleanPin = pin.replace(/\D/g, "").slice(0, 4);

    if (!cleanUnit) {
      setError("Enter unit number.");
      return;
    }

    if (cleanPin.length !== 4) {
      setError("Enter a valid 4-digit PIN.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/tenant/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          propertyCode: code,
          unitNumber: cleanUnit,
          pin: cleanPin,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.error || "Invalid credentials.");
        setLoading(false);
        return;
      }

      router.replace("/tenant");
    } catch {
      setError("Unable to login.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-white text-black">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          Tenant Login
        </h1>

        <p className="mt-2 text-sm text-neutral-500 text-center">
          Property Code: <span className="font-medium">{code}</span>
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Unit Number
            </label>
            <input
              type="text"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
              placeholder="101"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black tracking-widest"
              placeholder="••••"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}