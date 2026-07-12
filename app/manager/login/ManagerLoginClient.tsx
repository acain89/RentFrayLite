// app/manager/login/ManagerLoginClient.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function fieldClass(hasError: boolean) {
  return [
    "w-full rounded-2xl border bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition",
    "placeholder:text-slate-400 focus:border-slate-700 focus:ring-2 focus:ring-sky-200",
    hasError ? "border-rose-300" : "border-sky-200",
  ].join(" ");
}

export default function ManagerLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const code = searchParams.get("code") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code) {
      router.replace("/property-code");
    }
  }, [code, router]);

  if (!code) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setError("Enter email.");
      return;
    }

    if (!cleanPassword) {
      setError("Enter password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/manager/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          propertyCode: code,
          email: cleanEmail,
          password: cleanPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.error || "Invalid credentials.");
        setLoading(false);
        return;
      }

      router.replace("/manager");
    } catch {
      setError("Unable to login.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50 to-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-xs font-semibold tracking-[0.2em] text-slate-700">
          RENTFRAY
        </div>

        <section className="rounded-[28px] border border-sky-200 bg-white/95 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Manager Login
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Property code:{" "}
              <span className="font-mono font-semibold text-slate-900">
                {code}
              </span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-800">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                className={fieldClass(false)}
                placeholder="manager@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-800">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                className={fieldClass(!!error)}
                placeholder="••••••••"
                autoComplete="current-password"
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
              {loading ? "Signing in..." : "Continue"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}