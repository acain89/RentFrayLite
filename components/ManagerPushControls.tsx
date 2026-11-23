"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { currentDevice, supportsNotifications, verifyDeviceNotifications, type DeviceState } from "@/lib/managerPushDevice";
type Update = { id: string; kind: string; createdAt: string };
const statusText = { on: "Notifications are on for this device.", off: "Notifications are off for this device.", blocked: "Notifications are blocked in your browser settings.", unsupported: "Notifications aren't supported in this browser. On iPhone or iPad, open RentFrayLite from your Home Screen." };
export default function ManagerPushControls() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeviceState | "checking" | "unknown">("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [publicKey, setPublicKey] = useState<string | null | undefined>();
  const [history, setHistory] = useState<Update[] | null>();
  const [cleanup, setCleanup] = useState(false);
  const checking = useRef(false);
  const revision = useRef(0);
  const historyRequest = useRef<Promise<void> | null>(null);
  const busyRef = useRef(false);
  const check = useCallback(async () => {
    if (checking.current || busyRef.current) return;
    checking.current = true;
    const current = ++revision.current;
    try { const verified = await verifyDeviceNotifications(); if (current === revision.current) { setState(verified); setMessage(""); } }
    catch { if (current === revision.current) { setState("unknown"); setMessage("Couldn't check notifications. Close and reopen this section to try again."); } }
    finally { checking.current = false; }
  }, []);
  useEffect(() => {
    if (!open) return;
    void check();
    if (!historyRequest.current) historyRequest.current = (async () => {
      try {
        const response = await fetch("/api/manager/push?history=1", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json() as { publicKey: string | null; history: Update[] | null };
        setPublicKey(data.publicKey); setHistory(data.history);
      } catch { setPublicKey(null); setHistory(null); }
    })();
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", visible);
    let permission: PermissionStatus | undefined;
    let closed = false;
    if (navigator.permissions) void navigator.permissions.query({ name: "notifications" }).then(value => { if (closed) return; permission = value; permission.addEventListener("change", check); }).catch(() => {});
    return () => { closed = true; window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", visible); permission?.removeEventListener("change", check); };
  }, [open, check]);
  async function change() {
    if (busyRef.current || !supportsNotifications()) return;
    revision.current++;
    busyRef.current = true; setBusy(true); setMessage("");
    const disabling = state === "on" || cleanup;
    try {
      // Prompt directly in the click handler, including Safari's user activation.
      const permission = !disabling ? Notification.requestPermission() : null;
      if (permission && await permission !== "granted") { setState(Notification.permission === "denied" ? "blocked" : "off"); return; }
      let { registration, subscription } = await currentDevice();
      if (disabling) {
        if (subscription) {
          const response = await fetch("/api/manager/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
          if (!response.ok) throw new Error("Couldn't turn notifications off. Please try again.");
          // Stop server delivery before removing the browser endpoint.
          setState("off"); setCleanup(true);
          await subscription.unsubscribe();
          if (await registration!.pushManager.getSubscription()) throw new Error("Notifications are off. Select Disable Notifications again to finish.");
        }
        setCleanup(false); setState("off");
      } else {
        if (!publicKey) throw new Error("Notifications are unavailable right now. Close and reopen this page to try again.");
        registration ??= await navigator.serviceWorker.register("/manager-sw.js", { scope: "/", updateViaCache: "none" });
        registration = await navigator.serviceWorker.ready;
        if (subscription && subscription.expirationTime !== null && subscription.expirationTime <= Date.now()) {
          const response = await fetch("/api/manager/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
          if (!response.ok) throw new Error("Couldn't update notifications. Please try again.");
          await subscription.unsubscribe(); subscription = null;
        }
        if (!subscription) {
          const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        }
        const response = await fetch("/api/manager/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        if (!response.ok) throw new Error("Couldn't enable notifications. Please try again.");
        const verified = await verifyDeviceNotifications(); setState(verified);
        if (verified !== "on") throw new Error("Couldn't confirm notifications are on. Please try again.");
        setCleanup(false);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Couldn't update notifications. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <details className="rfl-settings-notifications" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Notifications</summary>
    {open && <div className="rfl-notifications-content">
      <p>Get a notification on this device when a payment starts processing or finishes.</p>
      <p role="status" aria-live="polite">{state === "checking" ? "Checking notifications..." : state === "unknown" ? "Notification status is unavailable." : statusText[state]}</p>
      {state !== "unsupported" && <button className="rfl-secondary-button" type="button" onClick={() => void change()} disabled={busy || state === "checking" || state === "unknown" || state === "blocked" || publicKey === undefined || (!(state === "on" || cleanup) && !publicKey)}>{busy ? "Please wait..." : state === "on" || cleanup ? "Disable Notifications" : "Enable Notifications"}</button>}
      {publicKey === null && state !== "unsupported" && <p>Notifications are unavailable right now. Your payment history is still available.</p>}
      {message && <p role="alert">{message}</p>}
      <h2>Recent payment updates</h2>
      {history === undefined ? <p>Loading updates...</p> : history === null ? <p>Updates are unavailable right now. Check Payment History.</p> : history.length === 0 ? <p>No notifications yet.</p> : <ul>{history.map(event => <li key={event.id}><p>{event.kind === "PAID" ? "A payment finished processing." : "A payment started processing."}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul>}
      <p>Check <Link href="/manager/history">Payment History</Link> for the latest status. A finished payment may still be on its way to your bank.</p>
    </div>}
  </details>;
}
