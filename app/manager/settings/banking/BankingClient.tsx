"use client";
import { useState } from "react";
import Link from "next/link";

export default function BankingClient({ businessName, accountCode }: { businessName: string; accountCode: string }) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  async function openStripe() {
    if (busy) return;
    setBusy(true);setError("");
    try {
      const response = await fetch("/api/manager/banking", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data: { url?: string; error?: string } = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error ?? "Unable to open Stripe.");
      const target = new URL(data.url);
      if (target.protocol !== "https:" || !["connect.stripe.com","dashboard.stripe.com"].includes(target.hostname) || target.username || target.password || target.port) throw new Error("Unable to open Stripe.");
      window.location.assign(target.href);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to open Stripe.");setBusy(false); }
  }
  return <main className="rfl-banking-page"><section className="rfl-banking-card">
    <Link className="rfl-banking-back" href="/manager/settings">← Back to Manage</Link>
    <p className="rfl-eyebrow">Secure account management</p><h1>Banking &amp; payouts</h1>
    <p className="rfl-banking-business">{businessName} <strong>{accountCode}</strong></p>
    <p>Update the bank account where you receive payouts, review payout details, or update your business information securely with Stripe.</p>
    <ol><li>Open your Stripe account below.</li><li>Go to your bank account or payout settings.</li><li>Follow Stripe’s steps to verify and save your changes.</li></ol>
    <p className="rfl-banking-note">Stripe may ask you to verify your identity. If you use multiple Stripe accounts, check that you’re managing the business shown above. RFL does not collect your bank login credentials.</p>
    <button className="rfl-primary-button" type="button" disabled={busy} onClick={openStripe}>{busy ? "Opening Stripe…" : "Manage banking in Stripe ↗"}</button>
    {error && <p role="alert" className="rfl-error">{error} <Link href="/support">Get help</Link></p>}
  </section></main>;
}
