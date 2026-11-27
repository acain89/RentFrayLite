// Verification only. Native engines require independently verified DB isolation.
import net from "node:net";
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
export function verificationDestination(args) {
  let values = args;
  let depth = 0;
  while (Array.isArray(values[0])) { if (++depth > 4) throw Error("Verification blocked ambiguous argument nesting"); values = values[0]; }
  const first = values[0];
  if (first && typeof first === "object") {
    if (first.path) return { path: first.path };
    return { host: first.host ?? "localhost", port: Number(first.port), lookup: first.lookup };
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) return { host: typeof values[1] === "string" ? values[1] : "localhost", port: Number(first) };
  return { path: first };
}
export function assertVerificationDestination(target) {
  const local = ["localhost", "127.0.0.1", "::1"].includes(String(target.host).replace(/^\[|\]$/g, ""));
  // IPC is needed by esbuild/tsx; it cannot resolve a TCP destination.
  if (typeof target.path === "string" && /^(?:\\\\\.\\pipe\\|\/)/.test(target.path)) return;
  if (!local || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535 || [9, 5432, 5433].includes(target.port) || target.lookup) throw Error("Verification blocked external or database connection");
}
export function verificationArguments(args) {
  let values = args, depth = 0;
  while (Array.isArray(values[0])) { if (++depth > 4) throw Error("Verification blocked ambiguous argument nesting"); values = values[0]; }
  const first = values[0];
  const options = first && typeof first === "object" ? { ...first } : verificationDestination(values);
  assertVerificationDestination(verificationDestination([options]));
  const callback = values.at(-1);
  return typeof callback === "function" ? [options, callback] : [options];
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  return connect.apply(this, verificationArguments(args));
};
export function assertVerificationResolution(address) {
  const values = Array.isArray(address) ? address.map(value => value.address) : [address];
  if (!values.length || values.some(value => !["127.0.0.1", "::1"].includes(value))) throw Error("Verification blocked non-loopback resolution");
}
const lookup = dns.lookup;
dns.lookup = function (host, ...args) {
  if (!["localhost", "127.0.0.1", "::1"].includes(String(host))) throw Error("Verification blocked external DNS");
  const callback = args.at(-1);
  if (typeof callback !== "function") throw Error("Verification requires an inspectable DNS callback");
  args[args.length - 1] = (...result) => {
    if (!result[0]) { try { assertVerificationResolution(result[1]); } catch (error) { callback(error); return; } }
    callback(...result);
  };
  return lookup.call(this, host, ...args);
};
const promiseLookup = dns.promises.lookup;
dns.promises.lookup = async function (host, ...args) {
  if (!["localhost", "127.0.0.1", "::1"].includes(String(host))) throw Error("Verification blocked external DNS");
  const result = await promiseLookup.call(this, host, ...args);
  assertVerificationResolution(Array.isArray(result) ? result : result.address);
  return result;
};
const originalFetch = global.fetch;
global.fetch = function (input, ...args) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || [9, 5432, 5433].includes(Number(url.port))) throw Error("Verification blocked external fetch");
  return originalFetch.call(this, input, ...args);
};
syncBuiltinESMExports();
