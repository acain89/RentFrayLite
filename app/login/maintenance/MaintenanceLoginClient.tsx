// app/login/maintenance/MaintenanceLoginClient.tsx

"use client";

import { useEffect, useState } from "react";

type Props = {
  propertyCode?: string;
};

const PROPERTY_CODE_STORAGE_KEY = "rf_property_code";

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export default function MaintenanceLoginClient({ propertyCode }: Props) {
  const [pin, setPin] = useState("");
  const [resolvedPropertyCode, setResolvedPropertyCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromProp = clean(propertyCode);
    const fromStorage =
      typeof window !== "undefined"
        ? clean(window.localStorage.getItem(PROPERTY_CODE_STORAGE_KEY))
        : "";

    const finalCode = fromProp || fromStorage;

    if (finalCode) {
      setResolvedPropertyCode(finalCode);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(PROPERTY_CODE_STORAGE_KEY, finalCode);
      }
    }
  }, [propertyCode]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    const finalPropertyCode =
      resolvedPropertyCode ||
      clean(propertyCode) ||
      (typeof window !== "undefined"
        ? clean(window.localStorage.getItem(PROPERTY_CODE_STORAGE_KEY))
        : "");

    const normalizedPin = pin.trim();

    if (!finalPropertyCode) {
      setError("Missing property code. Please restart login.");
      return;
    }

    if (!/^\d{4}$/.test(normalizedPin)) {
      setError("Enter a valid 4-digit PIN.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PROPERTY_CODE_STORAGE_KEY,
          finalPropertyCode
        );
      }

      const res = await fetch("/api/maintenance/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          propertyCode: finalPropertyCode,
          pin: normalizedPin,
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

      window.location.href = `/maintenance?code=${finalPropertyCode}`;
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
              Maintenance Login
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Enter your 4-digit PIN.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">
                4-Digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                placeholder="••••"
                autoComplete="off"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

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