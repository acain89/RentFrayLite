"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok || data?.ok === false) {
  setError(data?.error || "Invalid code");
  return;
}

     window.location.href = "/admin";
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold mb-4 text-center">
          Admin Access
        </h1>

        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="6-digit code"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg tracking-widest"
        />

        {error && (
          <div className="mt-3 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="mt-4 w-full rounded-xl bg-slate-900 text-white py-3 font-semibold disabled:opacity-50"
        >
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>
    </main>
  );
}