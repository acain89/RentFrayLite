import { createHash, ECDH } from "node:crypto";
export class PushInputInvalid extends Error {}
// Provider-only hosts prevent user-controlled subscription URLs becoming SSRF.
const hosts = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
export function pushEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new PushInputInvalid();
  let url: URL; try { url = new URL(value); } catch { throw new PushInputInvalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
      !(hosts.has(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)) || url.pathname === "/") throw new PushInputInvalid();
  return url.href;
}
export const pushEndpointHash = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");
function key(value: unknown, bytes: number): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || Buffer.from(value, "base64url").length !== bytes) throw new PushInputInvalid();
  if (Buffer.from(value, "base64url").toString("base64url") !== value) throw new PushInputInvalid();
  return value;
}
export function parsePushSubscription(body: Record<string, unknown>) {
  if (Object.keys(body).some(k => !["endpoint", "expirationTime", "keys"].includes(k))) throw new PushInputInvalid();
  const endpoint = pushEndpoint(body.endpoint);
  const keys = body.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys !== "object" || Object.keys(keys).some(k => !["p256dh", "auth"].includes(k))) throw new PushInputInvalid();
  const p256dh = key(keys.p256dh, 65), auth = key(keys.auth, 16);
  if (Buffer.from(p256dh, "base64url")[0] !== 4) throw new PushInputInvalid();
  try { ECDH.convertKey(Buffer.from(p256dh, "base64url"), "prime256v1"); } catch { throw new PushInputInvalid(); }
  return { endpoint, endpointHash: pushEndpointHash(endpoint), p256dh, auth };
}
