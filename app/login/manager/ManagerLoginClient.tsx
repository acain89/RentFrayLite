// app/login/manager/ManagerLoginClient.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ManagerLoginClientProps = {
  propertyCode?: string;
};

const PROPERTY_CODE_STORAGE_KEY = "rf_property_code";

function cleanPropertyCode(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export default function ManagerLoginClient({
  propertyCode,
}: ManagerLoginClientProps) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resolvedPropertyCode, setResolvedPropertyCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromProp = cleanPropertyCode(propertyCode);
    const fromStorage =
      typeof window !== "undefined"
        ? cleanPropertyCode(
            window.localStorage.getItem(PROPERTY_CODE_STORAGE_KEY)
          )
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
      cleanPropertyCode(propertyCode) ||
      (typeof window !== "undefined"
        ? cleanPropertyCode(
            window.localStorage.getItem(PROPERTY_CODE_STORAGE_KEY)
          )
        : "");

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!finalPropertyCode) {
      setError("Missing property code. Please restart login.");
      return;
    }

    if (!normalizedEmail || !normalizedPassword) {
      setError("Enter email and password.");
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

      const res = await fetch("/api/manager/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          propertyCode: finalPropertyCode,
          email: normalizedEmail,
          username: normalizedEmail,
          password: normalizedPassword,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

 if (!res.ok || !data?.ok) {
  setError(`Login failed | status=${res.status} | error=${data?.error || "unknown"}`);
  setLoading(false);
  return;
}

      window.location.href = `/manager/dashboard?code=${finalPropertyCode}`;
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
              Manager Login
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Enter your email and password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                placeholder="manager@test.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

             <div className="text-right">
  <button
    type="button"
    className="text-xs text-neutral-600 hover:underline"
    onClick={() => alert("Contact property admin to reset password.")}
  >
    Forgot password?
  </button>
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