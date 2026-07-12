"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ManualChargeFormProps = {
  propertyId: string;
  unitId: string;
  tenantId?: string;
  defaultRent?: number;
};

type ChargeType = "RENT_CHARGE" | "LATE_FEE" | "OTHER_FEE";

function parseMoney(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded <= 0) return null;
  return rounded;
}

function getDefaultMemo(type: ChargeType): string {
  switch (type) {
    case "RENT_CHARGE":
      return "Rent charge";
    case "LATE_FEE":
      return "Late fee";
    case "OTHER_FEE":
      return "";
    default:
      return "";
  }
}

export default function ManualChargeForm({
  propertyId,
  unitId,
  tenantId,
  defaultRent,
}: ManualChargeFormProps) {
  const router = useRouter();

  const [type, setType] = useState<ChargeType>("RENT_CHARGE");
  const [amount, setAmount] = useState(
    typeof defaultRent === "number" && Number.isFinite(defaultRent)
      ? String(Math.round(defaultRent * 100) / 100)
      : ""
  );
  const [memo, setMemo] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const resolvedMemoPlaceholder = useMemo(() => {
    if (type === "RENT_CHARGE") return "March rent";
    if (type === "LATE_FEE") return "Late fee";
    return "Pet fee / utility charge / other fee";
  }, [type]);

  function handleTypeChange(nextType: ChargeType) {
    setType(nextType);
    setError("");
    setSuccess(false);

    if (nextType === "RENT_CHARGE") {
      if (
        typeof defaultRent === "number" &&
        Number.isFinite(defaultRent) &&
        defaultRent > 0
      ) {
        setAmount(String(Math.round(defaultRent * 100) / 100));
      }
      if (!memo.trim()) {
        setMemo(getDefaultMemo(nextType));
      }
      return;
    }

    if (nextType === "LATE_FEE") {
      if (!memo.trim() || memo.trim() === "Rent charge") {
        setMemo(getDefaultMemo(nextType));
      }
      return;
    }

    if (memo.trim() === "Rent charge" || memo.trim() === "Late fee") {
      setMemo("");
    }
  }

  async function submitCharge(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setSuccess(false);

    const parsedAmount = parseMoney(amount);
    if (!parsedAmount) {
      setError("Enter a valid charge amount greater than 0.");
      return;
    }

    if (!effectiveDate) {
      setError("Effective date is required.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/ledger/charges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          propertyId,
          unitId,
          tenantId: tenantId ?? undefined,
          type,
          amount: parsedAmount,
          memo: memo.trim() || undefined,
          effectiveDate,
        }),
      });

      let data: unknown = null;

      try {
        data = await res.json();
      } catch {
        // non-JSON response fallback
      }

      if (!res.ok) {
        const message =
          (data as { error?: string } | null)?.error ||
          "Failed to post charge.";
        setError(message);
        return;
      }

      setSuccess(true);

      if (type === "RENT_CHARGE") {
        setAmount(
          typeof defaultRent === "number" && Number.isFinite(defaultRent)
            ? String(Math.round(defaultRent * 100) / 100)
            : ""
        );
        setMemo("");
      } else {
        setAmount("");
        setMemo("");
      }

      setEffectiveDate(new Date().toISOString().slice(0, 10));
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submitCharge}
      className="space-y-3 rounded border p-4 bg-white"
    >
      <h2 className="font-semibold">Post Charge</h2>

      <div>
        <label className="mb-1 block text-sm">Type</label>
        <select
          className="w-full rounded border p-2"
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as ChargeType)}
          disabled={loading}
        >
          <option value="RENT_CHARGE">Rent Charge</option>
          <option value="LATE_FEE">Late Fee</option>
          <option value="OTHER_FEE">Other Fee</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm">Amount</label>
        <input
          className="w-full rounded border p-2"
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1000.00"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm">Effective Date</label>
        <input
          className="w-full rounded border p-2"
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm">Memo</label>
        <input
          className="w-full rounded border p-2"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={resolvedMemoPlaceholder}
          disabled={loading}
        />
      </div>

      <div className="text-xs text-slate-600">
  {(() => {
    const today = new Date().toISOString().slice(0, 10);

    if (effectiveDate > today) {
      return (
        <span className="text-blue-600">
          Will appear on next billing cycle statement.
        </span>
      );
    }

    return (
      <span className="text-amber-600">
        This will be due immediately and reflected in the current balance.
      </span>
    );
  })()}
</div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Posting..." : "Post Charge"}
      </button>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {success && (
  <div className="text-sm text-green-600">
    {(() => {
      const today = new Date().toISOString().slice(0, 10);

      if (effectiveDate > today) {
        return "Charge scheduled — will appear on next statement.";
      }

      return "Charge posted — now due and reflected in balance.";
    })()}
  </div>
)}
    </form>
  );
}