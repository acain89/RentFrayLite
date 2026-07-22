"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SetupProgress from "@/components/setup/SetupProgress";
import type { StripeConnectionStatus } from "@/lib/stripeConnection";

type BankSetupClientProps = {
  initialStatus: StripeConnectionStatus;
  highestReachedStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  returnedFromStripe: boolean;
  initialError: string | null;
};

type ConnectResponse = {
  redirectTo?: string;
  error?: string;
};

export default function BankSetupClient({
  initialStatus,
  highestReachedStep,
  returnedFromStripe,
  initialError,
}: BankSetupClientProps) {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  async function openStripe(): Promise<void> {
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/stripe/connect", {
        method: "POST",
      });

      const data = (await response.json()) as ConnectResponse;

      if (!response.ok || !data.redirectTo) {
        setError(data.error ?? "Unable to open Stripe setup.");
        return;
      }

      window.location.assign(data.redirectTo);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function continueToAccountCode(): void {
    router.push("/setup/account-code");
    router.refresh();
  }

  return (
    <main className="rfl-setup-page">
      <section className="rfl-setup-card">
        <SetupProgress
          currentStep={6}
          highestReachedStep={highestReachedStep}
        />

        <p className="rfl-eyebrow">Step 6 of 7</p>

        <header className="rfl-setup-header">
          <h1>
            {initialStatus.readyForLive
              ? "Bank account connected!"
              : initialStatus.exists
                ? "Finish connecting your bank"
                : "Connect your bank"}
          </h1>

          {!initialStatus.readyForLive ? (
            <>
              <p>
                Stripe securely connects your bank account so you can receive
                customer payments. RentFrayLite never stores your banking
                credentials.
              </p>

              <div className="rfl-bank-tip">
                <strong>Tip:</strong> If you operate as an individual business
                owner, selecting{" "}
                <strong>Individual / Sole Proprietorship</strong> is usually the
                quickest option.
              </div>
            </>
          ) : null}
        </header>

        {initialStatus.readyForLive ? (
          <div className="rfl-bank-success">
            <span aria-hidden="true">✓</span>

            <div>
              <strong>Bank account connected</strong>

              <p>
                Your bank account has been connected successfully. You're ready
                to choose your permanent Account Code.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="rfl-bank-benefits">
              <div>
                <span aria-hidden="true">✓</span>

                <p>
                  <strong>Secure verification</strong>
                  Your information is collected directly by Stripe.
                </p>
              </div>

              <div>
                <span aria-hidden="true">✓</span>

                <p>
                  <strong>Direct deposits</strong>
                  Funds are deposited into your connected account.
                </p>
              </div>
            </div>

            {returnedFromStripe && !initialStatus.readyForLive ? (
              <div className="rfl-bank-notice">
                <strong>Stripe still needs more information.</strong>

                <p>
                  Reopen Stripe setup and complete the remaining steps.
                </p>

                {initialStatus.requirementsSummary ? (
                  <p>
                    Remaining: {initialStatus.requirementsSummary}
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="rfl-field-help text-center">
              Usually takes less than 2 minutes.
            </p>
          </>
        )}

        {error ? (
          <p className="rfl-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rfl-bank-actions">
          {initialStatus.readyForLive ? (
            <button
              className="rfl-primary-button"
              type="button"
              onClick={continueToAccountCode}
            >
              Continue to Account Code
            </button>
          ) : (
            <button
              className="rfl-primary-button"
              type="button"
              disabled={submitting}
              onClick={openStripe}
            >
              {submitting
                ? "Opening Stripe..."
                : initialStatus.exists
                  ? "Continue Stripe Setup"
                  : "Connect Bank Account"}
            </button>
          )}
        </div>

        <p className="rfl-bank-footer">
          Your banking information is securely collected and stored by Stripe.
          RentFrayLite never has access to your bank account credentials.
        </p>
      </section>
    </main>
  );
}