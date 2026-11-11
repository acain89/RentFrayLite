# Dormant Instant Payout foundation

Execution is hard-disabled in `lib/instantPayoutPolicy.ts`. No public API, server
action, worker, Stripe mutation transport or active dashboard option is installed.
The prepared dashboard component is unmounted and independently returns null.
Changing an environment variable, request or database row cannot activate it.
Standard payouts remain entirely controlled by Stripe, without an RFL speed fee.

## Quote contract

The selected amount is a **gross management budget**. The RFL fee is 2.5% of that
budget, rounded to the nearest cent with half-cent ties upward. There is no RFL
minimum fee. The provisional expected bank receipt is budget minus RFL fee:

| Selected | RFL fee | Provisional receipt |
| --- | --- | --- |
| $0.01 | $0.00 | $0.01 |
| $0.20 | $0.01 | $0.19 |
| $100.00 | $2.50 | $97.50 |

The calculator accepts positive integer cents within PostgreSQL Int capacity;
that storage bound is not a Stripe payout limit. Verified Stripe minimum,
maximum and daily limits must separately pass. Stripe payout costs are unknown,
not assumed zero. Any unverified or nonzero additional Stripe cost blocks the
current quote contract. No tenant payment or reconciliation amount is changed.

## Evidence and blocked integration

The pure evaluator accepts synthetic/server evidence, but cannot mint a trusted
reservation proof. The read-only Stripe adapter reads platform identity/balance,
connected identity/balance (expanded `instant_available.net_available`), and
external accounts. It never uses pending funds. It requires both ordinary settled
`available` funds and instant eligibility; this is deliberately stricter than
Stripe's immediate card-fund availability. Destinations must match the captured
connected account and USD/US scope, support `instant`, and be a verified bank
account or debit card. Incomplete destination pagination fails closed.

Account type alone is insufficient. Require the finalized Standard controller,
full onboarding, enabled charges/payouts, empty outstanding requirements,
authenticated platform and connected mode, and current permissions, full service
agreement, platform controls, account/platform limits, pricing and fee-failure
behavior. Those last facts have **no verified production adapter in this stage**.
The read-only adapter cannot issue an eligible proof until that gap is reviewed.
Lifecycle tests inject an explicitly synthetic proof adapter; production does not.

Stripe documents synchronous Instant Payout application fees using the Platform
Pricing Tool and per-destination `net_available` balances. The public payout
creation API does not document an `application_fee_amount` input. Do not add it
speculatively. Eligibility for platform pricing requires platform pricing control;
full-Dashboard account payout management requires appropriate Platform Controls.
Actual support for RFL's fee-payer-account/Stripe-losses Standard model remains
unverified. No account debits, charges, transfers or payout schedule changes are
implemented as an alternative.

## Journal and recovery

Apply the new additive migration only after separate authorization. It creates
one empty journal table, uniqueness for request/idempotency/provider identities,
amount/state checks, and restrictive ownership foreign keys. Existing Payment,
CheckoutSession, reconciliation and historical payout data are untouched. No
backfill occurs. Authorization session ID is a retained snapshot, not an FK to
revocable sessions. Manager/business ownership is retained by restrictive FKs.

Dormant reservation requires the existing origin guard, current management
session, existing manager-mutation locks, a fresh non-forgeable readiness proof,
and matching active business/Stripe connection. Same-ID retry returns the same
snapshot; changed terms fail. Different request IDs remain independent. There is
no execution claim/dispatcher in this stage, hence no provider-creation race.
Before activation, review cross-request balance reservation and global/account
limit coordination. Readiness alone cannot reserve a Stripe balance against
concurrent scheduled payouts or other Stripe clients.

States: RESERVED, SENDING, AMBIGUOUS, PENDING, PAID, FAILED, EXCEPTION. Only future
approved code may atomically mark SENDING and perform a single creation attempt.
The stable key is `rfl-instant-v1:<request-id>`. Never resubmit based on elapsed
time or Stripe's idempotency retention window. Recovery only retrieves/lists
payouts using immutable captured account/mode and validates exact metadata,
amount, destination and provider identity. Zero matches, multiple matches or an
incomplete list remain ambiguous, never authorization to recreate. Paginated or
older requests need controlled read-only investigation. Provider errors remain
retryable observations; no replacement is created. Concurrent observation writes
use a short row lock after network reads. Paid/failed observations cannot regress
to pending; a later failed payout can supersede paid. Exceptions need review.

The reserved RFL fee is an expectation, **not a collected fee**. Even a PAID payout
records `PAYOUT_FEE_COLLECTION_UNVERIFIED` until authoritative application-fee and
failure/reversal behavior is implemented and verified. No fee is collected here.
Failed/canceled/unconfirmed payouts do not establish earned RFL revenue.

## Activation prerequisites

1. Read-only verification of actual Standard-account payout permission, controls,
   destination, eligibility, currency and account/platform daily limits.
2. Stripe confirmation that the target model supports synchronous application-fee
   pricing, exact 2.5% gross-budget rounding with no minimum, all additional Stripe
   costs, and automatic fee reversal or another approved policy on failed payouts.
3. Separate authorization for sandbox configuration and controlled payout tests.
4. Reviewed one-shot dispatcher, bounded aggregate reservations, fresh confirmation
   and revalidation, payout webhook observations and application-fee reconciliation.
5. Management amount entry, fresh quote/confirmation and secure server endpoint,
   then explicit code-gate activation approval. No guaranteed arrival-time claims.

Official references:
- https://docs.stripe.com/connect/instant-payouts
- https://docs.stripe.com/connect/platform-pricing-tools
- https://docs.stripe.com/connect/manage-connected-account-payouts
- https://docs.stripe.com/api/payouts/create
