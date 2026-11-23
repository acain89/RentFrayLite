"use client";

import { useState } from "react";
import Link from "next/link";

export type ReviewLineItem = {
  type: string;
  label: string;
  amountCents: number;
};

type ReviewPaymentClientProps = {
  sourceType?: "RECURRING_PLAN" | "CUSTOM_PAYMENT";
  attemptReserved?: boolean;
  checkoutSessionId: string;
  businessName: string;
  accountCode: string;
  unitNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  paymentMethod: "ACH" | "CARD";
  billingCycle: string | null;
  dueDate: string | null;
  graceEndsAt: string | null;
  lineItems: ReviewLineItem[];
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
};

function formatMoney(
  amountCents: number
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

function formatBillingCycle(
  billingCycle: string
): string {
  const [yearText, monthText] =
    billingCycle.split("-");

  const year = Number(yearText);
  const month = Number(monthText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month)
  ) {
    return billingCycle;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatPhone(
  phone: string
): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length !== 10) {
    return phone;
  }

  return `(${digits.slice(
    0,
    3
  )}) ${digits.slice(
    3,
    6
  )}-${digits.slice(6)}`;
}

function isPlatformFee(
  item: ReviewLineItem
): boolean {
  return item.type === "PLATFORM_FEE";
}

export default function ReviewPaymentClient({
  sourceType = "RECURRING_PLAN",
  checkoutSessionId,
  accountCode,
  unitNumber,
  firstName,
  lastName,
  phone,
  paymentMethod,
  billingCycle,
  dueDate,
  graceEndsAt,
  lineItems,
  subtotalCents,
  platformFeeCents,
  totalCents,
}: ReviewPaymentClientProps) {
const [isSubmitting, setIsSubmitting] =
  useState(false);

const [error, setError] = useState("");

const isCustom = sourceType === "CUSTOM_PAYMENT";

const chargeLineItems = lineItems.filter(
  (item) => !isPlatformFee(item)
);

async function beginCheckout() {
  if (isSubmitting) {
    return;
  }

  setIsSubmitting(true);
  setError("");

  try {
    const response = await fetch(
      "/api/public/checkout/start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkoutSessionId,
        }),
      }
    );

    const payload = (await response.json()) as {
      ok?: boolean;
      checkoutUrl?: string;
      error?: string;
    };

    if (!response.ok || !payload.checkoutUrl) {
      throw new Error(
        payload.error ??
          "Unable to begin checkout."
      );
    }

    window.location.assign(payload.checkoutUrl);
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Unable to begin checkout."
    );

    setIsSubmitting(false);
  }
}

  return (
    <main className="rfl-public-checkout-page rfl-payment-review-page">
      <section className="rfl-checkout-shell rfl-review-shell">
        <div className="rfl-review-card">
          <div className="rfl-review-heading">
            <p className="rfl-review-eyebrow">
              Final step
            </p>

            <h1>Review Payment</h1>

            <p>
              Confirm the information and amount
              below before continuing to secure
              payment.
            </p>
          </div>

          <div className="rfl-review-details-grid">
            {isCustom ? <div><span>Payment Type</span><strong>Custom</strong></div> : <div>
              <span>Billing Cycle</span>
              <strong>
                {formatBillingCycle(
                  billingCycle ?? ""
                )}
              </strong>
            </div>}

            <div>
              <span>Unit / Space</span>
              <strong>{unitNumber}</strong>
            </div>

            <div>
              <span>Payer</span>
              <strong>
                {firstName} {lastName}
              </strong>
            </div>

            <div>
              <span>Mobile Phone</span>
              <strong>
                {formatPhone(phone)}
              </strong>
            </div>

            <div>
              <span>Payment Method</span>
              <strong>
                {paymentMethod === "ACH" ? "Bank account (ACH)" : "Historical card payment"}
              </strong>
            </div>

            <div>
              <span>Account</span>
              <strong>{accountCode}</strong>
            </div>
          </div>


          <div className="rfl-review-line-items">
            {chargeLineItems.map(
              (item, index) => (
                <div
                  className="rfl-review-line-item"
                  key={`${item.type}-${item.label}-${index}`}
                >
                  <span>{item.label}</span>

                  <strong>
                    {formatMoney(
                      item.amountCents
                    )}
                  </strong>
                </div>
              )
            )}

            <div className="rfl-review-divider" />

            <div className="rfl-review-line-item">
              <span>Subtotal</span>

              <strong>
                {formatMoney(subtotalCents)}
              </strong>
            </div>

            <div className="rfl-review-line-item">
              <span>
                Platform Service Fee
              </span>

              <strong>
                {formatMoney(
                  platformFeeCents
                )}
              </strong>
            </div>

            <div className="rfl-review-total-row">
              <span>{isCustom ? "Payment total" : "Total Due"}</span>

              <strong>
                {formatMoney(totalCents)}
              </strong>
            </div>
          </div>

          {!isCustom && dueDate && graceEndsAt ? <div className="rfl-review-date-grid">
            <div>
              <span>Due Date</span>
              <strong>
                {formatDate(dueDate)}
              </strong>
            </div>

            <div>
              <span>Grace Period Ends</span>
              <strong>
                {formatDate(graceEndsAt)}
              </strong>
            </div>
          </div> : null}

          <div className="rfl-review-assurances">
            <p>
              By continuing, you authorize this
              one-time payment only. No recurring
              or automatic payments will be
              created.
            </p>

            <ul>
              <li>One-time payment only</li>
              <li>No automatic payments</li>
            </ul>
          </div>

          <div className="rfl-checkout-trust">
            <strong>Secure checkout powered by Stripe</strong>
            <span>
              RentFrayLite does not store complete bank account or historic card
              numbers.
            </span>
          </div>

          <p className="rfl-checkout-legal-notice">
            By continuing, you agree to the{" "}
            <Link href="/terms" target="_blank">
              Terms of Service
            </Link>{" "}
            and acknowledge the{" "}
            <Link href="/privacy" target="_blank">
              Privacy Policy
            </Link>
            .
          </p>

          <div className="rfl-review-actions">
            <Link
              className="rfl-review-back-button"
              href={`/${encodeURIComponent(
                accountCode
              )}`}
            >
              Back
            </Link>

            <button
  className="rfl-checkout-primary-button"
  type="button"
  disabled={isSubmitting}
  onClick={beginCheckout}
>
  {isSubmitting
    ? "Opening Secure Checkout..."
    : "Continue to Secure Payment"}
           </button>
            {error && (
            <p className="rfl-review-error" role="alert">
             {error}
             </p>
             )}
          </div>
        </div>
      </section>
    </main>
  );
}
