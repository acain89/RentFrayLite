// app/property-code/page.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function fieldClass(hasError: boolean) {
  return [
    "w-full rounded-2xl border bg-white px-4 py-3.5 text-lg text-slate-900 outline-none transition",
    "placeholder:text-slate-400 focus:border-slate-700 focus:ring-2 focus:ring-sky-200",
    hasError ? "border-rose-300" : "border-sky-200",
  ].join(" ");
}

export default function PropertyCodePage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    const cleanCode = code.trim();

    if (!/^\d{4,5}$/.test(cleanCode)) {
      setError("Enter a valid 4 or 5 digit property code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/property/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: cleanCode }),
      });

      const data = await res.json().catch(() => null);

      const hasValidProperty =
        Boolean(data?.ok) &&
        (Boolean(data?.propertyId) || Boolean(data?.property?.id));

      if (!res.ok || !hasValidProperty) {
        setError(data?.error || "Invalid property code.");
        setLoading(false);
        return;
      }

      router.replace(`/property-code/role?code=${encodeURIComponent(cleanCode)}`);
    } catch {
      setError("Unable to verify property code.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50 to-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-xs font-semibold tracking-[0.2em] text-slate-700">
          RENTFRAY
        </div>

        <section className="rounded-[28px] border border-sky-200 bg-white/95 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Property Code
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enter your property code to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="property-code"
                className="mb-1.5 block text-xs font-medium text-slate-800"
              >
                Property Code
              </label>

              <input
                id="property-code"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                autoComplete="one-time-code"
                maxLength={5}
                value={code}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setCode(next);
                  if (error) setError("");
                }}
                className={fieldClass(!!error)}
                placeholder="1234"
              />
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
              {loading ? "Checking..." : "Continue"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}