"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import SetupProgress from "@/components/setup/SetupProgress";

type Charge = {
  id: string;
  label: string;
  amountCents: number;
};

type Tier = {
  id: string;
  name: string;
  baseAmountCents: number;
  dueDay: number;
  gracePeriodDays: number;
  initialLateFeeCents: number;
  dailyLateFeeCents: number;
  dailyLateFeeMaxDays: number;
  charges: Charge[];
};

type Props = {
  tiers: Tier[];
  highestReachedStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

type ReviewResponse = {
  saved?: boolean;
  redirectTo?: string;
  error?: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoney(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

function formatOrdinal(day: number): string {
  const remainder100 = day % 100;

  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export default function RecurringReviewClient({
  tiers,
  highestReachedStep,
}: Props) {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function continueToBank(): Promise<void> {
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/setup/recurring/review",
        {
          method: "POST",
        }
      );

      const data = (await response.json()) as ReviewResponse;

      if (!response.ok || !data.saved || !data.redirectTo) {
        setError(data.error ?? "Unable to continue.");
        return;
      }

      router.push(data.redirectTo);
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
        <SetupProgress
  currentStep={5}
  highestReachedStep={highestReachedStep}
/>

<div className="rfl-review-topline">
  <p className="rfl-eyebrow">
    Step 5 of 7
  </p>

  <p>Review everything before continuing</p>
</div>

        <header className="rfl-setup-header">
          <h1>Review Your Account</h1>

           <p>
          Everything look right? If so, continue to connect your bank account.
           </p>
        </header>

        <div className="rfl-review-tier-list">
          {tiers.map((tier) => (
            <article
              key={tier.id}
              className="rfl-review-tier"
            >
              <header className="rfl-review-tier-title">
                <h2>{tier.name}</h2>

                <p>
                  Base:{" "}
                  <strong>
                    {formatMoney(tier.baseAmountCents)} / month
                  </strong>
                </p>
              </header>

              <section className="rfl-review-group">
                <h3>Monthly Charges</h3>

                {tier.charges.length > 0 ? (
                  <dl>
                    {tier.charges.map((charge) => (
                      <div key={charge.id}>
                        <dt>{charge.label}:</dt>
                        <dd>{formatMoney(charge.amountCents)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="rfl-review-none">None</p>
                )}
              </section>

              <section className="rfl-review-group">
                <h3>Billing Rules</h3>

                <dl>
                  <div>
                    <dt>Rent Due:</dt>
                    <dd>
                      On the {formatOrdinal(tier.dueDay)}
                    </dd>
                  </div>

                  <div>
                    <dt>Grace Period:</dt>
                    <dd>
                      {tier.gracePeriodDays}{" "}
                      {tier.gracePeriodDays === 1
                        ? "day"
                        : "days"}
                    </dd>
                  </div>

                  <div>
                    <dt>Initial Late Fee:</dt>
                    <dd>
                      {tier.initialLateFeeCents > 0
                        ? formatMoney(
                            tier.initialLateFeeCents
                          )
                        : "None"}
                    </dd>
                  </div>

                  <div>
                    <dt>Daily Late Fee:</dt>
                    <dd>
                      {tier.dailyLateFeeCents > 0
                        ? `${formatMoney(
                            tier.dailyLateFeeCents
                          )} per day`
                        : "None"}
                    </dd>
                  </div>

                  {tier.dailyLateFeeCents > 0 ? (
                    <div>
                      <dt>Daily Fee Limit:</dt>
                      <dd>
                        {tier.dailyLateFeeMaxDays}{" "}
                        {tier.dailyLateFeeMaxDays === 1
                          ? "day"
                          : "days"}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            </article>
          ))}
        </div>

        <aside className="rfl-review-friendly-note">
          <span aria-hidden="true">i</span>

          <p>
           You can edit any of these settings later from your Manager Dashboard.
           The only permanent setting is your Account Code, which you'll choose after connecting Stripe.
          </p>
        </aside>

        {error ? (
          <p className="rfl-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col items-center gap-4">
  <aside className="rfl-review-friendly-note">
    <span aria-hidden="true">i</span>

    <p>
      <strong>Tip:</strong> If you operate as an individual business owner,
      selecting{" "}
      <strong>Individual / Sole Proprietorship</strong> during Stripe setup is
      usually the quickest option.
    </p>
  </aside>

  <button
    className="rfl-primary-button w-full max-w-xs"
    type="button"
    onClick={continueToBank}
    disabled={submitting}
  >
    {submitting ? "Saving..." : "Continue to Stripe"}
  </button>

  <Link
    className="rfl-auth-secondary-link !mt-0"
    href="/setup/recurring/billing"
  >
    Back to Billing Rules
  </Link>
</div>
      </section>
    </main>
  );
}