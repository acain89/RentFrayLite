# ACH-only payments and manager Web Push

Status: implementation on `feat/rfl-ach-push`, based on production branch revision `88d9f1ab0d136961eac7c9258cce1c88bb923a53`. Uncommitted; not pushed or deployed. Original dirty checkout, saved SEO release and unrelated work are separate.

## Discovery and scope

Next.js 16.4.3, React 19.2.3, strict TypeScript, Prisma 5.22/PostgreSQL. The active public flow uses destination charges, `lib/platformFees.ts`, server-calculated quotes, business readiness, locked reservations and verified Stripe webhook reconciliation. SMS was coupled to setup/review, two webhook outboxes, workers, callbacks, admin metrics and result copy. Those dependencies can be isolated without replacing ACH or financial records.

Retention plan: retain PaymentMethod.CARD and all previous financial, SMS receipt/outbox/consent/suppression models and migration files. Remove active SMS functionality and new card issuance; never reprice history. Add only the three push tables and their relations/indexes. Keep current Connect, financial observation/refund/return/reconciliation, authentication, calendar and quote-ownership boundaries.

The executable ACH fee is **scaled**, not a flat $9.95: $2.95 below $100; $3.95 from $100; $4.95 from $200; $5.95 from $300; $6.95 from $400; $7.95 from $500; $8.45 from $600; $8.95 from $700; $9.95 from $800 through the $5,000 business-subtotal maximum. Zero handling and all lower/upper boundaries remain unchanged. Custom Payments retain their $1 minimum. No financial rule or provider configuration was intentionally changed beyond rejecting new cards.

## Implementation

- Quote creation and Checkout start reject cards server-side, including existing card quotes. Stripe Checkout permits only `us_bank_account`. Active and dormant new-card fee calculations are removed. Card availability does not gate ACH readiness. Historical card rows still render/export and reconcile; existing historical CARD enums remain.
- Twilio sending, workers, inbound/status callbacks, manager preferences, consent controls, SMS delivery metrics and SMS receipt UI are removed. The Twilio package is replaced by `web-push`; other direct dependency versions and the resolution graph used by retained dependencies remain unchanged. Historical SMS tables/fields and records remain. `/sms-consent` is a noindex retirement notice, not an active consent form.
- Verified applied ACH PENDING/PAID webhook transitions atomically insert idempotent PushEvent rows under the existing Payment transaction/lock. No delivery occurs in a webhook or return page. A database outbox failure may cause a safe webhook retry; a browser/provider delivery failure cannot fail the payment webhook.
- Manager subscriptions use existing session/business authorization and origin checks. Strict bounded JSON, canonical provider-host HTTPS endpoints and valid P-256/encryption keys are required. A device endpoint cannot be overwritten across businesses. A manager can register up to ten active device endpoints; registration refreshes the endpoint for the current session. Endpoints/keys are private capability data and never returned in history or logs.
- Subscriptions bind to a particular manager, business and server session. Dispatch rechecks all ownership, session expiry/revocation, business activity and current payment state. Service-worker display independently rechecks the current browser session/business so queued messages do not appear after logout or under another business.
- Worker fanout excludes devices enrolled after an event. Events expire after 24 hours. Deliveries have unique event/device keys, conditional 60-second leases, bounded retries (five attempts), exponential backoff, stale-state suppression and 404/410 subscription deactivation. Delivery is at least once: a crash after provider acceptance can retry; stable notification tags replace visible duplicates. Acceptance is not proof of delivery.
- The install manifest reuses existing icons. The root service worker has **no fetch handler or page cache**. No private/payment pages are cached offline. Dashboard controls require an explicit permission action and handle denial, missing configuration and unsupported devices. History shows the latest 20 events and qualified acceptance status. Push messages contain no names, references, amounts or banking data. ACH success is explicitly not bank receipt of funds.

## Configuration and deployment prerequisites (approval required)

Do not change live settings or deploy as part of implementation verification.

