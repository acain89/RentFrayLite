"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ManualPaymentFormProps = {
  propertyId: string;
  unitId: string;
  tenantId?: string;
};

function parseMoney(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded <= 0) return null;
  return rounded;
}

export default function ManualPaymentForm({
  propertyId,
  unitId,
  tenantId,
}: ManualPaymentFormProps) {
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remainingCredit, setRemainingCredit] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setError("");
    setRemainingCredit(null);
    setSuccess(false);

    const parsedAmount = parseMoney(amount);

    if (!parsedAmount) {
      setError("Enter a valid payment amount greater than 0.");
      return;
    }

    if (!effectiveDate) {
      setError("Effective date is required.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/manual-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          propertyId,
          unitId,
          tenantId: tenantId ?? undefined,
          amount: parsedAmount,
          memo: memo.trim() || undefined,
          effectiveDate,
        }),
      });

      let data: unknown = null;

      try {
        data = await res.json();
      } catch {
        // fallback if server doesn't return JSON
      }

      if (!res.ok) {
        const message =
          (data as { error?: string } | null)?.error ||
          "Failed to post payment.";
        setError(message);
        return;
      }

      const remaining =
        (data as { remaining?: number } | null)?.remaining ?? 0;

      setRemainingCredit(remaining > 0 ? remaining : null);
      setSuccess(true);

      // reset form
      setAmount("");
      setMemo("");
      setEffectiveDate(new Date().toISOString().slice(0, 10));

      // refresh server data
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded border p-4 bg-white"
    >
      <h2 className="font-semibold">Manual Payment</h2>

      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Amount"
        className="w-full rounded border p-2"
        required
      />

      <input
        value={effectiveDate}
        onChange={(e) => setEffectiveDate(e.target.value)}
        type="date"
        className="w-full rounded border p-2"
        required
      />

      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="Memo (optional)"
        className="w-full rounded border p-2"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {loading ? "Posting..." : "Post Payment"}
      </button>

      {/* ERROR */}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* SUCCESS */}
      {success && (
        <div className="text-sm text-green-600">
          Payment successfully posted.
        </div>
      )}

      {/* CREDIT */}
      {remainingCredit !== null && remainingCredit > 0 && (
        <div className="text-xs text-yellow-600">
          Overpayment credit: ${remainingCredit.toFixed(2)}
        </div>
      )}
    </form>
  );
}