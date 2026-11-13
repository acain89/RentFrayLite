"use client";
import Link from "next/link";
import { MAX_DAILY_LATE_FEE_DAYS, DAILY_LATE_FEE_DAYS_ERROR, parseDailyLateFeeDays } from "@/lib/recurringValidation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SetupProgress from "@/components/setup/SetupProgress";

type Charge = { id: string; label: string; amountCents: number; sharedChargeGroupId: string | null; applyToAllTiers: boolean; effectiveBillingCycle: string | null; endsAfterBillingCycle: string | null };
type Tier = { id: string; name: string; baseAmountCents: number; version: string; dueDay: number; gracePeriodDays: number;
  initialLateFeeCents: number; dailyLateFeeCents: number; dailyLateFeeMaxDays: number; charges: Charge[] };
type Page = { tiers: Tier[]; nextCursor: string | null; total: number; version: string };
type Step = "tiers" | "charges" | "billing" | "review";
const money = (value: number) => (value / 100).toFixed(2);
function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw Error("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split("."), result = Number(whole)*100+Number(fraction.padEnd(2,"0"));
  if (!Number.isSafeInteger(result)) throw Error("Invalid amount."); return result;
}

export default function PaginatedRecurringConfiguration({ step, highestReachedStep }: { step: Step; highestReachedStep: 1|2|3|4|5|6|7 }) {
  const router = useRouter(), settings = useSearchParams().get("mode") === "settings";
  const [page, setPage] = useState<Page>({ tiers: [], nextCursor: null, total: 0, version: "" });
  const [history, setHistory] = useState<Array<string|null>>([null]), [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Tier|null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [name, setName] = useState(""), [amount, setAmount] = useState("");
  const [chargeId, setChargeId] = useState<string|undefined>(), [label, setLabel] = useState(""), [chargeAmount, setChargeAmount] = useState(""), [sharedCharge, setSharedCharge] = useState(false);
  const [grace, setGrace] = useState("5"), [initialFee, setInitialFee] = useState(""), [dailyFee, setDailyFee] = useState(""), [days, setDays] = useState("0");
  const [sharedRules, setSharedRules] = useState(false), [confirmCalendar, setConfirmCalendar] = useState(false);
  const pending = useRef<{ body: string; requestId: string }|null>(null), selectedId = useRef<string|null>(null);
  const choose = useCallback((tier: Tier|null) => {
    selectedId.current = tier?.id ?? null; setSelected(tier); setName(tier?.name ?? ""); setAmount(tier ? money(tier.baseAmountCents) : "");
    setGrace(String(tier?.gracePeriodDays ?? 5)); setInitialFee(tier?.initialLateFeeCents ? money(tier.initialLateFeeCents) : ""); setDailyFee(tier?.dailyLateFeeCents ? money(tier.dailyLateFeeCents) : ""); setDays(String(tier?.dailyLateFeeMaxDays ?? 0));
    setChargeId(undefined); setLabel(""); setChargeAmount(""); setSharedCharge(false); setConfirmCalendar(false);
  }, []);
  const cursor = history[index];
  const load = useCallback(async () => {
    const response = await fetch("/api/setup/recurring/tiers"+(cursor ? "?cursor="+encodeURIComponent(cursor) : ""), { cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw Error(data.error ?? "Unable to load tiers.");
    setPage(data); choose(data.tiers.find((t: Tier) => t.id === selectedId.current) ?? data.tiers[0] ?? null);
  }, [cursor, choose]);
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, [load]);
  async function save(operation: string, payload: Record<string, unknown>) {
    const body = JSON.stringify({ operation, ...payload });
    if (pending.current?.body !== body) pending.current = { body, requestId: crypto.randomUUID() };
    const route = operation === "charge" ? "charges" : operation === "billing" ? "billing" : "tiers";
    const response = await fetch("/api/setup/recurring/"+route, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), requestId: pending.current.requestId }) });
    const data = await response.json(); if (!response.ok) throw Error(data.error ?? "Unable to save.");
    pending.current = null; await load(); setMessage("Saved."); return data;
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setMessage(""); try { await fn(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save."); } finally { setBusy(false); }
  }
  function chargePayload() {
    return { id: selected!.id, version: sharedCharge ? page.version : selected!.version, shared: sharedCharge,
      charge: { ...(chargeId ? { id: chargeId } : {}), label, amountCents: cents(chargeAmount) } };
  }
  async function proceed() {
    if (step === "review") {
      const response = await fetch("/api/setup/recurring/review", { method: "POST" }), data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Unable to complete review."); router.push(data.redirectTo); return;
    }
    await save("advance", { step }); router.push("/setup/recurring/"+({ tiers: "charges", charges: "billing", billing: "review" }[step]));
  }
  const suffix = settings ? "?mode=settings" : "";
  return <main className="rfl-settings-page"><section className="rfl-settings-shell">
    <SetupProgress currentStep={step === "tiers" ? 2 : step === "charges" ? 3 : step === "billing" ? 4 : 5} highestReachedStep={highestReachedStep}/>
    <h1>{step === "tiers" ? "Create each monthly price option your customers can select." : step === "charges" ? "Monthly Charges" : step === "billing" ? "Billing Rules" : "Review Configuration"}</h1>
    <nav>{(["tiers","charges","billing","review"] as Step[]).map(s => <Link key={s} href={"/setup/recurring/"+s+suffix}>{s} </Link>)}</nav>
    {step === "tiers" ? <div aria-live="polite">{page.total} active rent tiers</div> : <p>{page.total} active rent tiers. Select a tier to edit; changes to other tiers are preserved.</p>}
    <fieldset disabled={busy}>
      <button type="button" disabled={index === 0} onClick={() => setIndex(i => i-1)}>Previous tiers</button>
      <button type="button" disabled={!page.nextCursor} onClick={() => { setHistory(h => [...h.slice(0,index+1),page.nextCursor]); setIndex(i => i+1); }}>Next tiers</button>
      <ul>{page.tiers.map(t => <li key={t.id}><button type="button" aria-pressed={selected?.id === t.id} onClick={() => choose(t)}>{t.name} — ${money(t.baseAmountCents)}</button></li>)}</ul>
      {step === "tiers" && <>
        <button type="button" onClick={() => choose(null)}>Add tier</button>
        <form onSubmit={e => { e.preventDefault(); void act(() => save("tier", { ...(selected ? { id: selected.id, version: selected.version } : {}), name, amountCents: cents(amount) })); }}>
          <label>Tier name<input required value={name} maxLength={80} onChange={e => setName(e.target.value)}/></label>
          <label>Monthly amount<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label>
          <button>Save tier</button>
        </form>
        {selected && <button type="button" onClick={() => { if (window.confirm("Remove this tier? Historical payments will be preserved.")) void act(() => save("removeTier", { id: selected.id, version: selected.version })); }}>Remove tier</button>}
      </>}
      {step === "charges" && selected && <>
        <h2>{selected.name}</h2>
        <ul>{selected.charges.map(c => <li key={c.id}><button type="button" onClick={() => { setChargeId(c.id); setLabel(c.label); setChargeAmount(money(c.amountCents)); setSharedCharge(c.applyToAllTiers); }}>{c.label} — ${money(c.amountCents)}</button></li>)}</ul>
        <button type="button" onClick={() => { setChargeId(undefined); setLabel(""); setChargeAmount(""); setSharedCharge(false); }}>Add charge</button>
        <form onSubmit={e => { e.preventDefault(); void act(() => save("charge", chargePayload())); }}>
          <label>Charge name<input required value={label} maxLength={80} onChange={e => setLabel(e.target.value)}/></label>
          <label>Charge amount<input required inputMode="decimal" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)}/></label>
          <label><input type="checkbox" checked={sharedCharge} onChange={e => setSharedCharge(e.target.checked)}/>Apply to all tiers</label>
          <p>Saved billing-cycle applicability is preserved. Shared changes apply to every active tier.</p><button>Save charge</button>
        </form>
        {chargeId && <button type="button" onClick={() => { if (window.confirm(sharedCharge ? "Remove this charge from all tiers?" : "Remove this charge from this tier?")) void act(() => save("charge", { ...chargePayload(), remove: true })); }}>Remove charge</button>}
      </>}
      {step === "billing" && selected && <form noValidate onSubmit={e => { e.preventDefault(); if (parseDailyLateFeeDays(days) === null) { setMessage(DAILY_LATE_FEE_DAYS_ERROR); return; } void act(() => save("billing", { id: selected.id, version: sharedRules ? page.version : selected.version, shared: sharedRules, confirmCalendarChange: confirmCalendar,
        rule: { dueDay: 1, gracePeriodDays: Number(grace), initialLateFeeCents: cents(initialFee.trim() || "0"), dailyLateFeeCents: cents(dailyFee.trim() || "0"), dailyLateFeeMaxDays: parseDailyLateFeeDays(days) } })); }}>
        <h2>{selected.name}</h2><p>Payments are due on the 1st of every month. Choose your grace period and late fees.</p>
        <label htmlFor="tier-grace">Grace period</label><select id="tier-grace" value={grace} onChange={e => setGrace(e.target.value)}>
          {!["3","4","5"].includes(grace) && <option value={grace} disabled>Choose 3, 4, or 5 days</option>}
          {[3,4,5].map(n => <option key={n} value={n}>{n} days</option>)}</select>
        <label>Initial late fee<input value={initialFee} placeholder="0.00" className="placeholder:text-slate-400" inputMode="decimal" onChange={e => setInitialFee(e.target.value)}/></label>
        <label>Daily late fee<input value={dailyFee} placeholder="0.00" className="placeholder:text-slate-400" inputMode="decimal" onChange={e => setDailyFee(e.target.value)}/></label>
        <label>Maximum daily late-fee days<input type="number" min={0} max={MAX_DAILY_LATE_FEE_DAYS} step={1} aria-invalid={parseDailyLateFeeDays(days) === null} aria-describedby={parseDailyLateFeeDays(days) === null ? "tier-days-error" : undefined} value={days} onChange={e => setDays(e.target.value)}/></label>
        {parseDailyLateFeeDays(days) === null && <p id="tier-days-error" className="rfl-error" role="alert">{DAILY_LATE_FEE_DAYS_ERROR}</p>}
        <label><input type="checkbox" checked={sharedRules} onChange={e => setSharedRules(e.target.checked)}/>Same rules for all tiers</label>
        <p>Check to apply this save to every active tier. Leave unchecked to update only the selected tier.</p>
        <label><input type="checkbox" checked={confirmCalendar} onChange={e => setConfirmCalendar(e.target.checked)}/>Confirm conversion of any existing legacy billing calendar</label>
        <button>Save billing rules</button>
      </form>}
      {step === "review" && selected && <section><h2>{selected.name}</h2><p>Monthly amount: ${money(selected.baseAmountCents)}. Payment Due: {selected.dueDay}. Grace: {selected.gracePeriodDays} days.</p>
        <p>Initial late fee: ${money(selected.initialLateFeeCents)}. Daily late fee: ${money(selected.dailyLateFeeCents)}, up to {selected.dailyLateFeeMaxDays} days.</p>
        <ul>{selected.charges.map(c => <li key={c.id}>{c.label}: ${money(c.amountCents)}</li>)}</ul></section>}
      {settings ? <Link href="/manager/settings">Back to settings</Link> : <button type="button" disabled={!page.total} onClick={() => void act(proceed)}>{step === "review" ? "Continue to Stripe" : "Continue"}</button>}
      <button type="button" onClick={() => void act(load)}>Reload latest configuration</button>
    </fieldset><p role="status">{busy ? "Saving…" : message}</p>
  </section></main>;
}