1. Review the final diff and verification results. Recheck remote production and preserve any newer changes before integration. Do not include the dirty original checkout or unpublished SEO work.
2. Confirm backup/restore coverage. Apply the additive `20261122010000_manager_web_push` migration **before** deploying code that writes PushEvent. It creates three new tables; it does not drop/update/delete previous records or convert SMS queues.
3. Keep existing DATABASE_URL, Stripe keys/secrets/endpoints, charge architecture and `NEXT_PUBLIC_BASE_URL=https://rentfraylite.com` unchanged.
4. Generate a stable, environment-specific VAPID key pair securely. Set server-only `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:helpdesk@rentfray.com`. Never place the private key in NEXT_PUBLIC variables, source, logs or screenshots. Back up the key pair; rotation may require devices to disable/re-enable subscriptions.
5. Retire any old SMS scheduler/worker before cutover. Do not drain or convert the prelaunch SMS backlog. Retain old SMS evidence under the approved retention policy; no record disposition is applied by this release. Retiring Twilio console resources/secrets is a separate operator action after rollback planning, not an application migration.
6. Establish an authenticated schedule: empty-body **POST** `https://rentfraylite.com/api/internal/push/process` with `Authorization: Bearer <CRON_SECRET>`, typically once per minute. Preserve the existing CRON_SECRET if already configured; do not rotate shared job credentials blindly. Monitor non-2xx responses, queued age, retries/FAILED deliveries and expired device subscriptions. No deployed schedule is claimed verified here.
7. Inspect previously issued, still-open card Checkout URLs during cutover. Server-side ACH enforcement does not invalidate a card Session already hosted by Stripe. Any expiration/provider action requires separate authorization. Continue processing historical card webhooks and refunds.
8. After approval/integration, use the established Render deployment workflow; do not stack a manual deploy on an auto-deploy. Run safe public checks first. Do not assume code proves provider configuration or live push delivery.

Rollback: restore the prior application revision through the approved release process. Keep the additive tables and all records; do not drop them or reset the database. Pause the new push job when rolling back. Do not reactivate an old SMS job or release old SMS messages automatically. Review open card-session policy if reverting to a card-capable application. Keep previous provider settings/secrets unchanged during rollback.

## Controlled device test after approval

Use only the owner's consenting devices and synthetic/sandbox data. Install/sign in on the owner's phone (on iOS/iPadOS use Add to Home Screen, then open the installed app). Enable notifications explicitly. Verify subscription registration, denial/retry, disable, logout, expiry and account isolation. Trigger verified ACH processing/success **in an isolated provider sandbox or mocked environment**; first confirm the exact environment. Verify one qualified alert per transition, duplicate-event handling, history and a failed/expired subscription. Check that success wording never claims bank payout completion. Do not create a live charge merely to test push. Real device/provider delivery remains a separate manual check.

