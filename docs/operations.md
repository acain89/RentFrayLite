# RentFrayLite operating runbook

Owner: start with the checklist and the matching incident card. Database/provider
actions belong to an approved operator under separate authorization; this guide
does not activate or execute them.

[Owner checklist](#owner-checklist) |
[Retention](#retention-confirmed-behavior-versus-owner-policy) |
[Backups](#backups-verify-existence-then-prove-restore) |
[Migrations](#migrations-inventory-and-safe-release-order) |
[Incidents](#incident-cards) |
[Monitoring](#minimal-monitoring) |
[Existing SMS detail](#sms-worker-operations)


## Owner checklist

This is a manual operating plan, not authorization to access production or run
commands. Owner = person accountable for RFL; operator = approved hosting/database
specialist. Use existing host/database/provider capabilities before adding anything.

Before launch, owner and operator must record: who handles incidents and the
backup contact; the approved release; how to pause new collections and SMS jobs;
acceptable data loss and recovery time; retention periods/access permissions;
backup/restore evidence; and alert destinations/review ages. None is approved by
this document. No RFL maintenance-mode switch, host backup guarantee or live
schedule has been verified. Agree the host's safe pause/resume method first.

During an incident, record UTC time, affected environment, safe correlation,
internal payment/attempt/event IDs and symptom in a restricted case. Do not paste
customer details, credentials, connection strings, cookies, callback URLs,
passwords or reset links into logs/tickets. Escalate money uncertainty immediately:
a missing response is not evidence that no charge or message was accepted.

Current baseline: direct issuance/creation/reconciliation stay OFF; the refund
migration remains unapplied; real provider/database/browser/deployment checks
remain prelaunch work. The instructions below are for separately authorized work.

## Retention: confirmed behavior versus owner policy

No automatic deletion is implemented or authorized here. Financial and security
retention periods require owner approval; this guide supplies no invented legal
duration. Preserve evidence while any payment, refund, dispute or incident is open.

| Records | Confirmed implementation | Owner rule / approval still needed |
| --- | --- | --- |
| Payment and immutable financial snapshots | Payment retains original amount, item/pricing/account/attempt identity and timestamps; parent deletion is restricted | Keep original facts and supporting provider evidence under the approved financial retention policy. Never rewrite history to fix totals |
| Refund, dispute and application-fee/correction observations | CustomerRefundObservation has scoped refund identity and restrictive Payment FK; dispute and application-fee facts also live in AuditLog/financial journals | Preserve each observation and original account/mode, separate principal from application-fee refunds/corrections. Missing costs/outcomes stay unknown, not zero or net profit |
| Webhook deduplication and AuditLog | AuditLog is the per-payment event ledger, dispute projection and exception/security evidence, not just disposable logging | **Never blanket-delete AuditLog.** Preserve event IDs, terminal dispute outcomes, fee observations and repair audits. Later retention must distinguish classes and retain live authentication-budget windows |
| SMS consent, STOP and delivery | Outbox retains recipient/transition, consent, body, claim and provider/callback identity; legacy receipts remain. STOP hashes have no expiry | Protect access/backups as sensitive data. Do not erase delivery/consent evidence or expire STOP to reenroll people. Hashes are pseudonymous, not anonymous. Approve periods before later cleanup |
| Checkout quotes / temporary payer details | Quotes retain payer/phone/consent/amount/provider facts. Expiry marks only qualifying unlinked quotes; it is not physical deletion | Define data-minimization periods. Never delete linked/ambiguous attempts based on age, FAILED or a missing response. Proven-unused expired quotes can be a separately reviewed later cleanup |
| Sessions and reset tokens | Sessions expire/revoke; expired presented sessions are removed. Reset tokens are hashed, credential-bound, 30-minute/single-use, with used/expiry fields; no general sweep | Expired data does not authorize access. Agree used/expired-grant retention; never delete active grants or unrelated verification types indiscriminately |
| Public/security rate budgets | Public counters remove bounded expired keys; login/recovery reservations use AuditLog | No extra cleanup job is essential. Preserve active rate windows and financial journals if housekeeping is later approved |

Business deletion already deactivates when any payment or checkout exists, so
settlement/history can survive. Do not bypass it with direct deletion.
Source: `app/api/admin/businesses/[businessId]/route.ts:26-51`.

Retention source boundaries: `prisma/schema.prisma:194-253,300-390,393-479,491-553`;
`lib/stripePaymentWebhook.ts:267-286,353-376`;
`lib/paymentReportingOutcome.ts:35-57`;
`lib/directFinancialReconciliation.ts:139-159`;
`lib/session.ts:97-169`; `lib/passwordRecovery.ts:31-54`;
`lib/managementLoginThrottle.ts:3-18`; `lib/publicRequestBudget.ts:23-28`.

## Backups: verify existence, then prove restore

**Unverified:** actual host, backup/PITR (restore to a chosen time, if offered) features, frequency, retention, success,
encryption, restore permissions and recovery time. A source repository, historical
SQLite file, migration directory or enabled-backup checkbox is not a proven backup.

Owner asks the existing database operator to:

1. Identify the exact PostgreSQL database/environment and approved backup owner
   without exposing `DATABASE_URL`. Confirm whole-database schema/data/migration
   history coverage, protected storage, encryption/access controls, restore
   permissions and whether copies survive loss of the primary instance.
2. Record last completed backup UTC time, backup/restore-point reference,
   available older restore points, schedule/retention and failure notification
   recipient. Obtain completion evidence from the actual host, not an assumed
   product feature. If missing or unknown, hold launch and resolve.
3. Compare schedule/restore-point coverage with approved acceptable data loss.
   Verify access/keys through the approved secret store; never copy secret values
   into evidence.
4. Restore an approved actual backup into a **new isolated private PostgreSQL
   database**, not over production. Confirm the destination separately first.
   Keep provider egress blocked and collection, email, SMS jobs and financial
   execution disconnected/inactive. Restored personal information stays protected;
   do not export customer rows to tickets.
5. Compare schema/migration ledger and restricted aggregate/integrity checks:
   original payments/amount snapshots, ownership/FKs, refunds, dispute/event
   journals, correction keys, SMS consent/STOP/claims and auth data. Use synthetic
   data for application drills. Verify safe behavior against isolation without
   provider operations or notification replay.
6. Record backup reference, release/schema versions, isolated destination label,
   restore duration, check results and operator approval. Compare measured time
   to the approved recovery objective. Approve drill-environment disposal and
   evidence retention through normal controls; no cleanup is executed here.

Repeat a restore drill before launch and after material backup/schema changes,
then at an owner-approved interval. No provider-specific guarantee, automatic
rollback or zero data loss is promised. Reuse host backups/alerts if sufficient;
do not buy a disaster-recovery service by default.

## Migrations: inventory and safe release order

Source uses PostgreSQL (`prisma/schema.prisma:5-8`,
`prisma/migrations/migration_lock.toml`). Current ordered inventory has 24 SQL
migrations. Names are an inventory, **not commands to replay on an existing
database**. Already-applied migrations must not be edited/reapplied.

```text
20260715212807_rfl_initial_schema
20260715222401_add_auth_sessions
20260715222951_unique_manager_email
20260716040619_add_setup_progress
20260716184659_recurring_charge_billing_cycles
20260716191529_expanded_recurring_late_fees
20260719034157_add_checkout_sessions
20260719190611_add_sms_sending_status
20260722042750_add_one_time_charges
20260723014542_add_checkout_session_one_time_charge_ids
20260821230000_harden_rfl_payment_uniqueness
20260823014500_simplify_rfl_recurring_only
20260823033000_remove_one_time_charges
20261002120000_add_payment_architecture_snapshots
20261025120000_add_business_billing_calendar
20261025180000_independent_checkout_attempts
20261025200000_add_custom_payments
20261025220000_stripe_direct_foundation
20261026010000_direct_financial_reconciliation
20261026020000_payment_sms_outbox
20261026030000_management_password_recovery
20261026040000_instant_payout_foundation
20261026050000_public_request_budgets
20261105010000_customer_refund_observation
```

Owner hands the release to the approved database operator; this guide intentionally
does not give paste-and-run database commands to a nontechnical owner.

1. Identify release/source hashes, correct target and matching pinned dependencies/
   Prisma Client. Inventory `prisma/migrations/`. Operator compares target migration
   ledger, checksums and actual schema with source, identifies pending/failed/
   divergent entries, and reviews historical destructive changes. Generated
   Client/build success does not mean applied.
2. First prove the reviewed pending sequence on a separately authorized disposable
   PostgreSQL database, including constraints, concurrency and preserved history.
   Do not run all migrations blindly on an existing live database.
3. Confirm tested backup/restore and approved maintenance/stop plan. Pause new
   collection/SMS scheduling through agreed existing host controls before
   incompatible writes; preserve event recovery evidence. Only a separately
   approved deployment applies reviewed pending migrations in source order.
4. **Refund gate:** `20261105010000_customer_refund_observation` is still unapplied
   in the accepted baseline. It adds scoped refund observations/checks/FK
   (`prisma/migrations/20261105010000_customer_refund_observation/migration.sql:1-27`).
   Dispatch always reads it (`lib/smsDelivery.ts:64`); results/reports also select
   it. Verify earlier SMS/recovery/financial migrations too. Do not enable current
   readers or worker against an incompatible schema.
5. Verify completion, ledger/checksums/schema and safe isolated release checks
   before switching/enabling the matching app/jobs. Direct stays OFF. No migration
   is part of `npm run start`; a build is not migration/provider verification.

**Stop on failure:** failed migration status/command, schema/checksum mismatch,
missing required table/column/constraint or new storage failures blocks release.
Freeze the change; preserve safe error category, release and migration identifiers.
Operator inspects actual partial state and plans recovery. Do not blindly rerun,
edit migration history, mark failures applied, reset/seed schema or assume DDL
can all be reversed. Revert an app only if DB compatibility is established;
otherwise remain paused. Restoring a backup also requires incident reconciliation:
external payments/messages may have progressed after it.

No database/migration/restore command is executed or authorized by this
documentation task. Production migration requires separate target, backup,
reviewed-sequence, maintenance-plan and operator approval.

## Incident cards

Use approved operator/provider access only after separate authorization. Keep
existing webhooks available where safe while stopping new collection during a
storage/identity incident; never invent a maintenance flag or delete business data.
If money state is uncertain, tell the affected person not to submit another
payment until the original has been checked.

### 1. Stripe webhook delivery failures

- **Recognize:** webhook non-2xx, `stripe_processing_failed`, or unresolved
  `STRIPE_WEBHOOK_EXCEPTION`. A local log cannot detect an event that never arrived.
- **Inspect:** correct environment/account/mode and platform versus connected
  endpoint, safe category/event reference, original Payment/Checkout and migration/
  DB health. Provider delivery history requires authorized provider access.
- **Do not:** fabricate/sign substitute events, bypass ownership, mark PAID,
  clear deduplication rows or create a replacement payment.
- **Recover/escalate:** operator fixes the cause, then requests genuine original
  event redelivery where provider-supported; verify local journal/status and
  exception resolution. Escalate unknown ownership or conflicting evidence.

### 2. ACH remaining pending

- **Recognize:** processing age exceeds the owner's review threshold, not a
  promised settlement deadline.
- **Inspect:** original `pendingAt`, Payment/attempt and provider Intent/Charge
  identity, correct account and later success/failure/return events.
- **Do not:** turn PENDING into FAILED/PAID by age or ask for another payment.
- **Recover/escalate:** authorized operator checks original provider outcome/
  delivery, restores signed observations where supported, or escalates processing
  uncertainty. Preserve original timestamps/history; do not promise settlement.

### 3. Ambiguous Checkout creation

- **Recognize:** lost response, missing provider binding, or
  `CHECKOUT_OWNERSHIP_NOT_PERSISTED`. FAILED/expiry/old key alone proves nothing.
- **Inspect:** the one original Payment, `checkoutAttemptId`, reservation and
  original session evidence under captured business/architecture/account/mode,
  amount/currency/method. Do not substitute today's Stripe connection.
- **Do not:** replay create to find out, clear IDs, replace the payment, or search
  by payer/unit/month and attach an arbitrary candidate.
- **Recover/escalate:** follow [original Checkout recovery](original-checkout-recovery.md).
  Its default preview still accesses DB/provider and needs authorization.
  Apply is a separate approval; only verified original identity may be restored.
  Conflicts/no authoritative session stop and escalate without another charge.
  If original local rows were lost in a restore, bounded identity repair cannot
  recreate that history; stop and escalate rather than create another charge.

### 4. Refund/dispute observation failures

- **Recognize:** relevant webhook/DB errors, pending/unknown/conflicting refund or
  dispute presentation, or absent expected observation.
- **Inspect:** original scoped charge/refund/event IDs, refund migration/table,
  CustomerRefundObservation and dispute/application-fee journals. Preserve full/
  partial/pending/failed refunds and active/won/lost distinctions.
- **Do not:** rewrite original paid amounts/snapshots, infer missing facts as zero,
  equate application-fee refund with principal returned, or initiate a refund/
  transfer/correction to ?repair? reporting.
- **Recover/escalate:** operator fixes schema/routing/ownership/observation cause
  and requests supported original signed redelivery. Verify durable observations,
  not just HTTP 200. Escalate financial conflicts; no automatic principal reimbursement.

### 5. SMS backlog or delivery failures

- **Recognize:** missed job, growing due age/count, FAILED/AMBIGUOUS growth, or
  `sms_worker_failed`/callback failures. Use existing job responses only when the
  schedule is intentionally active; POST is not a harmless health probe.
- **Inspect:** backlog versus touched-record counts, eligible due age, `nextAttemptAt`,
  claims/provider references, consent/STOP/preferences, current payment freshness,
  canonical sender/callback configuration and schema. Use `X-RFL-Correlation`
  with safe logs; never paste callback query tokens.
- **Do not:** treat SENT as delivered or failed SMS as failed rent; clear STOP,
  bypass management OFF, reset claims, requeue FAILED/AMBIGUOUS or bulk resend.
- **Recover/escalate:** fix cause; existing safe queued retries remain bounded.
  On a subsequent worker run old SENDING claims become AMBIGUOUS, not retried.
  Investigate original message/callback evidence with authorization. Payment-result
  confirmation is the fallback; terminal/uncertain messages require escalation.

### 6. Password-recovery email failures

- **Recognize:** unavailable page/link, missing mail, or
  `PASSWORD_RESET_EMAIL_UNAVAILABLE` audit. Generic request confirmation is not
  evidence that an account exists or a message was delivered.
- **Inspect:** readiness by names only: `NEXT_PUBLIC_BASE_URL`, `RFL_EMAIL_API_URL`,
  `RFL_EMAIL_API_TOKEN`, `RFL_EMAIL_FROM`; safe audit and authorized gateway records.
  RFL has no confirmed-inbox-delivery journal; 2xx means acceptance under its contract.
- **Do not:** log/forward reset links/passwords/credentials, probe by creating
  repeated grants, bypass throttles, or assume the sender's key is valid from syntax.
- **Recover/escalate:** operator verifies compatible gateway/sender and delivery.
  Once fixed, user may request a new link within existing limits. An uncertain
  send revokes its new token; older valid links remain usable. If not operational,
  leave delivery unconfigured and use existing authenticated administrator-assisted
  credential change after identity verification. See [password recovery](password-recovery.md).

### 7. Database outage or migration failure

- **Recognize:** availability/storage failures, `database_failed`, failed migration
  status or missing expected schema.
- **Inspect:** existing host health/access/limits, approved release versus schema,
  migration/backup evidence and safe error/correlation, without connection strings.
- **Do not:** seed/reset, edit the ledger, blindly retry DDL or restore over production
  without an approved plan. A file named ?backup? or a passing build is insufficient.
- **Recover/escalate:** pause new collection and external SMS jobs through agreed
  host controls; operator restores connectivity or follows the isolated restore/
  migration stop plan. After any restore, identify post-backup external charges/
  messages/events before resuming: old local QUEUED/CREATED data may already have
  been accepted externally. Preserve/reconcile original identities, recover
  genuine events, verify/revoke restored session/reset grants under the approved
  security plan, and approve resumption. Also review post-backup manager/admin
  revocations and credential changes: a restore can reinstate old access/passwords.
  Re-establish post-backup consent/STOP/preferences or keep affected sends paused;
  absence from an older backup is not affirmative consent. Never blindly replay
  restored queues.

### 8. Suspected duplicate payments

- **Recognize:** report of two debits/holds, or multiple apparent payment records.
  Similar amount/payer/date alone is not proof; a hold and settled charge can differ.
- **Inspect:** each original payment/attempt and distinct provider session/Intent/
  Charge IDs, captured account/mode, settlement and refund/dispute observations in
  restricted authorized review. Preserve both records and evidence.
- **Do not:** merge/delete history, move provider IDs between payments, collect
  again, or automatically refund/transfer/reconcile to balance the screen.
- **Recover/escalate:** stop new collection for the affected case; qualified financial
  owner confirms whether distinct money movements occurred and approves any later
  resolution separately. Restore only supported original observations; never create
  another charge to test the result.

## Minimal monitoring

Use existing hosting/database/provider logs and alerts, not a new RFL dashboard.
Owner assigns a recipient, review cadence and escalation age to each signal; no
settlement guarantee or automatic financial action follows from an age threshold.

| Essential signal | Existing source / owner action |
| --- | --- |
| Application available | Existing host availability check or safe public GET `/security`; this alone does not prove DB health |
| Database connectivity | Host DB metrics and sanitized `database_failed`/application 5xx; operator investigates |
| Webhook errors | Host non-2xx/`stripe_processing_failed` plus unresolved exception age/count; provider alerts are needed for never-arrived events |
| Pending/ambiguous payment | Restricted read-only original PENDING age and unresolved Checkout/ownership review; no payment-state changes by age |
| SMS delay/failure | Approved job's backlog age/count, FAILED/AMBIGUOUS populations, missed runs and safe correlations. Never invoke worker merely to inspect health while inactive |
| Email failure | Unavailable recovery UI and `PASSWORD_RESET_EMAIL_UNAVAILABLE` audit; authorized gateway evidence, not generic HTTP confirmation |
| Financial correction exceptions | Restricted `DirectFinancialReconciliation` EXCEPTION/WAITING_DATA reason/age review only; executor stays OFF |

No dedicated public health endpoint is documented. If a useful signal is absent
from the existing UI, start with an approved read-only operator check, not a new
polling service. Use platform access controls; omit auth headers, customer/provider
payloads, callback query tokens and reset bodies from ingress/scheduler logs.
Do not enable raw DB query/provider debug logging. Native alert capabilities and
actual destinations remain unverified until configured/tested separately.

Existing safe application diagnostics use `RFL_OPERATION_FAILED`. Worker/callback
hashes are correlation references, never authority to retry a message or payment.
`DirectFinancialReconciliation` and financial journals may contain incomplete data;
never label gross fees or modeled/unknown costs as verified net revenue.

## Owner decisions and deferred work

**Manual owner decisions before launch:** incident/backup owner and backup contact;
approved financial/security/SMS/quote retention and access/log policy; acceptable
data-loss/recovery windows; tested backup method/restore permissions; release/
migration maintenance and stop/resume process; job runtime/cadence and alert owners;
provider sender/email contract and delivery evidence; browser/print checks. Use
the existing secret store by variable NAME, never record values here.

**Can wait until justified after launch:** bounded cleanup of approved expired
sessions/reset tokens or proven-unused quotes; archive/deletion automation;
SMS reenrollment/resend UI; email queue; extra monitoring services/dashboards;
automated payment recovery, financial schedules or elaborate disaster recovery.
Deferred work is not activation approval; financial gates stay OFF until separately
approved. Policies and a proven backup/restore process cannot be deferred as met.
No deletion machinery, new worker or scheduling service is created by this guide.

Source checks establish application behavior, not live capabilities. Backup/PITR,
deployed scheduler/alerts, provider delivery/redelivery features, PostgreSQL
compatibility/load and real browser behavior remain unverified. Keep Stage 6
IMPLEMENTING until final integrated verification; provider/database/browser/
deployment prelaunch gates remain even after local implementation sign-off.

## Operator source reference (no scripts executed)

- `lib/smsDeliveryReporting.ts:94-107` and
  `app/api/internal/sms/process/route.ts`: backlog fields and protected POST.
- `lib/smsDelivery.ts:32-93,98-138`: claims, safe retries, freshness, signed callbacks/STOP.
- `lib/passwordResetEmail.ts` and `lib/passwordRecovery.ts`: readiness, acceptance,
  expiry/revocation; `docs/password-recovery.md` is the detailed recovery reference.
- `lib/stripePaymentWebhook.ts:215-223,267-286,353-376`: exception and dedup ledger;
  `lib/customerRefundObservation.ts` and `lib/paymentReportingOutcome.ts`: observations.
- `lib/directFinancialRunner.ts:9-19`, `lib/paymentArchitecturePolicy.ts:1-24`:
  disabled execution, not a job to enable.
- `scripts/recover-original-checkout.ts:10-28`: checked default-preview flags and
  separate apply behavior; follow `docs/original-checkout-recovery.md`.
- `scripts/audit-rfl-payment-duplicates.ts` and `scripts/check-connected-businesses.ts`
  access DB; ?audit/check? does not mean safe to run without operational approval.
  `scripts/verify-rfl-direct-stripe-sandbox.ts` can create provider PaymentIntents;
  never use it as a routine health check.
- `prisma/seed.ts:13` deletes administrator access: never seed as recovery/startup.
  `package.json:9-21` / `README.md:25-27` describe standalone startup and outstanding
  deployment requirements, not a configured backup/scheduler service.

## SMS worker operations

This procedure describes existing interfaces. It does not install or activate a
schedule, authorize provider access, apply migrations or activate direct charges.

### Before enabling delivery

Verify the release's applied migration history and matching Prisma Client in an
authorized disposable PostgreSQL environment. In particular, the unapplied
20261105010000_customer_refund_observation migration is required: dispatch reads
refund observations before sending. Do not run seeds as deployment or recovery.

Use approved secret injection for CRON_SECRET, TWILIO_ACCOUNT_SID,
TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER. NEXT_PUBLIC_BASE_URL must be the
canonical public HTTPS origin. Never put secret values in this document,
commands, tickets or URLs. Verify the fixed U.S. sender's provider permissions
and any required registration, signed status callbacks and inbound STOP/HELP
configuration before separately authorized real delivery tests.

### Invocation (not activated)

The existing endpoint accepts HTTPS POST /api/internal/sms/process with
Authorization: Bearer <secret injected by the scheduler>. It accepts no batch
override. Missing/wrong authorization returns 401 before reporting or dispatch.
Do not place the secret in a query string or capture authorization headers.

Use one existing hosting/OS scheduler capable of that POST. Document its owner,
cadence, request/runtime limits, failure alerts and how to pause it. Select cadence
after measuring worker duration and peak queue drain. Twenty notifications are
processed sequentially, with up to eight seconds per provider request and
additional DB lock/transaction waits. A one-minute interval is only a starting
proposal subject to host capacity; overlap is protected by durable claims but
can waste capacity. Do not add a second queue/daemon by default. Keep all direct
issuance/creation/reconciliation gates OFF; never schedule the financial runner.

### Response and alert interpretation

Existing top-level counts/results describe deduplicated current outcomes for
records touched by this invocation, including legacy aliases. They are not
messages delivered by the current request. SENT means accepted, not DELIVERED.

The separate backlog object is a read-only RepeatableRead outbox snapshot after
processing. It includes:
- asOf: timestamp used to evaluate due work.
- counts: current outbox identities by shared delivery state, including unknown.
  STOP reasons project as SUPPRESSED. No legacy aliases or attempt duplicates.
- eligibleQueuedCount: raw QUEUED rows with nextAttemptAt <= asOf, exactly the
  worker's claim eligibility. Consent, STOP, preferences and payment freshness
  must still pass dispatch checks; this is not a promise that they will send.
- oldestEligibleQueuedAt and oldestEligibleQueuedAgeSeconds: original createdAt
  of the oldest due queued row, and whole elapsed seconds (clamped at zero).
  Future retries do not contribute; no eligible row yields null timestamps/age.
  Age measures time since enqueue, not time since retry became due.

Counts and oldest due age share one DB snapshot. Reporting fetches only aggregate
status/reason/count/time values, never recipients, bodies or callback tokens.
It does not send, enqueue, retry or repair records. Interrupted SENDING claims
recovered as AMBIGUOUS appear in global backlog counts even when not selected in
this request; the count is a current population, not a recovered-this-run total.

Inspect HTTP failures, missed scheduled runs, due backlog age/count and durable
FAILED/AMBIGUOUS growth using existing platform alerts/logs and an assigned
operator. Choose review ages after measuring the deployment; 200 alone does not
prove successful delivery. Do not alert on normal consent/stale suppression as
a send failure. A failed report after dispatch may still follow accepted sends:
never blindly replay messages or clear claims because that request returned 500.

Unexpected failures log RFL_OPERATION_FAILED with sms_worker_failed,
sms_status_callback_failed or sms_inbound_callback_failed, an allowlisted
category and SHA-256 correlation of a server-generated reference. The same safe
hash is returned in X-RFL-Correlation for unexpected 500/503 responses. Caller
headers, phone/body, credentials, exception messages/stacks and callback URLs
are never used as references. Invalid callbacks remain generic 403 without
logging their content. Keep callback query strings/bodies and authorization
out of ingress/proxy/scheduler logs too.

### Failure and recovery boundaries

Existing pre-send/429 retries remain bounded at three attempts. Expired SENDING
claims become AMBIGUOUS after two minutes, never automatically requeued.
Definitive failures are not automatically resent. STOP and management OFF remain
authoritative; START does not clear suppression or replay old consent.

For ambiguity, preserve the original message ID, claim and callback evidence.
Investigate only through separately authorized provider/DB access; never bulk
reset statuses, erase leases, reissue payments or create replacement messages.
The payment result remains the receipt fallback. Pause the external SMS schedule
during restore/incidents: restored QUEUED state may predate provider acceptance.
Keep financial/consent/STOP journals and follow original-checkout-recovery.md for
payment identity issues, not a financial executor.

Real Twilio delivery/callbacks, PostgreSQL query cost/concurrency, scheduler
runtime/alerts and deployed ingress privacy remain prelaunch evidence gates.
