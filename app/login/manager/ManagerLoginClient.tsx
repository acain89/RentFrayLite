"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse = {
  authenticated?: boolean;
  redirectTo?: string;
  error?: string;
};

export default function ManagerLoginClient() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          type: "MANAGER",
          email,
          password,
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
      <section className="rfl-auth-card">
        <Link className="rfl-auth-home-link" href="/">
          RentFrayLite
        </Link>

        <header className="rfl-auth-header">
          <p className="rfl-eyebrow">Manager access</p>
          <h1>Welcome back</h1>
          <p>Sign in to manage your business and payments.</p>
        </header>

        <form className="rfl-auth-form" onSubmit={handleSubmit}>
          <label htmlFor="managerEmail">Email address</label>

          <input
            id="managerEmail"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
          />

          <label htmlFor="managerPassword">Password</label>

          <input
            id="managerPassword"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
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
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <Link className="rfl-auth-secondary-link" href="/setup">
          Create a business account
        </Link>
      </section>
    </main>
  );
}
