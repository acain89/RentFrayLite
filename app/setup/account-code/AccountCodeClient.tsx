"use client";

import { startTransition,  useEffect, useRef, useState } from "react";
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
  available: boolean;
  valid: true;
};

type ConfirmResponse = {
  locked?: boolean;
  redirectTo?: string;
  error?: string;
};

function isAvailabilityResponse(value: unknown): value is AvailabilityResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "valid" in value &&
    value.valid === true &&
    "available" in value &&
    typeof value.available === "boolean"
  );
}

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
  const currentCode = useRef(initialAccountCode ?? "");

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
      startTransition(() => setAvailable(true));
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

        currentCode.current = data.accountCode;
        setAccountCode(data.accountCode);
        setAvailable(null);
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
      startTransition(() => { setAvailable(null); setChecking(false); });
      return;
    }

    if (accountCode === initialAccountCode) {
      startTransition(() => { setAvailable(true); setChecking(false); });
      return;
    }

    const controller = new AbortController();
    let active = true;
    const isCurrent = () =>
      active &&
      !controller.signal.aborted &&
      currentCode.current === accountCode;
    startTransition(() => { setAvailable(null); setChecking(true); });

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/setup/account-code/availability?code=${encodeURIComponent(
            accountCode
          )}`,
          {
            signal: controller.signal,
          }
        );

        if (!isCurrent()) return;
        if (!response.ok) throw new Error("Availability verification failed");
        const data: unknown = await response.json();
        if (!isCurrent()) return;
        if (!isAvailabilityResponse(data)) {
          throw new Error("Invalid availability response");
        }
        setAvailable(data.available);
      } catch {
        if (isCurrent()) {
          setAvailable(null);
          setError("Unable to verify this account code. Please try again.");
        }
      } finally {
        if (isCurrent()) {
          setChecking(false);
        }
      }
    }, 450);

    return () => {
      active = false;
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

    if (checking || available !== true) {
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
          : isValidAccountCode(accountCode)
            ? "Availability not verified."
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
              const nextCode = normalizeAccountCode(event.target.value);
              if (nextCode !== accountCode) {
                currentCode.current = nextCode;
                setAccountCode(nextCode);
                setAvailable(null);
                setChecking(false);
                setError("");
                setConfirmed(false);
              }
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
              <span aria-hidden="true">âœ“</span>
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
              you&apos;re happy with your choice.
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
