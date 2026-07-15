"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function normalizeAccountCode(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (cleaned.length <= 2) {
    return cleaned;
  }

  return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}`;
}

export default function HomePage() {
  const router = useRouter();
  const [accountCode, setAccountCode] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const normalizedCode = normalizeAccountCode(accountCode);

    if (!/^[A-Z]{2}-\d{4}$/.test(normalizedCode)) {
      setError("Enter a valid account code, such as AB-1234.");
      return;
    }

    setError("");
    router.push(`/checkout?code=${encodeURIComponent(normalizedCode)}`);
  }

  return (
    <main className="rfl-home">
      <section className="rfl-home-card" aria-labelledby="rfl-title">
        <header className="rfl-brand">
          <p className="rfl-brand-mark">RFL</p>

          <h1 id="rfl-title">RentFrayLite</h1>

          <p>The fastest way to get paid.</p>
        </header>

        <form className="rfl-code-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="accountCode">Enter Account Code</label>

          <input
            id="accountCode"
            name="accountCode"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={7}
            placeholder="AB-1234"
            value={accountCode}
            onChange={(event) => {
              setAccountCode(normalizeAccountCode(event.target.value));
              setError("");
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "accountCodeError" : undefined}
          />

          {error ? (
            <p id="accountCodeError" className="rfl-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="rfl-primary-button">
            Continue
          </button>
        </form>

        <div className="rfl-secondary-actions">
          <button
            type="button"
            onClick={() => router.push("/setup")}
            className="rfl-secondary-button"
          >
            Start Accepting Payments
          </button>

          <button
            type="button"
            onClick={() => router.push("/login/manager")}
            className="rfl-text-button"
          >
            Manager Login
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => router.push("/login/admin")}
        className="rfl-admin-link"
      >
        Admin
      </button>
    </main>
  );
}
