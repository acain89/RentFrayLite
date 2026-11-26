// Verification only: block external networking, including accidental DB/provider use.
import net from "node:net";
const local = (host) =>
  ["localhost", "127.0.0.1", "::1"].includes(
    String(host).replace(/^\[|\]$/g, ""),
  );
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const target =
    typeof args[0] === "object"
      ? args[0]
      : typeof args[0] === "number"
        ? {
            port: args[0],
            host: typeof args[1] === "string" ? args[1] : "localhost",
          }
        : {};
  if (
    [9, 5432, 5433].includes(Number(target.port)) ||
    (target.host && !local(target.host))
  )
    throw new Error("Verification blocked external or database connection");
  return connect.apply(this, args);
};
const fetch = global.fetch;
global.fetch = function (input, ...args) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!local(url.hostname))
    throw new Error("Verification blocked external fetch");
  return fetch.call(this, input, ...args);
};
