"use client";

import { useMemo, useState } from "react";

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

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function RecurringCheckoutClient({
  businessName,
  accountCode,
  plans,
}: RecurringCheckoutClientProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(
    plans.length === 1 ? plans[0].id : ""
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const subtotalCents = useMemo(() => {
    if (!selectedPlan) {
      return 0;
    }

    return (
      selectedPlan.baseAmountCents +
      selectedPlan.charges.reduce(
        (total, charge) => total + charge.amountCents,
        0
      )
    );
  }, [selectedPlan]);

  return (
    <div className="rfl-public-checkout">
      <header className="rfl-public-checkout-header">
        <p className="rfl-eyebrow">Customer checkout</p>
        <h1>{businessName}</h1>
        <p>
          Account code: <strong>{accountCode}</strong>
        </p>
      </header>

      <section className="rfl-public-checkout-section">
        <h2>Select a payment option</h2>

        <div className="rfl-checkout-plan-grid">
          {plans.map((plan) => {
            const planTotalCents =
              plan.baseAmountCents +
              plan.charges.reduce(
                (total, charge) => total + charge.amountCents,
                0
              );

            const isSelected = selectedPlanId === plan.id;

            return (
              <button
                key={plan.id}
                type="button"
                className={`rfl-checkout-plan-card${
                  isSelected ? " is-selected" : ""
                }`}
                onClick={() => setSelectedPlanId(plan.id)}
                aria-pressed={isSelected}
              >
                <span className="rfl-checkout-plan-name">
                  {plan.name}
                </span>

                <span className="rfl-checkout-plan-total">
                  {formatMoney(planTotalCents)}
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
          <h2>Payment details</h2>

          <div className="rfl-checkout-summary">
            <div>
              <span>{selectedPlan.name}</span>
              <strong>
                {formatMoney(selectedPlan.baseAmountCents)}
              </strong>
            </div>

            {selectedPlan.charges.map((charge) => (
              <div key={charge.id}>
                <span>{charge.label}</span>
                <strong>{formatMoney(charge.amountCents)}</strong>
              </div>
            ))}

            <div className="rfl-checkout-summary-total">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotalCents)}</strong>
            </div>
          </div>

          <form className="rfl-checkout-form">
            <div className="rfl-checkout-field">
              <label htmlFor="referenceLabel">
                Unit / space number
              </label>
              <input
                id="referenceLabel"
                name="referenceLabel"
                type="text"
                autoComplete="off"
                required
              />
            </div>

            <div className="rfl-checkout-field-row">
              <div className="rfl-checkout-field">
                <label htmlFor="payerFirstName">First name</label>
                <input
                  id="payerFirstName"
                  name="payerFirstName"
                  type="text"
                  autoComplete="given-name"
                  required
                />
              </div>

              <div className="rfl-checkout-field">
                <label htmlFor="payerLastName">Last name</label>
                <input
                  id="payerLastName"
                  name="payerLastName"
                  type="text"
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>

            <div className="rfl-checkout-field">
              <label htmlFor="payerPhone">Mobile phone</label>
              <input
                id="payerPhone"
                name="payerPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
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
                  defaultChecked
                />
                <span>Bank account</span>
              </label>

              <label>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CARD"
                />
                <span>Credit or debit card</span>
              </label>
            </fieldset>

            <button
              type="submit"
              className="rfl-primary-button"
              disabled
            >
              Review payment
            </button>

            <p className="rfl-checkout-coming-soon">
              Payment processing will be connected in the next step.
            </p>
          </form>
        </section>
      ) : (
        <section className="rfl-public-checkout-section">
          <p>Select a payment option to continue.</p>
        </section>
      )}
    </div>
  );
}