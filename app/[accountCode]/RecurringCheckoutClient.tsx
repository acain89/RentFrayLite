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

type CheckoutFormValues = {
  unitNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  paymentMethod: PaymentMethod;
};

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

export default function RecurringCheckoutClient({
  businessName,
  accountCode,
  plans,
}: RecurringCheckoutClientProps) {
  const [selectedPlanId, setSelectedPlanId] =
    useState(
      plans.length === 1 ? plans[0].id : ""
    );

  const [formValues, setFormValues] =
    useState<CheckoutFormValues>(
      INITIAL_FORM_VALUES
    );

  const [isPreparingReview, setIsPreparingReview] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const selectedPlan = useMemo(
    () =>
      plans.find(
        (plan) => plan.id === selectedPlanId
      ) ?? null,
    [plans, selectedPlanId]
  );

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
  ): void {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));

    setErrorMessage("");
  }

  function handlePlanSelection(
    planId: string
  ): void {
    setSelectedPlanId(planId);
    setErrorMessage("");
  }

  async function handleReviewPayment(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    if (isPreparingReview) {
      return;
    }

    if (!selectedPlanId) {
      setErrorMessage(
        "Select a payment option."
      );
      return;
    }

    const unitNumber =
      formValues.unitNumber.trim();

    const firstName =
      formValues.firstName.trim();

    const lastName =
      formValues.lastName.trim();

    if (!unitNumber) {
      setErrorMessage(
        "Enter the unit or space number."
      );
      return;
    }

    if (!firstName) {
      setErrorMessage(
        "Enter the payer's first name."
      );
      return;
    }

    if (!lastName) {
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

    setIsPreparingReview(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/public/checkout/session",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            accountCode,
            planId: selectedPlanId,
            unitNumber,
            firstName,
            lastName,
            phone: phoneDigits,
            paymentMethod:
              formValues.paymentMethod,
          }),
        }
      );

      const responseBody: unknown =
        await response
          .json()
          .catch(() => null);

      if (
        !response.ok ||
        typeof responseBody !== "object" ||
        responseBody === null ||
        !("reviewUrl" in responseBody) ||
        typeof responseBody.reviewUrl !==
          "string"
      ) {
        throw new Error(
          getErrorMessage(responseBody)
        );
      }

      window.location.assign(
        responseBody.reviewUrl
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to prepare the payment review."
      );

      setIsPreparingReview(false);
    }
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
                  handlePlanSelection(
                    plan.id
                  )
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
              <legend>
                Payment method
              </legend>

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
                isPreparingReview
              }
            >
              {isPreparingReview
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