Browser/platform support follows the standards documented by [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) and the maintained [Web Push library](https://github.com/web-push-libs/web-push). Those documents do not prove this deployment's configuration or delivery.

## Verification evidence

Verification uses a credential-free source snapshot, scrubbed environment, mocked providers and network guards. PostgreSQL checks use a fresh loopback-only cluster whose host, port, role, database and data directory were independently verified before writes. No inherited database credentials or live provider operations are used. HTTPS/browser checks use a local certificate and the existing signed-ingress protocol, not weakened application origin rules.

Final results and the complete changed-file inventory are recorded below before handoff. Unpublished SEO copy must be updated separately for ACH-only acceptance and browser notifications before that release is ever published.

### Final results (2026-11-22)

- Clean installation and Prisma Client generation passed. Prisma schema validation passed. All 25 migrations applied to a fresh independently verified PostgreSQL cluster; migration status was clean. Seeded historical CARD financial and SMS receipt/outbox/suppression records survived the additive migration unchanged. Push tables began empty.
- Strict `tsc --noEmit --incremental false` passed. ESLint with `--max-warnings=0` passed. Next.js 16 production webpack build and standalone asset packaging passed.
- Across 76 independently executed regression suites: **2,889 passed, zero failed, 83 skipped** (2,972 total). Optional skips: checkout-attempt migration 1, manager mutation 33, recurring-charge preservation 39, Stripe transport 2, native report UI 4, transaction reporting 4. These require their separate original fixture configurations; they were not reported as passed. Separate independently verified PostgreSQL ACH/push integration run: **19 passed, zero failed**.
- ACH fee tests cover every integer cent from zero through the maximum, plus invalid amounts. New CARD quotes and stored CARD checkout attempts are rejected. Historical CARD webhook, refund, reconciliation and reporting fixtures remain covered.
- Push tests cover verified processing/success transitions, duplicate events, expiry, retries, concurrent leases, dead subscriptions, session/business isolation, renewed registration, endpoint/key validation, authenticated/origin-bound registration, fixed payloads and local encryption without a provider send.
- Packaged local HTTPS checks passed: homepage/setup/login, authenticated dashboard/history/QR, CSV/print, ACH review/fees, server CARD rejection, retired SMS endpoints, authenticated worker exclusion, manifest/icons/SW, private no-store/noindex headers, actual login/logout/revocation, notification denial/unsupported/missing-configuration states and registration/unregistration. Native subscription delivery was mocked; real service-worker installation was exercised. Zero live provider requests. Screenshots reviewed at 375px and 1440px; checks also passed at 320px.
- Unchanged production financial/authentication/calendar/ingress sources and historical schema/migrations were checked against production revision 88d9f1a. No destructive migration, payment-row deletion, production environment change, staging, commit, push or deployment occurred. The original checkout's HEAD/branch/status and all 366 recorded file hashes matched; all saved SEO release input hashes matched.
- Earlier harness-only failed runs were resolved and rerun. The repeated HTTPS run initially used an expired synthetic session; a fresh session was created only after re-verifying the disposable database identity, and the complete packaged run passed. Schema-only Prisma validation used the credential-free snapshot because the stricter unit guard deliberately blocks Prisma's dotenv/cache probes.

Evidence is stored outside Git in the isolated temporary verification directory: `C:\Users\acain\AppData\Local\Temp\rfl-ach-push-ews62sgv`. Key artifacts: `verification/final-suite-results.json`, `verification/database-isolation.json`, `http-browser/results.json`, `http-browser/dashboard-375.png`, `http-browser/dashboard-1440.png`, strict check/build logs and restricted migration evidence. Private fixture configuration, certificates, tokens and screenshots are not application release files.

### Approval-stage release commands (not executed)

1. From this worktree, inspect `git diff` and `git status --short`; recheck `git ls-remote origin refs/heads/fix/rfl-gregorian-era`. Integrate any newer production revision without overwriting it and rerun affected checks.
2. Stage only the files listed below, review `git diff --cached --check` and `git diff --cached`, then (only after approval) `git commit -m "feat: accept ACH only and add manager Web Push"` and `git push -u origin feat/rfl-ach-push`.
3. Integrate the reviewed feature through the repository's normal production-branch workflow without force-pushing. Confirm Render's current auto-deploy setting before updating that branch. Coordinate the additive migration, VAPID settings, retiring old SMS jobs and the new authenticated scheduler before one approved deployment.
4. Verify the deployed source revision and safe public/private-route checks. Complete the controlled consenting-device push test described above. Keep the previous application revision available for rollback and retain the additive tables.

### Complete changed-file inventory

`M` modified, `D` removed, `A` new. Only this feature worktree contains these changes.

- `M` `app/[accountCode]/RecurringCheckoutClient.tsx`
- `M` `app/[accountCode]/review/ReviewPaymentClient.tsx`
- `M` `app/admin/AdminDashboardClient.tsx`
- `D` `app/api/internal/sms/process/route.ts`
- `D` `app/api/manager/sms/route.ts`
- `M` `app/api/public/checkout/session/route.ts`
- `M` `app/api/public/checkout/start/route.ts`
- `M` `app/api/setup/route.ts`
- `D` `app/api/twilio/inbound/route.ts`
- `D` `app/api/twilio/status/route.ts`
- `M` `app/globals.css`
- `M` `app/layout.tsx`
- `M` `app/manager/dashboard/ManagerDashboardClient.tsx`
- `M` `app/manager/dashboard/page.tsx`
- `M` `app/manager/history/ManagerHistoryClient.tsx`
- `D` `app/manager/settings/PaymentSmsSettings.tsx`
- `M` `app/manager/settings/page.tsx`
- `M` `app/new-here/page.tsx`
- `M` `app/payment/success/page.tsx`
- `M` `app/privacy/page.tsx`
- `M` `app/security/page.tsx`
- `M` `app/setup/SetupAccountClient.tsx`
- `M` `app/sms-consent/page.tsx`
- `M` `app/terms/page.tsx`
- `M` `lib/adminDashboard.ts`
- `M` `lib/businessPaymentReadiness.ts`
- `M` `lib/checkoutConsent.ts`
- `M` `lib/checkoutPricing.ts`
- `M` `lib/customPayment.ts`
- `M` `lib/directPaymentFoundation.ts`
- `D` `lib/managementSms.ts`
- `M` `lib/operationalLogging.ts`
- `M` `lib/paymentReadiness.ts`
- `M` `lib/paymentResult.ts`
- `M` `lib/platformFees.ts`
- `M` `lib/registrationPhone.ts`
- `M` `lib/rflDirectPricing.ts`
- `D` `lib/smsConsent.ts`
- `D` `lib/smsDelivery.ts`
- `D` `lib/smsDeliveryReporting.ts`
- `D` `lib/smsNotifications.ts`
- `D` `lib/smsReceipts.ts`
- `M` `lib/stripeAccountProvisioning.ts`
- `M` `lib/stripeChargeReadiness.ts`
- `M` `lib/stripePaymentWebhook.ts`
- `M` `lib/validators.ts`
- `M` `lib/versionedCheckoutQuote.ts`
- `M` `next.config.ts`
- `M` `package-lock.json`
- `M` `package.json`
- `M` `prisma/schema.prisma`
- `D` `public/sms-consent/customer-opt-in-mobile.png`
- `D` `public/sms-consent/customer-opt-in.png`
- `D` `public/sms-consent/manager-consent-mobile.png`
- `D` `public/sms-consent/manager-consent.png`
- `D` `public/sms-consent/manager-off-mobile.png`
- `D` `public/sms-consent/manager-off.png`
- `M` `scripts/audit-rfl-financial-core.ts`
- `M` `scripts/verify-rfl-direct-stripe-sandbox.ts`
- `M` `tests/account-code-availability.test.mjs`
- `M` `tests/banking-welcome.test.mjs`
- `M` `tests/browser-request-security.test.mjs`
- `M` `tests/checkout-calendar-activation.test.mjs`
- `M` `tests/checkout-dispatch.test.mjs`
- `M` `tests/checkout-failure-resume.test.mjs`
- `M` `tests/checkout-lifecycle.test.mjs`
- `M` `tests/checkout-platform-fee.test.mjs`
- `M` `tests/checkout-quote-privacy.test.mjs`
- `M` `tests/checkout-resume.test.mjs`
- `M` `tests/checkout-retry.test.mjs`
- `M` `tests/connected-stripe-webhook.test.mjs`
- `M` `tests/custom-payment-browser-security.test.mjs`
- `M` `tests/custom-payment-ui.test.mjs`
- `M` `tests/custom-payment.test.mjs`
- `M` `tests/direct-activation-rollback.test.mjs`
- `M` `tests/direct-checkout-lifecycle.test.mjs`
- `M` `tests/direct-checkout-preparation.test.mjs`
- `M` `tests/direct-financial-reconciliation.test.mjs`
- `M` `tests/helpers/auth-harness.mjs`
- `M` `tests/helpers/checkout-financial-source.mjs`
- `M` `tests/helpers/checkout-harness.mjs`
- `M` `tests/helpers/connected-webhook-harness.mjs`
- `M` `tests/helpers/legacy-financial-guard.mjs`
- `M` `tests/instant-payout.test.mjs`
- `M` `tests/legacy-routing-metadata-cleanup.test.mjs`
- `M` `tests/legacy-signout-contracts.test.mjs`
- `M` `tests/management-billing-setup.test.mjs`
- `M` `tests/metadata-packaging.test.mjs`
- `M` `tests/model-aware-payment-readiness.test.mjs`
- `M` `tests/original-checkout-recovery.test.mjs`
- `M` `tests/password-recovery.test.mjs`
- `M` `tests/payment-architecture-snapshot.test.mjs`
- `M` `tests/payment-readiness.test.mjs`
- `M` `tests/payment-result.test.mjs`
- `M` `tests/registration-ui.test.mjs`
- `M` `tests/render-client-ip.test.mjs`
- `M` `tests/rfl-direct-pricing.test.mjs`
- `M` `tests/rfl-stripe-sandbox-verification.test.mjs`
- `M` `tests/sensitive-logging.test.mjs`
- `M` `tests/setup-cosmetic.test.mjs`
- `D` `tests/sms-consent-evidence.test.mjs`
- `D` `tests/sms-delivery-reporting.test.mjs`
- `D` `tests/sms-freshness.test.mjs`
- `D` `tests/sms-integration-browser.mjs`
- `D` `tests/sms-integration-repair.test.mjs`
- `D` `tests/sms-operability.test.mjs`
- `D` `tests/sms-payment-notifications.test.mjs`
- `M` `tests/stripe-charge-readiness.test.mjs`
- `M` `tests/stripe-checkout-transport.test.mjs`
- `M` `tests/stripe-direct-foundation.test.mjs`
- `M` `tests/stripe-payment-context.test.mjs`
- `M` `tests/stripe-provisioning.test.mjs`
- `M` `tests/stripe-webhook.test.mjs`
- `M` `tests/transaction-reporting-ui.test.mjs`
- `M` `tests/transaction-reporting.test.mjs`
- `M` `tests/versioned-checkout-quotes.test.mjs`
- `A` `app/api/internal/push/process/route.ts`
- `A` `app/api/manager/push/route.ts`
- `A` `app/manifest.ts`
- `A` `components/ManagerPushControls.tsx`
- `A` `components/ManagerPushHistory.tsx`
- `A` `docs/ACH_PUSH_IMPLEMENTATION.md`
- `A` `lib/pushDelivery.ts`
- `A` `lib/pushNotifications.ts`
- `A` `lib/pushSubscription.ts`
- `A` `prisma/migrations/20261122010000_manager_web_push/migration.sql`
- `A` `public/manager-sw.js`
- `A` `tests/ach-only.test.mjs`
- `A` `tests/helpers/ach-cleanup-boundary.mjs`
- `A` `tests/helpers/historical-card-fixture.mjs`
- `A` `tests/push-notifications.test.mjs`
