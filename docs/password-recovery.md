# Management password recovery

The recovery workflow is management-only. No tenant authentication is added.
Tokens contain 32 cryptographically random bytes, expire after 30 minutes, and
are stored only as SHA-256 hashes in VerificationToken. A credential fingerprint
binds each token to the current manager identity, email and password hash.
Successful recovery atomically consumes the token, invalidates outstanding
password-reset tokens, updates bcrypt (cost 12), and revokes management sessions.
Existing session issuance rechecks credentials under the Manager lock.

## Configuration before deployment

Apply migration 20261026030000_management_password_recovery and generate a matching
Prisma client only through the separately approved deployment process. This stage
does not apply anything to existing databases.

NEXT_PUBLIC_BASE_URL must be the verified public HTTPS RFL origin, without a
path, credentials, query or fragment. Request Host/Forwarded headers never
choose email links. Local HTTP is accepted only for development credential
request origin checks; recovery email links always require public HTTPS.

No email provider was present in the inspected repository/configuration. The
provider-neutral PasswordResetEmailSender interface is injectable. The optional
built-in HTTPS adapter uses RFL_EMAIL_API_URL, RFL_EMAIL_API_TOKEN and
RFL_EMAIL_FROM for a trusted transactional email API accepting JSON fields
from, to, subject, text and html with Bearer authentication. A successful 2xx
response means accepted, not proven inbox delivery. No dependencies or extra
service are required if the selected provider supports that contract; otherwise
supply a small provider adapter. No actual configuration was changed.

Disable provider click/open tracking and URL rewriting for recovery emails. Do
not log request bodies, email bodies, passwords, reset URLs, or tokens. Reset
links carry the token in a URL fragment so it is not sent in HTTP URLs; the client
removes it from browser history before submission. The page is dynamic, no-store,
no-index and no-referrer. GET does not consume a token.

Delivery timeout is 1.2 seconds, with no automatic retry. Unavailable or ambiguous
email delivery invalidates only that newly issued token and records a sanitized
security event. Old usable links are not invalidated by a new request. Public
confirmation is identical for known/unknown accounts; ordinary response paths
are padded to 2 seconds. Queueing/database outages and extreme load can still
affect response time; this is not a constant-time network guarantee.

## Abuse budgets

AuditLog reservations and PostgreSQL advisory locks persist across workers and
restarts. Identifiers are domain-separated hashes, never raw emails/tokens.
Login allows 10 attempts per identifier per 10 minutes and 300 globally per
5 minutes. Recovery requests allow 3 per identifier per 30 minutes and 100
globally per 5 minutes. Reset submissions allow 10 per token-derived identifier
per 10 minutes and 100 globally per 5 minutes. Denials do not extend windows.
Recovery and login budgets are independent; no untrusted source-IP headers are
used as identity. Infrastructure-level flood protection remains a deployment
requirement. Security audit retention should follow the existing retention plan.

All newly chosen management passwords require 8 characters excluding outer
whitespace, an uppercase ASCII letter, a lowercase ASCII letter, and an ASCII digit.
Special characters are optional. New passwords must fit within 72 UTF-8 bytes
and contain no NUL or malformed Unicode. Existing
hashes are never rewritten automatically. Existing 6-to-128-character login
credentials remain accepted, subject to NUL/Unicode validation. Legacy bcrypt
passwords longer than 72 bytes retain their historical truncation behavior until
a legitimate password change; no silent hash migration or account lockout occurs.

Review email domain/sender verification, actual delivery, proxy origin handling,
and no-store/referrer headers in a separately authorized test before production.
No Stripe, SMS, payout, or financial behavior is changed by this task.


## Configuration readiness and availability (Stage 6 Package 2)

Server-side passwordRecoveryReady checks configuration only. It makes no network,
DNS or provider probe and does not certify credentials, a verified sender,
provider compatibility, acceptance or inbox delivery.

Required variable names:
- NEXT_PUBLIC_BASE_URL: canonical HTTPS root origin, without credentials,
  path/query/fragment, whitespace/controls or loopback/localhost host.
- RFL_EMAIL_API_URL: HTTPS gateway URL without credentials/query/fragment or
  loopback/localhost host; no whitespace or control characters.
- RFL_EMAIL_API_TOKEN: nonempty HTTP Bearer token characters, without whitespace
  or control characters. Never expose it in pages, responses or logs.
- RFL_EMAIL_FROM: bare ASCII email address with a structurally valid local part
  and dotted domain; no display name, controls or whitespace.

Only the readiness boolean reaches the login client. Login and forgot-password
pages are dynamic: missing/malformed configuration hides the self-service link
and the direct forgot-password page shows an account-independent unavailable
message with administrator assistance. Manager login itself remains available.
No new environment toggle, provider, queue, dependency or database field is added.

The service rechecks readiness before account lookup or reset-token creation,
even if a caller injects a sender. The transport validates the same configuration
before attempting a send. Request origin/body protections, durable budgets and
ordinary response padding remain. When globally unavailable, requests return
the same safe unavailable message for known/unknown accounts. When configured,
the generic confirmation says an email may be sent and delivery is not confirmed.
It never exposes account eligibility, throttling or provider outcomes.

Existing reset links can still be consumed if email configuration later becomes
unavailable; expiry, single use, credential binding and session revocation remain
authoritative. A provider rejection/timeout/uncertain response still invalidates
only its newly issued token and records the existing safe failure audit; no
automatic retry or resend is added. A successful transport response means
provider acceptance under the existing JSON contract, not confirmed delivery.

Before offering the feature at launch, separately verify the gateway contract,
sender/domain, accepted-message behavior, real inbox delivery, origin/header/
log configuration and browser fragment-link/reset flow. Structural readiness
alone does not satisfy these prelaunch gates. If delivery is not operational,
leave the transport unconfigured and use the existing authenticated
administrator credential-change procedure after verifying the manager's identity;
never copy passwords/reset links into logs or support tickets.
