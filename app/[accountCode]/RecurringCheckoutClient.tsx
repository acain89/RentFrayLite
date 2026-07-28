"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

type CheckoutCharge = {
  id: string;
  label: string;
  amountCents: number;
};

type CheckoutPlan = {
  id: string;
  name: string;
  baseAmountCents: number;
  dueDay: number;
  charges: CheckoutCharge[];
};

type RecurringCheckoutClientProps = {
  businessName: string;
  accountCode: string;
  plans: CheckoutPlan[];
};

type PaymentMethod = "ACH" | "CARD";

type CheckoutPricingLineItemType =
  | "BASE_AMOUNT"
  | "RECURRING_CHARGE"
  | "ONE_TIME_CHARGE"
  | "INITIAL_LATE_FEE"
  | "DAILY_LATE_FEE"
  | "PLATFORM_FEE";

type CheckoutPricingLineItem = {
  type: CheckoutPricingLineItemType;
  label: string;
  amountCents: number;
};

type CheckoutPreviewResponse = {
  business: {
    id: string;
    name: string;
    accountCode: string;
  };
  plan: {
    id: string;
    name: string;
  };
  paymentMethod: PaymentMethod;
  pricing: {
    billingCycle: string;
    dueDate: string;
    graceEndsAt: string;
    daysLateAfterGrace: number;
    dailyLateFeeDays: number;
    baseAmountCents: number;
    recurringChargesCents: number;
    initialLateFeeCents: number;
    dailyLateFeesCents: number;
    subtotalCents: number;
    platformFeeCents: number;
    totalChargedCents: number;
    lineItems: CheckoutPricingLineItem[];
  };
};

type CheckoutFormValues = {
  unitNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  paymentMethod: PaymentMethod;
};

type CheckoutStep = "FORM" | "REVIEW";

