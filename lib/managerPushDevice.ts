// Browser-only operations; no stored flag substitutes for a verified device.
export type DeviceState = "on" | "off" | "blocked" | "unsupported";
export function supportsNotifications() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export async function currentDevice() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription() ?? null;
  return { registration, subscription };
}
export async function verifyDeviceNotifications(): Promise<DeviceState> {
  if (!supportsNotifications()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const { subscription } = await currentDevice();
  if (!subscription || (subscription.expirationTime !== null && subscription.expirationTime <= Date.now())) return "off";
  const response = await fetch("/api/manager/push", { method: "PATCH", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
  if (!response.ok) throw new Error("Couldn't check notifications. Please try again.");
  const result = await response.json() as { enabled?: boolean };
  const latest = await currentDevice();
  return result.enabled === true && Notification.permission === "granted" && latest.subscription?.endpoint === subscription.endpoint ? "on" : "off";
}
