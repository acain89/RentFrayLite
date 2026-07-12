"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ManagerLogin() {
  const router = useRouter();

  const [propertyCode, setPropertyCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/manager/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          propertyCode,
          username,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      router.push("/manager/dashboard");
    } catch {
      setError("Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        <input
          placeholder="Property Code"
          value={propertyCode}
          onChange={(e) => setPropertyCode(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        />

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        />

        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded-lg text-sm"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </div>
    </div>
  );
}