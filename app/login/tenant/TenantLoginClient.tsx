"use client";

import { useEffect, useState } from "react";

type TenantLoginClientProps = {
  propertyCode: string;
};

export default function TenantLoginClient({
  propertyCode,
}: TenantLoginClientProps) {
  const [resolvedCode, setResolvedCode] = useState<string>(propertyCode);
  const [unitNumber, setUnitNumber] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (propertyCode) {
      localStorage.setItem("rf_property_code", propertyCode);
      setResolvedCode(propertyCode);
    } else {
      const stored = localStorage.getItem("rf_property_code");
      if (stored) {
        setResolvedCode(stored);
      }
    }
  }, [propertyCode]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    if (!resolvedCode) {
      setError("Missing property code.");
      return;
    }

    if (!unitNumber.trim() || !pin.trim()) {
      setError("Enter unit number and PIN.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/tenant/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          propertyCode: resolvedCode,
          unitNumber: unitNumber.trim().toUpperCase(),
          pin: pin.trim(),
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.ok) {
        setError(
          `Login failed | status=${res.status} | error=${data?.error || "unknown"}`
        );
        setLoading(false);
        return;
      }

      window.location.href = `/tenant/dashboard?code=${resolvedCode}`;
    } catch {
      setError("Login error.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
        <div className="w-full">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              Tenant Login
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Enter your unit number and 4-digit PIN.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
              placeholder="101"
            />

            <input
              type="password"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
              placeholder="••••"
            />

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
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}