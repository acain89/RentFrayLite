"use client";

import { useMemo, useState, useEffect } from "react";

type AdjustType = "PRORATION" | "CHARGE" | "CREDIT";

type Props = {
  unitId: string;
  propertyId?: string;
  tierId?: string;
  onClose: () => void;
  onSuccess: () => void;
};

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toMoney(value: number): string {
  return `$${roundMoney(value).toFixed(2)}`;
}

function toInputDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBillableDays(moveInDateValue: string): number {
  if (!moveInDateValue) return 0;

  const moveInDate = new Date(`${moveInDateValue}T12:00:00`);
  if (Number.isNaN(moveInDate.getTime())) return 0;

  const moveInDay = moveInDate.getDate();
  return Math.max(0, 30 - moveInDay + 1);
}

export default function AdjustBalanceForm({
  unitId,
  propertyId,
  tierId,
  onClose,
  onSuccess,
}: Props) {
  const [type, setType] = useState<AdjustType>("CHARGE");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);

  const [moveInDate, setMoveInDate] = useState(toInputDateValue(new Date()));
  const [baseRent, setBaseRent] = useState("");
  const [recurringCharges, setRecurringCharges] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  useEffect(() => {
  async function loadTierData() {
    if (!propertyId || !tierId) return;
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/charges`
      );
      const json = await res.json();

      if (!json?.tiers) return;

      const tier = json.tiers.find((t: any) => t.tierId === tierId);
      if (!tier) return;

      const recurringTotal = tier.charges.reduce(
        (sum: number, c: any) => sum + Number(c.amount || 0),
        0
      );

      setRecurringCharges(recurringTotal.toFixed(2));
    } catch {
      // silent fail
    }
  }

  loadTierData();
}, [propertyId, tierId]);

  const billableDays = useMemo(() => getBillableDays(moveInDate), [moveInDate]);

  const prorationPreview = useMemo(() => {
    const baseRentValue = Number(baseRent) || 0;
    const recurringValue = Number(recurringCharges) || 0;
    const depositValue = Number(depositAmount) || 0;

    const rentDailyRate = baseRentValue / 30;
    const recurringDailyRate = recurringValue / 30;

    const proratedRent = roundMoney(rentDailyRate * billableDays);
    const proratedRecurring = roundMoney(recurringDailyRate * billableDays);
    const totalDueNow = roundMoney(
      proratedRent + proratedRecurring + depositValue
    );

    return {
      rentDailyRate: roundMoney(rentDailyRate),
      recurringDailyRate: roundMoney(recurringDailyRate),
      proratedRent,
      proratedRecurring,
      depositValue: roundMoney(depositValue),
      totalDueNow,
    };
  }, [baseRent, recurringCharges, depositAmount, billableDays]);

  async function submit(): Promise<void> {
    try {
      setLoading(true);

      if (type === "PRORATION") {
        if (!moveInDate) {
          alert("Select a move-in date.");
          return;
        }

        const rentCents = Math.round(prorationPreview.proratedRent * 100);
        const recurringCents = Math.round(
          prorationPreview.proratedRecurring * 100
        );
        const depositCents = Math.round(prorationPreview.depositValue * 100);

        if (rentCents <= 0 && recurringCents <= 0 && depositCents <= 0) {
          alert("Enter rent, recurring charges, or a deposit.");
          return;
        }

       const res = await fetch("/api/ledger/adjust", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  credentials: "include",
  body: JSON.stringify({
            unitId,
            type,
            moveInDate,
            rentCents,
            recurringCents,
            depositCents,
            memo: memo.trim(),
           }),
          });

       
        const json: { ok?: boolean; error?: string } = await res.json();

        if (!res.ok || !json.ok) {
          alert(json.error || "Failed to save proration.");
          return;
        }

        onSuccess();
        return;
      }

      const parsedAmount = Number(amount);

      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        alert("Enter a valid amount greater than 0.");
        return;
      }

   const res = await fetch("/api/ledger/adjust", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  credentials: "include",
  body: JSON.stringify({
     unitId,
          type,
          amount: roundMoney(parsedAmount),
          memo: memo.trim(),
        }),
      });

      const json: { ok?: boolean; error?: string } = await res.json();

      if (!res.ok || !json.ok) {
        alert(json.error || "Failed to adjust balance.");
        return;
      }

      onSuccess();
    } catch {
      alert(
        type === "PRORATION"
          ? "Failed to save proration."
          : "Failed to adjust balance."
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedButtonClass =
    "border-slate-900 bg-slate-900 text-white shadow-sm";
  const unselectedButtonClass =
    "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setType("CHARGE")}
          disabled={loading}
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
            type === "CHARGE" ? selectedButtonClass : unselectedButtonClass
          }`}
        >
          One-Time Charge
        </button>

        <button
          type="button"
          onClick={() => setType("PRORATION")}
          disabled={loading}
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
            type === "PRORATION" ? selectedButtonClass : unselectedButtonClass
          }`}
        >
          Prorate Move-In
        </button>

        <button
          type="button"
          onClick={() => setType("CREDIT")}
          disabled={loading}
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
            type === "CREDIT" ? selectedButtonClass : unselectedButtonClass
          }`}
        >
          Credit
        </button>
      </div>

      {type === "PRORATION" ? (
        <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div>
            <div className="text-sm font-semibold text-slate-950">
              Prorate Move-In
            </div>
             <div className="mt-1 text-xs text-slate-500">
             Use this calculator to determine move-in charges.
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              Uses a 30-day month:
              <span className="font-semibold text-slate-900">
                {" "}
                ((rent + recurring charges) / 30) × billable days + deposits
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Move-In Date
              </label>
              <input
                type="date"
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Billable Days
              </label>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                {billableDays}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Base Rent
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={baseRent}
                onChange={(e) => setBaseRent(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Recurring Charges
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={recurringCharges}
                onChange={(e) => setRecurringCharges(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Deposits / Move-In Fees
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
            </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Rent Daily Rate
              </div>
              <div className="mt-2 text-base font-semibold text-slate-950">
                {toMoney(prorationPreview.rentDailyRate)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Prorated Rent
              </div>
              <div className="mt-2 text-base font-semibold text-slate-950">
                {toMoney(prorationPreview.proratedRent)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Prorated Charges
              </div>
              <div className="mt-2 text-base font-semibold text-slate-950">
                {toMoney(prorationPreview.proratedRecurring)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-900 bg-slate-900 p-3 text-white">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                Due Now
              </div>
              <div className="mt-2 text-base font-semibold">
                {toMoney(prorationPreview.totalDueNow)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
            <div>
              Prorated rent:
              <span className="ml-2 font-semibold text-slate-950">
                {toMoney(prorationPreview.proratedRent)}
              </span>
            </div>
            <div>
              Prorated recurring charges:
              <span className="ml-2 font-semibold text-slate-950">
                {toMoney(prorationPreview.proratedRecurring)}
              </span>
            </div>
            <div>
              Deposits / move-in fees:
              <span className="ml-2 font-semibold text-slate-950">
                {toMoney(prorationPreview.depositValue)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div>
            <div className="text-sm font-semibold text-slate-950">
              {type === "CHARGE" ? "One-Time Charge" : "Credit"}
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-600">
              {type === "CHARGE"
                ? "Add a one-time charge to this unit."
                : "Apply a credit to reduce the current balance."}
            </div>
          </div>

          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />

          <input
            type="text"
            placeholder="Memo (optional)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </div>
      )}

      {type === "PRORATION" ? (
  <div className="flex">
    <button
      type="button"
      onClick={onClose}
      disabled={loading}
      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
    >
      Close
    </button>
  </div>
) : (
  <div className="flex gap-3">
    <button
      type="button"
      onClick={onClose}
      disabled={loading}
      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
    >
      Cancel
    </button>

    <button
      type="button"
      onClick={submit}
      disabled={loading}
      className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
    >
      {loading ? "Applying..." : "Apply"}
    </button>
  </div>
)}
    </div>
  );
}