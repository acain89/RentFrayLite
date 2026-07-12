"use client";

import { useState } from "react";

type PayNowButtonProps = {
  unitId: string;
  amount: number;
  disabled?: boolean;
  disabledReason?: string;
};

export default function PayNowButton({
  unitId,
  amount,
  disabled = false,
  disabledReason = "Payment is not available right now.",
}: PayNowButtonProps) {
  const [loading, setLoading] = useState(false);

  const amountCents = Math.max(0, Math.round(Number(amount) * 100));
  const isDisabled = disabled || loading || amountCents <= 0;

  async function handlePay() {
    if (isDisabled) {
      if (disabled) alert(disabledReason);
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/payments/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ unitId }),
      });

      const data: {
        ok?: boolean;
        data?: { url?: string };
        error?: string;
      } = await res.json().catch(() => ({
        ok: false,
        error: "Payment could not be started.",
      }));

      if (res.status === 401 || res.status === 403) {
        window.location.href = "/property-code";
        return;
      }

      if (data.ok === true && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }

      alert(data.error || "Payment could not be started.");
    } catch {
      alert("Payment could not be started.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      title={isDisabled ? disabledReason : "Verify your bank and pay"}
      className="rounded bg-green-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading
        ? "Opening secure payment..."
        : disabled
        ? "Payment unavailable"
        : "Verify Bank & Pay"}
    </button>
  );
}