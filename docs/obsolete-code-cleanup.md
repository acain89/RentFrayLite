# Obsolete-code cleanup inventory

Baseline inspected: 825ca524c5226466e444b3d62a01607fb6b0753a.

Reference analysis covered tracked application, library, component, test, script
and configuration sources, plus the preserved untracked source copies. Static
imports/re-exports, literal require/import calls, dynamic test-loader paths,
exported identifiers and operational script/package references were inspected.
Inventory text files contain historical filenames; they are not runtime callers.
The available payment-audit ZIP is a 13-member source bundle, not a narrative
audit report. Historical phase documentation and current dependencies were reviewed.

## Confirmed removals

| Source at baseline | Historical purpose | Non-use and safety |
| --- | --- | --- |
| lib/managementAuth.ts | Alternate password verifier including a plain-text compatibility shortcut | No required callers. Active authentication uses lib/auth.ts, lib/password.ts and bcrypt, all preserved. |
| lib/permissions.ts | OWNER/MANAGER/STAFF/TENANT/MAINTENANCE role helpers | No imports or required callers. Current session-based management/admin authorization is preserved. |
| lib/realtime.ts | Process-local event bus for ledgers, tenants, units, maintenance and admin events | No subscribers, emitters, route or script consumers. Payment webhooks and durable SMS workers are independent and preserved. |
| lib/stats.ts | Synthetic property, tenant and monthly-payment statistics | No application, test or operational callers. No real transaction reporting is changed. |
| lib/qr.ts | External QR generator and an obsolete property-code URL builder | No callers. No current navigation or property-code checkout depends on it. |
| lib/liveGating.ts | Unit/settings-dependent legacy property readiness and tenant portal access | No required consumers. Active business/Stripe readiness modules are preserved. |
| lib/rateLimit.ts | Process-local map-based throttle | No callers. Durable login/recovery and admin throttles remain unchanged. |
| lib/dashboard.ts: getLateFeeCents and its private parsing helpers | Guessed late-fee totals for removed dashboard metrics | No remaining callers. Authoritative checkout/calendar pricing and historical charge snapshots remain unchanged. |
| lib/dashboard.ts: getPaymentTimestamp | Unused timestamp wrapper after reporting adopted original transaction dates | No callers. Reporting continues to use persisted Payment.createdAt directly. |

cross-env and ts-node had no repository commands/imports or documented operational
consumers and were removed from direct development dependencies. tsx remains
required by the seed command and documented sandbox utility. Existing esbuild
0.27.4 is now explicitly declared for five test consumers instead of relying on
its incidental availability through tsx. The lock update prunes unused dependency
entries without upgrading existing locked versions. npm also completes missing
nested dependencies of its existing optional Tailwind WASI entry.

## Configuration corrections

- Repair malformed browser-report ignore patterns. Existing report files remain
  on disk and become ignored; no excluded artifact is deleted.
- Exclude generated browser reports and the preserved root checkout backup from
  TypeScript/ESLint inputs. Active application routes are not excluded.
- Remove only the leading comment from Android assetlinks JSON and normalize its
  JSON formatting. App ID, certificate fingerprint and association content remain
  identical; actual Android association compatibility is not established here.
- Update the root metadata description to standard rent and Custom Payments.
  Origin settings, robots policy, fonts, routes and provider configuration remain unchanged.
- Replace corrupted starter README text with current runtime/safety information.
- Correct dashboard/history PageProps signatures for Next-generated validators.
  Optional search parameters and the existing runtime fallback are preserved.

## Retained candidates and reasons

- lib/billingCalendar.ts: active legacy-property calendar compatibility.
- lib/platformFees.ts and lib/rflDirectPricing.ts: intentionally distinct active
  legacy and dormant finalized pricing models, not duplicate interchangeable code.
- Direct readiness, ownership, checkout, webhook, reconciliation and payout
  modules: required implementations and tests even without public activation.
- SetupStep.VERIFY_EMAIL: retained because it is still a schema default and may
  exist in historical records. Its route points to an absent setup/verify-email
  page. New setup explicitly starts at tiers; existing-state impact is unverified.
  A compatibility repair requires separately reviewed behavior, not branch deletion.
- Active setup routes, settings pages and shared components: required route,
  navigation, script or test dependencies; no confirmed obsolete handlers found.
- prisma/dev.db, public/app-release-signed.apk, RFL FINAL.docx, audit/build text
  artifacts and archives: historical or potentially user-owned evidence retained.
- All 12 pre-existing excluded artifacts: retained byte-for-byte, including the
  identical root checkout copy and route backup. Two generated report files are
  now ignored; the other ten remain untracked.
- Untracked app/robot.ts and app/sitemap.ts: protected artifacts, not adopted as
  tracked source. The robots filename is singular and references a different
  domain from the sitemap. Sitemap is a Next metadata route when present locally.
  Canonical origin, route ownership and release inclusion need separate review.
- Existing ignored environment/build/dependency files: preserved; provider credentials are not used or exposed and no environment files
  are modified. No disk-cache cleanup is part of this change.
- next.config.ts standalone output and start script: preserved pending actual
  deployment-entrypoint evidence.

## Verification and release boundaries

Use mocked provider suites and only a newly created, independently identified
PostgreSQL cluster. Do not run live/sandbox payment tools, seeds, existing-database
migrations or unreviewed app-server E2E tests. Preserve every historical migration
and financial/security module. Broader regression verification found an older readiness fixture missing the
Payment.count operation used by the committed reporting query. Its empty payment
fixture now reports count zero; readiness assertions are unchanged. A PostgreSQL
locking test still expected a new checkout to reuse a failed monthly payment.
It now verifies two independent attempts, distinct identities and preservation
of the failed payment, while retaining its original lock/deadlock scenario.
The delayed-request fixture also supplies the valid same-origin header required
by the existing credential endpoint, so it reaches its intended body-read gate.
Origin checks and revocation assertions remain enabled. The older direct-foundation
byte-comparison guard used a pre-SMS snapshot; it now compares against the approved
Task 7 baseline and also explicitly includes the webhook implementation.
No authentication, checkout, Stripe or financial implementation changed.

Actual Stripe eligibility and financial record relationships, SMS registration
and delivery, email delivery/origin, database migration deployment, Android
association and the production build/deployment remain separate launch checks.
Neither direct charges nor Instant Payouts are activated by this cleanup.
