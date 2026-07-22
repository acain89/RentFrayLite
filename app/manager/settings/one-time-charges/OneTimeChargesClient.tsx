"use client";

import {
  FormEvent,
  useState,
} from "react";

type Charge = {
  id: string;
  unitNumber: string;
  label: string;
  amountCents: number;
  createdAt: string;
};

type Props = {
  initialCharges: Charge[];
};

type ApiResponse = {
  charge?: Charge;
  deleted?: boolean;
  error?: string;
};

function moneyToCents(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function OneTimeChargesClient({
  initialCharges,
}: Props) {
  const [charges, setCharges] =
    useState<Charge[]>(initialCharges);

  const [unitNumber, setUnitNumber] = useState("");
  const [chargeName, setChargeName] = useState("");
  const [amount, setAmount] = useState("");

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function addCharge(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const normalizedUnit = unitNumber
      .trim()
      .replace(/\s+/g, " ");

    const normalizedName = chargeName
      .trim()
      .replace(/\s+/g, " ");

    const amountCents = moneyToCents(amount);

    if (!normalizedUnit) {
      setError("Enter a unit number.");
      return;
    }

    if (!normalizedName) {
      setError("Enter a charge name.");
      return;
    }

    if (amountCents === null) {
      setError("Enter a valid amount.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/manager/one-time-charges",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            unitNumber: normalizedUnit,
            chargeName: normalizedName,
            amountCents,
          }),
        },
      );

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.charge) {
        setError(
          data.error ?? "Unable to add the charge.",
        );
        return;
      }

      setCharges((current) => [
        data.charge as Charge,
        ...current,
      ]);

      setUnitNumber("");
      setChargeName("");
      setAmount("");

      setSuccess(
        `Charge added to unit ${data.charge.unitNumber}.`,
      );
    } catch {
      setError(
        "Unable to connect. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCharge(
    charge: Charge,
  ): Promise<void> {
    const confirmed = window.confirm(
      `Delete "${charge.label}" from unit ${charge.unitNumber}?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(charge.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/manager/one-time-charges",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chargeId: charge.id,
          }),
        },
      );

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.deleted) {
        setError(
          data.error ?? "Unable to delete the charge.",
        );
        return;
      }

      setCharges((current) =>
        current.filter(
          (candidate) => candidate.id !== charge.id,
        ),
      );

      setSuccess(
        `Charge removed from unit ${charge.unitNumber}.`,
      );
    } catch {
      setError(
        "Unable to connect. Please try again.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="rfl-settings-editor-card">
        <form
          className="rfl-one-time-charge-form"
          onSubmit={addCharge}
        >
          <label className="rfl-field">
            <span>Unit Number</span>

            <input
              type="text"
              name="unitNumber"
              autoComplete="off"
              placeholder="Example: 204"
              value={unitNumber}
              maxLength={100}
              onChange={(event) => {
                setUnitNumber(event.target.value);
                setError("");
                setSuccess("");
              }}
            />
          </label>

          <label className="rfl-field">
            <span>Charge Name</span>

            <input
              type="text"
              name="chargeName"
              autoComplete="off"
              placeholder="Example: Damaged blinds"
              value={chargeName}
              maxLength={120}
              onChange={(event) => {
                setChargeName(event.target.value);
                setError("");
                setSuccess("");
              }}
            />
          </label>

          <label className="rfl-field">
            <span>Amount</span>

            <div className="rfl-money-input">
              <span
                className="rfl-money-prefix"
                aria-hidden="true"
              >
                $
              </span>

              <input
                type="text"
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError("");
                  setSuccess("");
                }}
              />
            </div>
          </label>

          <button
            className="rfl-primary-button"
            type="submit"
            disabled={saving}
          >
            {saving ? "Adding..." : "Add Charge"}
          </button>
        </form>

        {error ? (
          <p
            className="rfl-error mt-4"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {success ? (
          <p
            className="rfl-save-status rfl-save-status-saved mt-4"
            role="status"
          >
            <span aria-hidden="true">✓</span>
            {success}
          </p>
        ) : null}
      </section>

      <section className="rfl-settings-editor-card mt-5">
        <header className="mb-4">
          <h2 className="m-0 text-xl font-semibold">
            Unpaid One-Time Charges
          </h2>

          <p className="mb-0 mt-2 text-sm text-slate-600">
            These charges will appear the next time the
            matching unit makes a payment.
          </p>
        </header>

        {charges.length === 0 ? (
          <p className="m-0 text-sm text-slate-600">
            There are no unpaid one-time charges.
          </p>
        ) : (
          <div className="grid gap-3">
            {charges.map((charge) => (
              <article
                key={charge.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="m-0 font-semibold">
                    Unit {charge.unitNumber}
                  </p>

                  <p className="mb-0 mt-1 text-sm text-slate-600">
                    {charge.label}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <strong>
                    {formatMoney(charge.amountCents)}
                  </strong>

                  <button
                    className="rfl-danger-button"
                    type="button"
                    disabled={deletingId === charge.id}
                    onClick={() => {
                      void deleteCharge(charge);
                    }}
                  >
                    {deletingId === charge.id
                      ? "Deleting..."
                      : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}