const INITIAL_FORM_VALUES: CheckoutFormValues = {
  unitNumber: "",
  firstName: "",
  lastName: "",
  phone: "",
  paymentMethod: "ACH",
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatBillingCycle(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (
    !Number.isInteger(year) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function formatPhoneInput(value: string): string {
  const digits = normalizePhoneDigits(value);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(
    3,
    6
  )}-${digits.slice(6)}`;
}

function getErrorMessage(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return "Unable to prepare the payment review.";
}

function getLineItemClassName(
  type: CheckoutPricingLineItemType
): string {
  if (type === "PLATFORM_FEE") {
    return "rfl-checkout-review-line is-platform-fee";
  }

  if (
    type === "INITIAL_LATE_FEE" ||
    type === "DAILY_LATE_FEE"
  ) {
    return "rfl-checkout-review-line is-late-fee";
  }

  if (type === "ONE_TIME_CHARGE") {
    return "rfl-checkout-review-line is-one-time-charge";
  }

  return "rfl-checkout-review-line";
}

export default function RecurringCheckoutClient({
  businessName,
  accountCode,
  plans,
}: RecurringCheckoutClientProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(
    plans.length === 1 ? plans[0].id : ""
  );

  const [formValues, setFormValues] =
    useState<CheckoutFormValues>(
      INITIAL_FORM_VALUES
    );

  const [step, setStep] =
    useState<CheckoutStep>("FORM");

  const [preview, setPreview] =
    useState<CheckoutPreviewResponse | null>(null);

  const [isLoadingPreview, setIsLoadingPreview] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [paymentMessage, setPaymentMessage] =
    useState("");

  const selectedPlan = useMemo(
    () =>
      plans.find(
        (plan) => plan.id === selectedPlanId
      ) ?? null,
    [plans, selectedPlanId]
  );

  const displaySubtotalCents = useMemo(() => {
    if (!selectedPlan) {
      return 0;
    }

    return (
      selectedPlan.baseAmountCents +
      selectedPlan.charges.reduce(
        (total, charge) =>
          total + charge.amountCents,
        0
      )
    );
  }, [selectedPlan]);

  const phoneDigits = useMemo(
    () =>
      normalizePhoneDigits(
        formValues.phone
      ),
    [formValues.phone]
  );

  const isFormValid =
    Boolean(selectedPlanId) &&
    Boolean(formValues.unitNumber.trim()) &&
    Boolean(formValues.firstName.trim()) &&
    Boolean(formValues.lastName.trim()) &&
    phoneDigits.length === 10;

  function updateFormValue<
    Key extends keyof CheckoutFormValues
  >(
    key: Key,
    value: CheckoutFormValues[Key]
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));

    setErrorMessage("");
    setPaymentMessage("");
  }

  function handlePlanSelection(planId: string) {
    setSelectedPlanId(planId);
    setPreview(null);
    setErrorMessage("");
    setPaymentMessage("");
  }

  async function handleReviewPayment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!selectedPlanId) {
      setErrorMessage(
        "Select a payment option."
      );
      return;
    }

    if (!formValues.unitNumber.trim()) {
      setErrorMessage(
        "Enter the unit or space number."
      );
      return;
    }

    if (!formValues.firstName.trim()) {
      setErrorMessage(
        "Enter the payer's first name."
      );
      return;
    }

    if (!formValues.lastName.trim()) {
      setErrorMessage(
        "Enter the payer's last name."
      );
      return;
    }

    if (phoneDigits.length !== 10) {
      setErrorMessage(
        "Enter a valid 10-digit mobile phone number."
      );
      return;
    }

    setIsLoadingPreview(true);
    setErrorMessage("");
    setPaymentMessage("");

    try {
      const response = await fetch(
        "/api/public/checkout/preview",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountCode,
            planId: selectedPlanId,
            paymentMethod:
              formValues.paymentMethod,
            unitNumber:
              formValues.unitNumber.trim(),
          }),
        }
      );

      const responseBody: unknown =
        await response.json().catch(
          () => null
        );

      if (!response.ok) {
        throw new Error(
          getErrorMessage(responseBody)
        );
      }

      const nextPreview =
        responseBody as CheckoutPreviewResponse;

      if (
        !nextPreview?.pricing ||
        !Array.isArray(
          nextPreview.pricing.lineItems
        )
      ) {
        throw new Error(
          "The payment preview response was incomplete."
        );
      }

      setPreview(nextPreview);
      setStep("REVIEW");
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to prepare the payment review."
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }

  function handleBackToForm() {
    setStep("FORM");
    setErrorMessage("");
    setPaymentMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleContinueToPayment() {
    setPaymentMessage(
      "Payment processing has not been connected yet. The review flow is working and ready for the Stripe integration step."
    );
  }

  if (plans.length === 0) {
    return (
      <div className="rfl-public-checkout">
        <header className="rfl-public-checkout-header">
          <p className="rfl-eyebrow">
            Customer checkout
          </p>

          <h1>{businessName}</h1>

          <p>
            Account code:{" "}
            <strong>{accountCode}</strong>
          </p>
        </header>

        <section className="rfl-public-checkout-section">
          <h2>Payments unavailable</h2>

          <p>
            This business has not configured
            any payment options yet.
          </p>
        </section>
      </div>
    );
  }

  if (step === "REVIEW" && preview) {
  const baseItems = preview.pricing.lineItems.filter(
    (item) => item.type === "BASE_AMOUNT"
  );

  const recurringItems = preview.pricing.lineItems.filter(
    (item) => item.type === "RECURRING_CHARGE"
  );

  const oneTimeItems = preview.pricing.lineItems.filter(
    (item) => item.type === "ONE_TIME_CHARGE"
  );

  const lateFeeItems = preview.pricing.lineItems.filter(
    (item) =>
      item.type === "INITIAL_LATE_FEE" ||
      item.type === "DAILY_LATE_FEE"
  );

  const platformFeeItems = preview.pricing.lineItems.filter(
    (item) => item.type === "PLATFORM_FEE"
  );

  function renderReviewGroup(
    title: string,
    items: CheckoutPricingLineItem[],
    description?: string
  ) {
    if (items.length === 0) {
      return null;
    }

    return (
      <div className="rfl-review-group">
        <div className="rfl-review-group-heading">
          <h3>{title}</h3>

          {description ? (
            <p>{description}</p>
          ) : null}
        </div>

        <div className="rfl-review-group-lines">
          {items.map((item, index) => (
            <div
              key={`${item.type}-${item.label}-${index}`}
              className="rfl-review-money-row"
            >
              <span>{item.label}</span>

              <strong>
                {formatMoney(item.amountCents)}
              </strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rfl-public-checkout">
      <header className="rfl-public-checkout-header">
        <p className="rfl-eyebrow">
          Review payment
        </p>

        <h1>{preview.business.name}</h1>

        <p>
          Account code:{" "}
          <strong>
            {preview.business.accountCode}
          </strong>
        </p>
      </header>

      <section className="rfl-public-checkout-section">
        <div className="rfl-review-section-heading">
          <h2>Payment details</h2>

          <p>
            Review everything below before continuing.
          </p>
        </div>

        <div className="rfl-review-details-grid">
          <div className="rfl-review-detail">
            <span>Payment option</span>
            <strong>{preview.plan.name}</strong>
          </div>

          <div className="rfl-review-detail">
            <span>Unit / space number</span>
            <strong>
              {formValues.unitNumber.trim()}
            </strong>
          </div>

          <div className="rfl-review-detail">
            <span>Payer</span>
            <strong>
              {formValues.firstName.trim()}{" "}
              {formValues.lastName.trim()}
            </strong>
          </div>

          <div className="rfl-review-detail">
            <span>Mobile phone</span>
            <strong>
              {formatPhoneInput(phoneDigits)}
            </strong>
          </div>

          <div className="rfl-review-detail">
            <span>Payment method</span>
            <strong>
              {preview.paymentMethod === "ACH"
                ? "Bank account"
                : "Credit or debit card"}
            </strong>
          </div>

          <div className="rfl-review-detail">
            <span>Billing cycle</span>
            <strong>
              {formatBillingCycle(
                preview.pricing.billingCycle
              )}
            </strong>
          </div>
        </div>
      </section>

      <section className="rfl-public-checkout-section">
        <div className="rfl-review-section-heading">
          <h2>Invoice</h2>
        </div>

        <div className="rfl-review-invoice">
  {renderReviewGroup(
    "Base payment",
    baseItems
  )}

  {renderReviewGroup(
    "Recurring charges",
    recurringItems
  )}

  {renderReviewGroup(
    "One-time charges",
    oneTimeItems,
    "These charges will not repeat next month."
  )}

  {renderReviewGroup(
    "Late fees",
    lateFeeItems
  )}
</div>

<div className="rfl-payment-summary-card">
  <h3>Amount due</h3>

  <div className="rfl-payment-summary-row">
    <span>Payment subtotal</span>

    <strong>
      {formatMoney(
        preview.pricing.subtotalCents
      )}
    </strong>
  </div>

  {platformFeeItems.map(
    (item, index) => (
      <div
        key={`${item.type}-${item.label}-${index}`}
        className="rfl-payment-summary-row"
      >
        <span>{item.label}</span>

        <strong>
          {formatMoney(item.amountCents)}
        </strong>
      </div>
    )
  )}

  <div className="rfl-payment-summary-total">
    <span>Total charged</span>

    <strong>
      {formatMoney(
        preview.pricing.totalChargedCents
      )}
    </strong>
  </div>
</div>
</section>

      <section className="rfl-public-checkout-section">
        <div className="rfl-review-section-heading">
          <h2>Billing information</h2>
        </div>

        <div className="rfl-review-dates-grid">
          <div className="rfl-review-date-card">
            <span>Due date</span>

            <strong>
              {formatDate(
                preview.pricing.dueDate
              )}
            </strong>
          </div>

          <div className="rfl-review-date-card">
            <span>Grace period ends</span>

            <strong>
              {formatDate(
                preview.pricing.graceEndsAt
              )}
            </strong>
          </div>

          {preview.pricing.daysLateAfterGrace >
          0 ? (
            <div className="rfl-review-date-card">
              <span>Days after grace</span>

              <strong>
                {
                  preview.pricing
                    .daysLateAfterGrace
                }
              </strong>
            </div>
          ) : null}

          {preview.pricing.dailyLateFeeDays >
          0 ? (
            <div className="rfl-review-date-card">
              <span>Daily late-fee days</span>

              <strong>
                {
                  preview.pricing
                    .dailyLateFeeDays
                }
              </strong>
            </div>
          ) : null}
        </div>
      </section>

      {errorMessage ? (
        <div
          className="rfl-checkout-error"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {paymentMessage ? (
        <div
          className="rfl-checkout-payment-message"
          role="status"
        >
          {paymentMessage}
        </div>
      ) : null}

<div className="rfl-review-actions">
  <button
    type="button"
    className="rfl-primary-button"
    onClick={handleContinueToPayment}
  >
    Continue to Payment
  </button>

  <button
    type="button"
    className="rfl-secondary-button"
    onClick={handleBackToForm}
  >
    Back
  </button>
</div>
    </div>
  );
}

  return (
    <div className="rfl-public-checkout">
      <header className="rfl-public-checkout-header">
        <p className="rfl-eyebrow">
          Customer checkout
        </p>

        <h1>{businessName}</h1>

        <p>
          Account code:{" "}
          <strong>{accountCode}</strong>
        </p>
      </header>

      <section className="rfl-public-checkout-section">
        <h2>Select a payment option</h2>

        <div className="rfl-checkout-plan-grid">
          {plans.map((plan) => {
            const planTotalCents =
              plan.baseAmountCents +
              plan.charges.reduce(
                (total, charge) =>
                  total +
                  charge.amountCents,
                0
              );

            const isSelected =
              selectedPlanId === plan.id;

            return (
              <button
                key={plan.id}
                type="button"
                className={`rfl-checkout-plan-card${
                  isSelected
                    ? " is-selected"
                    : ""
                }`}
                onClick={() =>
                  handlePlanSelection(plan.id)
                }
                aria-pressed={isSelected}
              >
                <span className="rfl-checkout-plan-name">
                  {plan.name}
                </span>

                <span className="rfl-checkout-plan-total">
                  {formatMoney(
                    planTotalCents
                  )}
                </span>

                <span className="rfl-checkout-plan-due">
                  Due on day {plan.dueDay}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedPlan ? (
        <section className="rfl-public-checkout-section">
          <h2>Customer information</h2>
            
          <form
            className="rfl-checkout-form"
            onSubmit={handleReviewPayment}
          >
            <div className="rfl-checkout-field">
              <label htmlFor="referenceLabel">
                Unit / space number
              </label>

              <input
                id="referenceLabel"
                name="referenceLabel"
                type="text"
                autoComplete="off"
                value={
                  formValues.unitNumber
                }
                onChange={(event) =>
                  updateFormValue(
                    "unitNumber",
                    event.target.value
                  )
                }
                required
              />
            </div>

            <div className="rfl-checkout-field-row">
              <div className="rfl-checkout-field">
                <label htmlFor="payerFirstName">
                  First name
                </label>

                <input
                  id="payerFirstName"
                  name="payerFirstName"
                  type="text"
                  autoComplete="given-name"
                  value={
                    formValues.firstName
                  }
                  onChange={(event) =>
                    updateFormValue(
                      "firstName",
                      event.target.value
                    )
                  }
                  required
                />
              </div>

              <div className="rfl-checkout-field">
                <label htmlFor="payerLastName">
                  Last name
                </label>

                <input
                  id="payerLastName"
                  name="payerLastName"
                  type="text"
                  autoComplete="family-name"
                  value={
                    formValues.lastName
                  }
                  onChange={(event) =>
                    updateFormValue(
                      "lastName",
                      event.target.value
                    )
                  }
                  required
                />
              </div>
            </div>

            <div className="rfl-checkout-field">
              <label htmlFor="payerPhone">
                Mobile phone
              </label>

              <input
                id="payerPhone"
                name="payerPhone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="(555) 555-5555"
                value={formValues.phone}
                onChange={(event) =>
                  updateFormValue(
                    "phone",
                    formatPhoneInput(
                      event.target.value
                    )
                  )
                }
                required
              />
            </div>

            <fieldset className="rfl-checkout-payment-method">
              <legend>Payment method</legend>

              <label>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="ACH"
                  checked={
                    formValues.paymentMethod ===
                    "ACH"
                  }
                  onChange={() =>
                    updateFormValue(
                      "paymentMethod",
                      "ACH"
                    )
                  }
                />

                <span>Bank account</span>
              </label>

              <label>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CARD"
                  checked={
                    formValues.paymentMethod ===
                    "CARD"
                  }
                  onChange={() =>
                    updateFormValue(
                      "paymentMethod",
                      "CARD"
                    )
                  }
                />

                <span>
                  Credit or debit card
                </span>
              </label>
            </fieldset>

            {errorMessage ? (
              <div
                className="rfl-checkout-error"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              className="rfl-primary-button"
              disabled={
                !isFormValid ||
                isLoadingPreview
              }
            >
              {isLoadingPreview
                ? "Preparing Review..."
                : "Review Payment"}
            </button>

            <p className="rfl-checkout-coming-soon">
              No payment will be submitted
              while reviewing.
            </p>
          </form>
        </section>
      ) : (
        <section className="rfl-public-checkout-section">
          <p>
            Select a payment option to
            continue.
          </p>
        </section>
      )}
    </div>
  );
}

