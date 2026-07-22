"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type SetupResponse = {
  redirectTo?: string;
  error?: string;
};

export default function SetupAccountClient() {
  const router = useRouter();

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessName: formData.get("businessName"),
          ownerName: formData.get("ownerName"),
          contactEmail: formData.get("contactEmail"),
          contactPhone: formData.get("contactPhone"),
          managerEmail: formData.get("managerEmail"),
          password: formData.get("password"),
          confirmPassword: formData.get("confirmPassword"),
        }),
      });

      const data = (await response.json()) as SetupResponse;

      if (!response.ok || !data.redirectTo) {
        setError(data.error ?? "Unable to create the account.");
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
    <main className="rfl-setup-page">
      <section className="rfl-setup-card">
        <Link className="rfl-auth-home-link" href="/">
          RentFrayLite
        </Link>

        <header className="rfl-setup-header">
          <p className="rfl-eyebrow">Step 1 of 4</p>
          <h1>Create your business account</h1>
          <p>
            Start accepting payments in just a few minutes.
          </p>
        </header>

        <form className="rfl-setup-form" onSubmit={handleSubmit}>
          <div className="rfl-field">
            <label htmlFor="businessName">Business name</label>
            <input
              id="businessName"
              name="businessName"
              type="text"
              autoComplete="organization"
              required
              maxLength={120}
            />
          </div>

          <div className="rfl-field">
            <label htmlFor="ownerName">Your name</label>
            <input
              id="ownerName"
              name="ownerName"
              type="text"
              autoComplete="name"
              required
              maxLength={100}
            />
          </div>

          <div className="rfl-setup-grid">
            <div className="rfl-field">
              <label htmlFor="contactEmail">Business email</label>
              <input
                id="contactEmail"
                name="contactEmail"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div className="rfl-field">
              <label htmlFor="contactPhone">
                Business phone
                <span> Optional</span>
              </label>
              <input
                id="contactPhone"
                name="contactPhone"
                type="tel"
                autoComplete="tel"
                maxLength={30}
              />
            </div>
          </div>

          <div className="rfl-setup-section">
            <h2>Manager login</h2>
            <p>This will be the login used to manage the account.</p>
          </div>

          <div className="rfl-field">
            <label htmlFor="managerEmail">Manager email</label>
            <input
              id="managerEmail"
              name="managerEmail"
              type="email"
              autoComplete="username"
              required
            />
          </div>

          <div className="rfl-setup-grid">
            <div className="rfl-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </div>

            <div className="rfl-field">
              <label htmlFor="confirmPassword">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </div>
          </div>

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
            {submitting ? "Creating account..." : "Continue"}
          </button>
        </form>

        <Link className="rfl-auth-secondary-link" href="/login/manager">
          Already have an account? Sign in
        </Link>
      </section>
    </main>
  );
}
