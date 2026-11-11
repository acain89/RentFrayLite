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
  attemptReserved = false,
  checkoutSessionId,
  businessName,
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
const [isChangingMethod, setIsChangingMethod] = useState(false);
const [chosenMethod, setChosenMethod] = useState(paymentMethod);
const isCustom = sourceType === "CUSTOM_PAYMENT";

async function changeCustomMethod(method: "ACH" | "CARD") {
  if (!isCustom || attemptReserved || isSubmitting || isChangingMethod || method === paymentMethod) return;
  setChosenMethod(method); setIsChangingMethod(true); setError("");
  try {
    const amount = `${Math.trunc(subtotalCents / 100)}.${String(subtotalCents % 100).padStart(2, "0")}`;
    const response = await fetch("/api/public/checkout/session", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "CUSTOM_PAYMENT", accountCode, amount, firstName, lastName, unitNumber, phone, paymentMethod: method, previousCheckoutSessionId: checkoutSessionId }) });
    const payload = await response.json();
    if (!response.ok || typeof payload.reviewUrl !== "string") throw Error(payload.error ?? "Unable to update payment method.");
    window.location.assign(payload.reviewUrl);
  } catch (err) { setError(err instanceof Error ? err.message : "Unable to update payment method."); setChosenMethod(paymentMethod); setIsChangingMethod(false); }
}

const chargeLineItems = lineItems.filter(
  (item) => !isPlatformFee(item)
);

async function beginCheckout() {
  if (isSubmitting || isChangingMethod) {
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
    <main className="rfl-public-checkout-page">
      <section className="rfl-checkout-shell rfl-review-shell">
        <header className="rfl-checkout-header">
          <p className="rfl-checkout-brand">
            RentFrayLite
          </p>

          <h1>{businessName}</h1>

          <p className="rfl-checkout-code">
            Account code: {accountCode}
          </p>
        </header>

        <div className="rfl-review-card">
          <div className="rfl-review-heading">
            <p className="rfl-review-eyebrow">
              Final step
            </p>

            <h2>Review Payment</h2>

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
                {paymentMethod === "ACH"
                  ? "Bank account"
                  : "Credit or debit card"}
              </strong>
            </div>

            <div>
              <span>Session</span>
              <strong>
                {checkoutSessionId.slice(
                  -8
                )}
              </strong>
            </div>
          </div>

          {isCustom ? <fieldset className="rfl-checkout-payment-method" disabled={attemptReserved || isSubmitting || isChangingMethod}>
            <legend>Payment method</legend>
            <label><input type="radio" name="customPaymentMethod" checked={chosenMethod === "ACH"} onChange={() => changeCustomMethod("ACH")} />Bank account (ACH)</label>
            <label><input type="radio" name="customPaymentMethod" checked={chosenMethod === "CARD"} onChange={() => changeCustomMethod("CARD")} />Credit or debit card</label>
            {isChangingMethod ? <p>Updating payment summary…</p> : null}
          </fieldset> : null}

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
                {isCustom ? "Processing fee" : "Platform Service Fee"}
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
              <li>
                SMS receipt sent after payment
              </li>
            </ul>
          </div>

          <div className="rfl-checkout-trust">
            <strong>Secure checkout powered by Stripe</strong>
            <span>
              RentFrayLite does not store complete bank account or card
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
  disabled={isSubmitting || isChangingMethod}
  onClick={beginCheckout}
>
  {isSubmitting
    ? "Opening Secure Checkout..."
    : "Continue to Secure Payment"}
           </button>
            {error && (
            <p className="rfl-review-error">
             {error}
             </p>
             )}
          </div>
        </div>
      </section>
    </main>
  );
}
