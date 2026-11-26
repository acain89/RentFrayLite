/* No fetch handler or cache: private pages and payment data never go offline.
   Default update lifecycle: no forced activation, claiming or reload. */
self.addEventListener("push", event => {
  let payload; try { payload = event.data.json(); } catch { return; }
  if (!payload || !["PENDING", "PAID"].includes(payload.kind)) return;
  // Fixed messages only, no user names, unit references, amounts, or bank data.
  const body = payload.kind === "PAID"
    ? "An ACH payment succeeded. This does not mean funds have reached your bank account. Open your dashboard for the current status."
    : "An ACH payment started processing. It is not a completed payment. Open your dashboard for the current status.";
  event.waitUntil((async () => {
    // Recheck the browser session, including business/device ownership, before
    // displaying provider-queued messages after logout or an account change.
    if (typeof payload.tag !== "string" || !/^rfl-ach-[a-f0-9]{64}$/.test(payload.tag)) return;
    try {
      const response = await fetch("/api/manager/push?event=" + payload.tag.slice(8), { credentials: "same-origin", cache: "no-store" });
      if (!response.ok || !(await response.json()).authorized) return;
      await self.registration.showNotification("RentFrayLite", { body, icon: "/icons/rentfray-icon-192.png", tag: payload.tag, renotify: false });
    } catch { /* No offline notification can substitute for verified ownership. */ }
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/manager/dashboard", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});
