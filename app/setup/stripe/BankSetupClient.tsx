"use client";

import { useState } from "react";
import Link from "next/link";
import type { PaymentReadiness } from "@/lib/paymentReadiness";
import { useRouter } from "next/navigation";
import SetupProgress from "@/components/setup/SetupProgress";
import type { StripeConnectionStatus } from "@/lib/stripeConnection";

type BankSetupClientProps = {
  initialStatus: StripeConnectionStatus;
  readiness: PaymentReadiness | null;
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
  readiness,
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
    router.push(readiness?.ready ? "/manager/dashboard" : "/setup/account-code");
    router.refresh();
  }

  return (
    <main className="rfl-setup-page">
      <section className="rfl-setup-card">
        <SetupProgress
          currentStep={6}
          highestReachedStep={highestReachedStep}
        />

        <header className="rfl-setup-header">
          <h1>Connect your bank</h1>
        </header>

        <ul className="rfl-bank-benefits" aria-label="Stripe banking benefits">
          {[
            "Stripe securely collects your banking information.",
            "RentFrayLite never sees or stores your bank login credentials.",
            "Customer payments are processed securely through Stripe.",
            "Receive payouts directly to your connected bank account.",
          ].map((benefit) => (
            <li key={benefit}>
              <span aria-hidden="true">{"\u2713"}</span>
              <p>{benefit}</p>
            </li>
          ))}
        </ul>

        <aside className="rfl-bank-tip" aria-label="Stripe setup tip">
          <strong>Tip</strong>
          <p>
            If you&apos;re a sole proprietor, selecting Individual / Sole
            Proprietorship during Stripe setup is usually the simplest option.
          </p>
        </aside>

        {readiness ? <aside aria-label="Payment readiness"><strong>{readiness.title}</strong>
          {readiness.reasons.map((reason) => <p key={reason.code}><Link href={reason.route}>{reason.message}</Link></p>)}
        </aside> : null}

        {readiness?.canChooseAccountCode ? (
          <div className="rfl-bank-success">
            <span aria-hidden="true">{"\u2713"}</span>

            <div>
              <strong>Bank account connected</strong>

              <p>
                Your bank account has been connected successfully. You&apos;re ready
                to choose your permanent Account Code.
              </p>
            </div>
          </div>
        ) : (
          <>
            {returnedFromStripe && !readiness?.canChooseAccountCode ? (
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

          </>
        )}

        {error ? (
          <p className="rfl-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rfl-bank-actions">
          {readiness?.canChooseAccountCode ? (
            <button
              className="rfl-primary-button"
              type="button"
              onClick={continueToAccountCode}
            >
              {readiness?.ready ? "Go to Dashboard" : "Continue to Account Code"}
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

      </section>
    </main>
  );
}
