# Disposable PostgreSQL acceptance and operational safety

`npm run test:postgres` provisions a new loopback-only PostgreSQL 17 cluster,
applies the 25 committed migrations and runs every Node regression with its real
PostgreSQL branches, followed by the additional PostgreSQL invariant suite.
PostgreSQL binaries default to `C:/Program Files/PostgreSQL/17/bin`; a trusted
local installation can be selected with `RFL_POSTGRES_BIN`. No existing URL is
accepted. Provider credentials and inherited database variables are scrubbed.
Stripe is mocked. This command must not be used against an existing database.

The provisioner refuses pre-existing storage, verifies the empty cluster and
server identity, creates a non-login database owner and a separate restricted
application role, and writes a nonce-bound ownership record. The application
role cannot own the database, assume its owner, create roles/databases/public
schema objects, truncate tables or modify the fixture-identity table. The
identity table is outside the Prisma application schema; no application schema
or migration file is changed. The real engine is checked against its cluster
identifier, startup time, data directory, PID, database, owner, role privileges,
nonce and loopback endpoint before application fixture operations.

A private proof file is a transport, not authority by itself. Every test client
uses the shared typed `lib/disposableDatabase.ts` boundary. Pool sizes are
nonce-attested and capped at 12 per client, below the role's 64-connection and
server's 80-connection limits. The administrator concurrency fixture uses
independent clients rather than claiming process independence through one pool.
Production pools, authentication limits and retry behavior are unchanged.

The JavaScript network guard validates normalized arguments, resolved addresses,
custom lookup attempts and inspected socket options. It is not a sandbox and
does not intercept Prisma's native engine. PostgreSQL permission and identity
checks provide the separate database safety boundary. There are no real provider
requests in the acceptance suite.

The original checkout is discovered through Git's common directory. Its
non-generated, non-environment file inventory is hashed read-only before tests,
including the historical SQLite/APK assets and previously excluded artifacts.
The preservation test checks the complete inventory instead of relying on the
unavailable historical 14-item temporary manifest. Original files are never
copied into release source or changed by this workflow.

Cleanup stops only the PID/data directory owned by this invocation and removes
only its nonce-named storage, private configuration and password files. Sanitized
stage logs, per-case coverage and cleanup evidence remain in the printed temporary
acceptance directory. Failed startup/identity checks fail closed; cleanup failure
is reported rather than broadening the deletion target.

## Administrator fixture seed

The seed is disposable-only, requires the verified proof plus
`--scope=seed-admin`, and is dry-run unless `--apply` is specified. It changes only
the single `rfl-fixture-admin-<nonce>` record; unrelated administrator records and
sessions are preserved. `SEED_ADMIN_CODE` retains the exact six-digit validation
contract. Never seed as production startup, recovery or deployment. Existing
production administrator routes and scoped recovery commands are unchanged.

## Framework and browser acceptance

Next.js and eslint-config-next are pinned to 16.4.6. Exact reviewed dependency
entries and client effect/navigation spans are recorded in test-only fixtures;
all other financial, authentication, authorization and schema sources remain
byte-compared with the approved PWA checkpoint. No financial policy is changed.

Client transitions execute their callbacks immediately; debounce timers,
cancellation, revision fences, frozen retry payloads and effect cleanup remain
in their original locations. Credential changes still cause full-document
navigation, avoiding reuse of an earlier identity's client memory.

The Playwright checkout suite now mounts the actual checkout client with fully
intercepted synthetic data, rather than requiring a hardcoded deployed property.
Its historical CARD-toggle expectations are reconciled to the already-approved
ACH-only production policy: absence of CARD controls and the exact ACH request
payload are asserted. Historical CARD financial state coverage remains intact.

Offline build verification may use Next's supported Google font response mock
with real local Geist files. That validates production compilation and packaging,
not external font-download availability. Physical installation and consenting
real-device Web Push delivery remain separate release checks.

A separate `scripts/bootstrap-first-admin.ts` preserves legitimate initial
production provisioning without the old reset behavior. It is dry-run by default,
requires explicit database name/OID/owner/role and a scoped administrator ID,
rechecks identity inside a locked transaction and creates only when the entire
administrator store is empty. It never deletes, updates or resets existing
access. Its credential contract is unchanged. The acceptance provisioner tests
concurrent first creation and refusal to overwrite in its own disposable database.
This is not authorization to execute it against production; production recovery
continues through existing approved administrator/recovery/restore procedures.

## Additional historical invariants

The previously unregistered `s7-p1-pg-invariants.mjs` also retains 22 SMS
assertions from before commit `b23a95d` retired SMS in favor of manager Web Push.
Its three removed SMS modules are loaded only in memory from immutable commit
`5949a40a5ff67ba36df970406cb886b5682419f5`, through an explicit test-only allowlist.
Provider construction is forbidden. Those results describe archived SMS behavior
against preserved historical tables, not current production notification delivery.
All current webhook/refund/reporting code remains under test. Current Checkout
reservation creation uses ACH, while stored historical CARD fixtures remain CARD.
No SMS module, provider dependency or production delivery path is restored.

`npm run test:postgres -- --invariants-only` runs this additional fixture on a new
verified cluster for focused diagnosis; the default command still runs the entire
regression suite and all additional invariants, with zero skips required.
