# Public lookup ingress contract

Property-code GET/HEAD pages, GET/HEAD /api/setup/account-code/availability, and
POST /api/public/checkout/session share a durable
120-request / 10-minute budget per verified IP, plus 3,000 accepted requests per
minute globally. The same policy applies before property resolution regardless
of code existence. Ordinary forwarded headers, phone numbers and cookies cannot
reset this budget. Existing quote/attempt budgets and payment idempotency remain.
A normal checkout uses a small number of requests; shared public IPs share 120
requests. Large shared networks may need operational review; no IP policy can
perfectly distinguish users behind NAT.

The trusted ingress must strip incoming x-rfl-client-* headers, determine the
actual client IP from its authenticated network connection / trusted upstream
chain, and set:

- x-rfl-client-ip: single IPv4 or IPv6 address, no list/port/zone identifier
- x-rfl-client-time: current Unix epoch milliseconds (13 decimal digits)
- x-rfl-client-signature: lowercase hexadecimal HMAC-SHA256

The HMAC input is these exact UTF-8 lines joined by LF, without a trailing LF:

    rfl-lookup-ip-v1
    <timestamp>
    <uppercase HTTP method>
    <URL pathname, excluding query>
    <IP exactly as transmitted in x-rfl-client-ip>

Use RFL_LOOKUP_PROXY_SECRET (at least 32 bytes of random secret material), shared
only between ingress and server, distinct from payment credentials. Keep clocks
synchronized. Assertions expire after 30 seconds. Forward the external pathname
unchanged and prevent direct public access to the backend. Never expose assertion
headers or the secret in browser responses, client bundles, or logs. Requests
without valid assertions return generic 503 / Retry-After: 5 before lookup;
exhausted budgets return generic 429 and Retry-After. Standard x-forwarded-for,
x-real-ip, Host and forwarded protocol headers are never IP authorities.

IP canonicalization collapses equivalent IPv6 and mapped IPv4 spellings. IPv6
address rotation and distributed sources remain edge-defense considerations.
Budget keys contain only keyed digests; no raw client IP is stored. Expired rows
are cleaned in bounded indexed batches by the existing limiter. Global accepted
request budget bounds key creation. No per-request audit-log entries are added.

This change does not configure infrastructure. Deployment requires a reviewed
signing ingress and secret; absent those, property lookup intentionally fails
closed. Existing signup/management authentication and nonlookup routes are not
subject to this new IP contract.

Stripe webhooks are limited to 1 MiB raw bytes and 10 seconds of body reading.
Oversize returns 413 before SDK construction/signature verification; malformed,
truncated or timed-out bodies return 400. Exact bytes are passed as Buffer to
Stripe constructEvent; content-length is not trusted in place of stream counting.
Signed deliveries and retries retain existing financial processing. Monitor
413s; if an actual legitimate event exceeds this bound, review a narrowly scoped
size adjustment. Proxy-level connection/concurrency limits remain necessary.
