"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PostRentButton({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "posting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const disabled = status === "posting";

  async function onClick() {
    try {
      setStatus("posting");
      setMessage("");

      const res = await fetch("/api/ledger/post-rent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ unitId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Failed to post rent.");
        return;
      }

      setStatus("success");
      setMessage("Rent posted.");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Failed to post rent.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "posting" ? "Posting..." : "Post Rent"}
      </button>

      {message && (
        <div className={`text-xs ${status === "error" ? "text-red-600" : "text-green-600"}`}>
          {message}
        </div>
      )}
    </div>
  );
}