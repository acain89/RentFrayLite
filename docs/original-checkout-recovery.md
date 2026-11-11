# Original Checkout recovery

This is a bounded, operator-only identity repair. It does not create a payment or
Checkout, change payment status, settle funds, issue cookies, send a receipt,
refund, transfer, or execute a correction. Direct issuance, creation and financial
execution stay OFF. There is no public recovery endpoint or background worker.

Do not run this procedure against a provider or database without separate
operational authorization. Package 3 verification uses offline mocks only.

1. Identify the one original attempt using internal business ID, Payment ID and
   `checkoutAttemptId` / CheckoutSession ID. Inspect the existing safe webhook
   exception classifications, especially `CHECKOUT_OWNERSHIP_NOT_PERSISTED`, and
   the original reservation. A timeout, FAILED, local expiry, missing response or
   old idempotency key is not evidence that Stripe created nothing. Preserve the
   original `rfl-payment-<Payment ID>` key; never replay create to discover its result.
2. In the approved Stripe environment/account, locate the original create request
   by its original key/internal IDs in restricted request logs. Obtain the exact
   `cs_...` returned by that request. If only a `pi_...` is known, follow its
   original Checkout association/request evidence to the exact session; do not
   attach a PaymentIntent alone or search by payer, phone, unit or billing month.
   If there is no authoritative original session, multiple candidates, inaccessible
   history or conflicting evidence, stop and escalate without another charge.
3. Confirm the original platform account and mode from trusted operational
   evidence. Legacy destination sessions live on the platform; direct sessions
   live on the captured connected account. Do not substitute today's business
   Stripe connection. Review stored model/version/destination/account snapshots,
   original business/attempt/payment metadata and client reference, USD total,
   method, application fee and (when an Intent exists) destination/direct charge
   configuration. Compare immutable amounts and line items locally. Missing
   historical ownership is a blocker, not permission to backfill it.
4. On an authorized maintenance host with the existing secret injection and
   least-privilege operational access, identify an existing active ADMIN session
   for attribution and revocation/expiry checks. The command requires host access
   to RFL's database and provider reader; the session ID is not a remote login or
   bearer token. Do not copy tokens, hashes, keys, provider payloads, tenant data or
   Checkout URLs into commands, tickets or logs. Supply only internal/object IDs:

   ```text
   node --import tsx scripts/recover-original-checkout.ts --admin-session <internal-admin-session-id> --business <business-id> --payment <original-payment-id> --attempt <original-checkout-id> --session <original-cs-id> --platform <original-platform-account-id> --mode <test-or-live>
   ```

   This defaults to a read-only preview. The helper independently checks actual
   platform/mode, original account scope, metadata, currency, amount and method.
   Intent/Charge facts are checked when present. An open session without an
   Intent can establish only its scoped session identity and captured local
   architecture; eventual financial configuration must still pass the signed
   webhook's independent Intent/Charge checks. Preview does not certify payment.
5. Review `VERIFIED_PREVIEW` and its minimal IDs/statuses against the approved case.
   Re-run the same command with `--apply` only after the identity repair itself is
   authorized. It re-reads provider facts, reauthorizes the ADMIN session under
   locks, and restores only missing session pointers and, if necessary, the
   Payment's unique original checkout link. It retains original status, dates,
   amounts, descriptions, failures, refunds, consent, architecture and financial
   journals. It records one atomic allowlisted audit. Matching duplicates are
   idempotent; a different existing identity, changed financial/history snapshot,
   revoked/expired operator or failed audit causes a block/rollback. Deactivated
   businesses may receive this history repair; collection remains disabled.
6. Reinspect local pointers and the `ORIGINAL_CHECKOUT_IDENTITY_VERIFIED` audit.
   For completed/expired sessions or ACH processing, wait for the existing signed
   webhook/current-state handler. Where Stripe supports it, an authorized operator
   may request redelivery of the original relevant event to the existing correct
   platform/connected webhook destination. Verify local durable processing/audit
   and exception resolution. Never fabricate an event, bypass signatures, mark
   PAID manually, or treat event delivery alone as settlement proof.
7. An open failed-card session may be retried only through the existing original
   browser-authorized resumption path after its current provider facts pass.
   This repair does not provide a collection URL or establish a missing browser
   binding. If original browser access is unavailable, escalate; do not create a
   replacement attempt or share a secret Checkout link to bypass authorization.

An exception or provider read failure returns one fixed safe error. Keep the
original records and retry only inspection of the same verified identity after
the cause is understood. Never clear IDs, reset to CREATED, alter timestamps or
pricing, erase a reservation/lease, grant new consent, or infer safety from age.

Direct correction uncertainty is separate. Preserve the existing journal's
application-fee ID, reserved operation/key, refund ID and lease. Existing recovery
logic checks original fee-refund debit/credit observations and never blindly
repeats an ambiguous POST. Do not invoke the reconciliation executor from this
procedure; keep it disabled. Missing/conflicting credits or provider history need
authorized read-only investigation and escalation, never an automatic principal
refund, transfer, reimbursement or second correction.

Real Stripe object/account shapes, supported redelivery, restricted-key permissions,
database locks/authorization races and deployment/runtime tooling remain separate
verification requirements. A successful mock or preview is not production sign-off.
