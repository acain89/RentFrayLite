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

## Select one trusted ingress

`RFL_LOOKUP_IP_SOURCE` is a server-side deployment setting, never a request
parameter. Unset means `signed` (the original behavior). Only the exact values
`signed` and `render` are supported; every other value fails closed with 503.
Missing or invalid identity never falls back to another adapter or header.

### Render public web service

Set `RFL_LOOKUP_IP_SOURCE=render` only after reviewing this service's topology.
The adapter also requires Render's server-provided `RENDER=true` and
`RENDER_SERVICE_TYPE=web`. These environment checks select the adapter; they do
not authenticate an individual request or rule out a private-network bypass.

Render documents that public traffic traverses its Cloudflare/load-balancer edge,
which overwrites caller-supplied `CF-Connecting-IP`. Read that header only, require
one valid IPv4/IPv6 address, and canonicalize it before the existing limiter.
Lists, ports, bracketed/scoped IPv6 and malformed addresses fail closed. Ignore
`X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`, `Forwarded`, and caller-supplied
`x-rfl-client-*` assertions in this mode. No Render-mode HMAC secret is needed.
The existing budget's `STRIPE_SECRET_KEY` and PostgreSQL requirements remain.

**Topology prerequisite:** public traffic must reach the application through
Render's managed edge, with no alternate untrusted path to the listening server.
Render's application port is not directly reachable over the public internet.
However, paid web services may receive private-network requests from services in
the same workspace/region without Cloudflare. Those callers must be trusted or
network-isolated before enabling this mode. Free web services cannot receive
private-network connections. Verify the actual current plan/topology; do not
assume a historical Free plan or an environment flag proves isolation. Do not
relay arbitrary caller headers through an internal service. Any additional proxy,
Worker or custom-domain change requires rechecking the trust boundary.

Sources reviewed 2026-11-15:
- [Render client-IP overwrite guarantee and X-Forwarded-For warning](https://render.com/articles/host-pocketbase-on-render#making-pocketbase-see-the-real-client-ip)
- [Render public port boundary](https://render.com/docs/web-services#port-binding)
- [Render private-network paths and Free-service restriction](https://render.com/docs/private-network)
- [Render-provided service environment variables](https://render.com/docs/environment-variables)

**Release steps (no shell required):**
1. In the existing RFL Render service, verify its identity, public web-service
   type, plan, and private-network/environment boundaries. Confirm that no
   untrusted internal caller or alternate origin can supply the trusted header.
2. After patch review and publication authorization, deploy the exact reviewed
   commit with `RFL_LOOKUP_IP_SOURCE=render` in that RFL service. Keep its current
   verified canonical URL, database configuration and all other safeguards.
   Setting the variable before the adapter exists will not fix the old code.
3. Verify all three affected route families below. Through authorized, bounded
   ingress checks, confirm forged forwarding headers cannot alter limiter
   identity and a forged CF header is overwritten/rejected at the real edge.
   Missing/malformed CF identity must yield 503 and never reach lookup. Observe
   only sanitized pass/fail information, never credentials or raw client IPs;
   do not add a public diagnostic endpoint or initiate payments for this check.
4. Confirm durable per-IP/global budgets still return 429 at their boundaries
   and database/configuration failures return 503. Use isolated fixtures for
   limit exhaustion; do not flood production or perform payment transactions.
5. Retain the commit/configuration receipt and topology evidence. Local tests
   cannot prove live edge header rewriting. If topology cannot be verified,
   keep publication/activation pending; do not compensate with an IP fallback.

The `onrender.com` hostname can use this adapter. A custom domain is not required
for client-IP verification. DNS changes alone cannot implement either adapter.

### Other deployments: original signed ingress

Use `RFL_LOOKUP_IP_SOURCE=signed` (or leave it unset). The trusted ingress must
strip incoming `x-rfl-client-*` headers, determine the actual IP from its
connection/trusted upstream, and set a single `x-rfl-client-ip`, a 13-digit
Unix-millisecond `x-rfl-client-time`, and a lowercase-hex HMAC-SHA256
`x-rfl-client-signature`. The exact UTF-8 signing input is LF-separated with no
trailing LF:

    rfl-lookup-ip-v1
    <timestamp>
    <uppercase HTTP method>
    <URL pathname, excluding query>
    <IP exactly as transmitted in x-rfl-client-ip>

`RFL_LOOKUP_PROXY_SECRET` must have at least 32 bytes, shared only between ingress
and server and distinct from payment credentials. Preserve the external pathname,
synchronize clocks (30-second freshness), prevent direct untrusted backend access,
and never expose assertions or secrets in responses, bundles or logs. CF and
ordinary forwarded headers cannot replace a valid signature in signed mode.

## Shared protections and impact

Both adapters preserve IPv6/mapped-IPv4 canonicalization, keyed budget identities,
PostgreSQL atomic per-IP/global reservations, bounded cleanup and fail-closed
errors. No schema/migration or financial behavior changes. No raw IP is stored in
budget rows and no per-request audit records are added.

Directly protected: GET/HEAD property-code root pages (`/AB-1234`, `/AB1234`,
case/encoded variants), GET/HEAD `/api/setup/account-code/availability`, and POST
`/api/public/checkout/session`. This includes account-code confirmation's
availability check and checkout/review preparation. Login, ADMIN, Stripe
onboarding/webhooks and `/api/public/checkout/start` do not acquire this IP gate;
their existing authentication, origin/body and independent limits remain intact.

Stripe webhooks are limited to 1 MiB raw bytes and 10 seconds of body reading.
Oversize returns 413 before SDK construction/signature verification; malformed,
truncated or timed-out bodies return 400. Exact bytes are passed as Buffer to
Stripe constructEvent; content-length is not trusted in place of stream counting.
Signed deliveries and retries retain existing financial processing. Monitor
413s; if an actual legitimate event exceeds this bound, review a narrowly scoped
size adjustment. Proxy-level connection/concurrency limits remain necessary.
