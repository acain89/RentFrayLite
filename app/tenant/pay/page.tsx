"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type BalanceData = {
  propertyName?: string;
  unitNumber?: string;
  balance?: number;
  ledgerSummary?: {
    balance?: number;
  };
  summary?: {
    balance?: number;
  };
  property?: {
    settings?: {
      convenienceFee?: number;
    };
  };
};

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function TenantPayPage() {
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<BalanceData | null>(null);
  const checkoutStatus = searchParams.get("checkout");
  const isSuccess = checkoutStatus === "success";
  const isCancelled = checkoutStatus === "cancelled";


  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/tenant/balance", {
          cache: "no-store",
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json?.error || "Failed to load payment page.");
          return;
        }

        setData(json);

        // 🔒 IMPORTANT: DO NOT TRUST URL PARAMS
        // Always show neutral or safe messaging
        if (isSuccess) {
  setMessage("Payment submitted. Awaiting bank processing.");
} else if (!isCancelled) {
  setMessage(
    "If you completed a payment, it will appear here once it begins processing."
  );
}
      } catch {
        setError("Failed to load payment page.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [isSuccess, isCancelled]);

  const baseAmountDue = useMemo(() => {
    if (!data) return 0;

    const candidates = [
      data.balance,
      data.summary?.balance,
      data.ledgerSummary?.balance,
    ];

    const found = candidates.find((value) => Number.isFinite(Number(value)));
    return Math.max(0, Number(found || 0));
  }, [data]);

  const convenienceFee = useMemo(() => {
    return Math.max(0, Number(data?.property?.settings?.convenienceFee || 0));
  }, [data]);

  const totalAmountDue = useMemo(() => {
    return Number((baseAmountDue + convenienceFee).toFixed(2));
  }, [baseAmountDue, convenienceFee]);

  async function handlePayNow() {
    if (paying) return;

    try {
      setPaying(true);
      setError("");
      setMessage("");

      const res = await fetch("/api/payments/create-session", {
        method: "POST",
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Failed to start payment.");
        return;
      }

      if (json?.preview) {
        setMessage(
          json?.message || "Payment preview only. No live session created."
        );
        return;
      }

      if (json?.data?.url) {
        window.location.href = json.data.url;
        return;
      }

      setError("No checkout session returned.");
    } catch {
      setError("Failed to start payment.");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pay Now</h1>
        <p className="text-sm text-neutral-600 mt-1">
          {data?.propertyName || "Property"}
          {data?.unitNumber ? ` — Unit ${data.unitNumber}` : ""}
        </p>
      </div>

      {isSuccess && (
  <div className="border rounded-xl p-4 bg-white text-sm text-green-600">
    Payment submitted. Bank processing has started. This may take a few business days.
  </div>
)}

{isSuccess && (
  <button
    onClick={() => (window.location.href = "/tenant/dashboard")}
    className="mt-3 px-4 py-2 rounded-lg bg-green-600 text-white"
  >
    Return to Dashboard
  </button>
)}

{isCancelled && (
  <div className="border rounded-xl p-4 bg-white text-sm text-neutral-700">
    Checkout cancelled. You can try again below.
  </div>
)}

      {error ? (
        <div className="border rounded-xl p-4 bg-white text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="border rounded-xl p-4 bg-white text-sm text-neutral-700">
          {message}
        </div>
      ) : null}

      <div className="border rounded-xl p-4 bg-white space-y-4">
        <div className="text-sm text-neutral-600">Payment summary</div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Balance due</span>
            <span>{money(baseAmountDue)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span>Convenience fee</span>
            <span>{money(convenienceFee)}</span>
          </div>

          <div className="border-t pt-2 flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span>{money(totalAmountDue)}</span>
          </div>
        </div>

        <div className="text-sm text-neutral-600">
          Electronic payment only.
        </div>

       {!isSuccess && (
  <button
    type="button"
    onClick={handlePayNow}
    disabled={paying || totalAmountDue <= 0}
    className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60"
  >
    {paying ? "Starting..." : "Pay Now"}
  </button>
)}
      </div>
    </div>
  );
}