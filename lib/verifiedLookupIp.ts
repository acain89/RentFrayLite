import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/** Only an authenticated ingress assertion establishes a client IP. Standard
 * forwarding headers and caller-chosen browser/session identifiers are ignored. */
export function verifiedLookupIp(request: Request, now = Date.now()): string | null {
  const secret = process.env.RFL_LOOKUP_PROXY_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  const ip = request.headers.get("x-rfl-client-ip") ?? "";
  const timestamp = request.headers.get("x-rfl-client-time") ?? "";
  const signature = request.headers.get("x-rfl-client-signature") ?? "";
  if (ip.includes("%") || !isIP(ip) || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 30_000 || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const path = new URL(request.url).pathname;
  const expected = createHmac("sha256", secret).update(["rfl-lookup-ip-v1", timestamp, request.method.toUpperCase(), path, ip].join("\n")).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return null;
  // URL serialization canonicalizes IPv6 spellings and IPv4-mapped IPv6.
  if (isIP(ip) === 4) return ip;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = canonical.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
  if (mapped) {
    const n = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  return canonical;
}
