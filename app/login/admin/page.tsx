"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse = {
  redirectTo?: string;
  error?: string;
};

export default function AdminLoginPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "ADMIN",
          code,
        }),
      });

      const data = (await response.json()) as LoginResponse;

      if (!response.ok || !data.redirectTo) {
        setError(data.error ?? "Unable to sign in.");
        return;
      }

      router.replace(data.redirectTo);
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="rfl-auth-page">
      <section className="rfl-auth-card rfl-auth-card-small">
        <Link className="rfl-auth-home-link" href="/">
          RentFrayLite
        </Link>

        <header className="rfl-auth-header">
          <p className="rfl-eyebrow">Administration</p>
          <h1>Admin access</h1>
        </header>

        <form className="rfl-auth-form" onSubmit={handleSubmit}>
          <label htmlFor="adminCode">Administrator password or passphrase</label>

          <input
            id="adminCode"
            name="code"
            type="password"
            autoComplete="current-password"
            maxLength={72}
            minLength={16}
            required
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setError("");
            }}
          />

          {error ? (
            <p className="rfl-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="rfl-primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Checking..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
