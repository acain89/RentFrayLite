"use client";
import { useEffect, useState } from "react";
export default function ManagerPushControls() {
  const [message, setMessage] = useState("Enable optional payment-status notifications on this device.");
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setSupported(window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    // Register without requesting permission. This worker never caches pages.
    if (window.isSecureContext && "serviceWorker" in navigator) void navigator.serviceWorker.register("/manager-sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  async function change(enable: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const permission = enable ? Notification.requestPermission() : null;
      if (permission && await permission !== "granted") throw new Error("Notifications are blocked. Change permission in your browser settings; your dashboard remains available.");
      const registration = await navigator.serviceWorker.register("/manager-sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (enable) {
        // The permission prompt is triggered only by this explicit user action.
        const config = await fetch("/api/manager/push", { cache: "no-store" });
        if (!config.ok) throw new Error("Please sign in again and retry.");
        const { publicKey } = await config.json() as { publicKey: string | null };
        if (!publicKey) throw new Error("Notifications are not configured yet. Payment status remains available in your dashboard.");
        if (!subscription) {
          const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
          const bytes = new Uint8Array(decoded.length); for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        }
        const response = await fetch("/api/manager/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        if (!response.ok) throw new Error("Unable to enable notifications. Please retry.");
        setEnabled(true); setMessage("Notifications enabled for this signed-in session on this device. Delivery is not guaranteed.");
      } else {
        if (subscription) {
          const response = await fetch("/api/manager/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
          if (!response.ok) throw new Error("Unable to disable notifications. Please retry.");
          await subscription.unsubscribe();
        }
        setEnabled(false); setMessage("Notifications disabled on this device.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update notifications. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="rfl-push-panel" aria-labelledby="push-heading"><h2 id="push-heading">Payment notifications</h2>
    <p>Optional alerts when an ACH payment starts processing or succeeds. A successful payment does not mean funds have reached your bank account.</p>
    {supported ? <div className="rfl-push-actions"><button type="button" className="rfl-secondary-button" disabled={busy} onClick={() => void change(true)}>{busy ? "Please wait…" : enabled ? "Refresh notifications" : "Enable Notifications"}</button><button type="button" className="rfl-secondary-button" disabled={busy} onClick={() => void change(false)}>Disable on this device</button></div> : <p>This browser does not currently support notifications. On iPhone or iPad, add RentFrayLite to your Home Screen, open it there, and sign in. You can always check payment status here.</p>}
    <p>To install: use your browser&apos;s Install app or Add to Home Screen menu. Sign out to stop alerts for this session; enable again after signing in.</p>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
