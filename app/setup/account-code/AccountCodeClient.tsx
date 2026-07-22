"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SetupProgress from "@/components/setup/SetupProgress";

type AccountCodeClientProps = {
  initialAccountCode: string | null;
};

type SuggestionResponse = {
  accountCode?: string;
  locked?: boolean;
  error?: string;
};

type AvailabilityResponse = {
  available?: boolean;
};

type ConfirmResponse = {
  locked?: boolean;
  redirectTo?: string;
  error?: string;
};

function normalizeAccountCode(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (cleaned.length <= 2) {
    return cleaned;
  }

  return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}`;
}

function isValidAccountCode(value: string): boolean {
  return /^[A-Z]{2}-\d{4}$/.test(value);
}

export default function AccountCodeClient({
  initialAccountCode,
}: AccountCodeClientProps) {
  const router = useRouter();

  const [accountCode, setAccountCode] = useState(
    initialAccountCode ?? ""
  );
  const [available, setAvailable] =
    useState<boolean | null>(null);
  const [loading, setLoading] = useState(
    initialAccountCode === null
  );
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialAccountCode) {
      setAvailable(true);
      return;
    }

    async function loadSuggestion(): Promise<void> {
      try {
        const response = await fetch(
          "/api/setup/account-code"
        );

        const data =
          (await response.json()) as SuggestionResponse;

        if (!response.ok || !data.accountCode) {
          setError(
            data.error ??
              "Unable to generate an account code."
          );
          return;
        }

        setAccountCode(data.accountCode);
        setAvailable(true);
      } catch {
        setError("Unable to connect. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    void loadSuggestion();
  }, [initialAccountCode]);

  useEffect(() => {
    if (!isValidAccountCode(accountCode)) {
      setAvailable(null);
      setChecking(false);
      return;
    }

    if (accountCode === initialAccountCode) {
      setAvailable(true);
      setChecking(false);
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setChecking(true);

      try {
        const response = await fetch(
          `/api/setup/account-code/availability?code=${encodeURIComponent(
            accountCode
          )}`,
          {
            signal: controller.signal,
          }
        );

        const data =
          (await response.json()) as AvailabilityResponse;

        setAvailable(
          response.ok && data.available === true
        );
      } catch {
        if (!controller.signal.aborted) {
          setAvailable(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accountCode, initialAccountCode]);

  async function permanentlyConfirm(): Promise<void> {
    if (!isValidAccountCode(accountCode)) {
      setError(
        "Use two letters followed by four numbers."
      );
      return;
    }

    if (!available) {
      setError("Choose an available account code.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/setup/account-code",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountCode,
          }),
        }
      );

      const data =
        (await response.json()) as ConfirmResponse;

      if (
        !response.ok ||
        !data.locked ||
        !data.redirectTo
      ) {
        setError(
          data.error ??
            "Unable to confirm the account code."
        );
        return;
      }

      setConfirmed(true);

      window.setTimeout(() => {
        router.replace(data.redirectTo!);
        router.refresh();
      }, 450);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const statusText = loading
    ? "Generating an available code..."
    : checking
      ? "Checking availability..."
      : available === true
        ? "This code is available."
        : available === false
          ? "That account code is already taken. Please choose another."
          : "Use two letters followed by four numbers.";

  return (
    <main className="rfl-setup-page">
      <section className="rfl-setup-card">
        <SetupProgress
          currentStep={7}
          highestReachedStep={7}
        />

        <p className="rfl-eyebrow">
          Final setup step
        </p>

        <header className="rfl-setup-header">
          <h1>Choose your account code</h1>

          <p>
            This is the code your customers will use to find your business and make payments.
          </p>
        </header>

        <div className="rfl-account-code-panel">
          <label htmlFor="accountCode">
            Your Account Code
          </label>

          <input
            id="accountCode"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            onFocus={(event) => event.target.select()}
            maxLength={7}
            disabled={loading || submitting || confirmed}
            value={accountCode}
            onChange={(event) => {
              setAccountCode(
                normalizeAccountCode(event.target.value)
              );
              setError("");
              setConfirmed(false);
            }}
          />

          <p
            className={[
              "rfl-account-code-availability",
              available === true
                ? "rfl-account-code-available"
                : "",
              available === false
                ? "rfl-account-code-unavailable"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-live="polite"
          >
            {available === true && !checking ? (
              <span aria-hidden="true">✓</span>
            ) : null}

            {statusText}
          </p>
        </div>

        <aside className="rfl-account-code-warning">
          <span aria-hidden="true">i</span>

          <div>
            <strong>One last thing...</strong>

            <p>
              Your account code is permanent. Customers will use this code whenever
              they make a payment to your business, so take a moment to make sure
              you're happy with your choice.
            </p>
          </div>
        </aside>

        {error ? (
          <p className="rfl-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="rfl-primary-button"
          type="button"
          disabled={
            loading ||
            checking ||
            !available ||
            submitting ||
            confirmed
          }
          onClick={permanentlyConfirm}
        >
          {confirmed
            ? "Account Ready!"
            : submitting
              ? "Confirming..."
              : "Permanently Confirm Account Code"}
        </button>
      </section>
    </main>
  );
}