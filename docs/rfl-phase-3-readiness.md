# Phase 3: model-specific Stripe readiness

This phase does not activate pricing, direct charges, reconciliation, refunds or payouts. A READY result describes Stripe eligibility only, not permission to create payments. Business/tier authorization and a future rollout gate are still required. Existing checkout uses `getLegacyBusinessPaymentReadiness`; manager/setup callers retain the compatible `getBusinessPaymentReadiness` alias.

## Evidence and limits

**A — Repository facts.** Current onboarding uses Accounts v1 `type: "express"`, US, and requests only `transfers`. Current readiness reads the connected account, platform account and platform default payment-method configuration. It requires completed onboarding, no current restrictions, connected payouts/transfers, same country, platform charges, card and ACH availability, known key mode and live mode in production. Connected-account `charges_enabled` is intentionally not a legacy requirement. Business readiness additionally requires valid active business/plans/billing/charges, account code, completed setup and selected-tier availability. Historical payment account ownership is preserved by Phase 2 snapshots; Phase 3 never rewrites them.

**B — Installed types.** Installed `stripe` is 20.4.1; `lib/stripe.ts` pins API `2026-02-25.clover`. Accounts v1 create supports `controller.fees.payer: account|application`, `controller.losses.payments: stripe|application`, `controller.requirement_collection: stripe|application`, and `controller.stripe_dashboard.type: full|express|none`. Account responses additionally permit fee payer `application_express|application_custom`. Capabilities include `card_payments` and `us_bank_account_ach_payments` with active/inactive/pending states. PaymentMethodConfiguration exposes `active`, `livemode`, `card.available`, `us_bank_account.available`, `application`, `parent` and `is_default`. Accounts v1 has no `livemode` property.

**C — External verification still required.** No current account was retrieved for this phase. Platform approval, actual controller values, capability eligibility, effective connected-account payment methods, account read authority, pricing and real charge/balance-transaction behavior require sandbox/Dashboard/API verification. Repository fixtures are not proof of real Stripe state.

**D — Unsafe inference.** Express, a stored generic `readyForLive`, platform payment-method availability, transfer capability, a successful test charge, or an account ID alone cannot prove direct eligibility. Stripe warns sandbox payments can succeed without enforcing capabilities. Stored Phase 2 ownership is not a direct-configuration snapshot.

## Internal contract

`evaluateStripeChargeReadiness` has a discriminated `LEGACY_DESTINATION` / `DIRECT` input. Legacy evaluation delegates unchanged to `getStripeReadinessReasons`. Direct requires a connection ID and `DirectReadinessEvidence`: a fresh server-authenticated Account response, its authenticated request mode, and effective method availability bound to that connected account and mode. No network reads, database writes, cached READY boolean, pricing imports or payment operations occur in the evaluator. No new schema or migration is necessary.

The caller must supply evidence from trusted server reads, never client input or legacy cached flags. A future collector must retrieve the exact connected account in the intended environment, resolve this platform's effective connected-account configuration (including parent/application selection when applicable), and keep the request context alongside the response. `directPaymentMethodsFromConfiguration` adapts a resolved response; its account ID argument must come from that authenticated read context. It does not prove ownership or choose among configurations. Configuration availability is the SDK's effective capability/display result. Missing/ambiguous reads must be null. Do not reuse evidence across accounts, modes or later payment attempts without refreshing it. No collector or manager UI is wired in this phase, so existing accounts remain DIRECT unverified until those facts are supplied.

The initial RFL target policy is the explicitly documented Standard-equivalent controller tuple: fee payer `account`, losses `stripe`, requirement collection `stripe`, dashboard `full`. This is a supported conservative RFL policy, not a claim that every Stripe direct-charge integration needs a full dashboard. RFL also requires this platform's `controller.is_controller=true` and `controller.type=application`, US/USD, submitted details, enabled charges and payouts, active card and ACH capabilities, and effective card/ACH availability. Payouts and US/USD are RFL rollout requirements, stricter than the ability to create a charge in isolation. Current requirements must have no disabled reason, currently due, past due, pending verification or errors. Future requirements not yet due do not block this snapshot; refresh is necessary as requirements change.

Direct evaluation never checks transfers. Stripe currently documents requesting both `card_payments` and `transfers` to obtain card capability; that account-creation dependency does not justify independently requiring active transfers for direct charging. Verify the actual requested capability combination in sandbox.

Results have stable model, ready, status (`READY`, `NOT_READY`, `UNVERIFIED`) and reasonCodes. `classifyStripeChargeReadiness` returns `LEGACY_ONLY`, `DIRECT_ONLY`, `BOTH` or `NEITHER`, retaining both results so NEITHER and LEGACY_ONLY can distinguish missing evidence from incompatibility. Missing required evidence always includes `DIRECT_CONFIGURATION_UNVERIFIED`, even if another definite blocker is also present.

Direct reason codes: `NO_CONNECTED_ACCOUNT`, `ACCOUNT_MISMATCH`, `MODE_MISMATCH`, `STRIPE_CONFIGURATION`, `LIVE_CONFIGURATION_REQUIRED`, `CHARGES_NOT_ENABLED`, `PAYOUTS_NOT_ENABLED`, `DETAILS_NOT_SUBMITTED`, `DIRECT_REGION_UNSUPPORTED`, `ACCOUNT_DISABLED`, `REQUIREMENTS_INCOMPLETE`, `CARD_NOT_ENABLED`, `CARD_PENDING`, `ACH_NOT_ENABLED`, `ACH_PENDING`, `DIRECT_CONTROL_UNAVAILABLE`, `DIRECT_CONFIGURATION_UNVERIFIED`, `DIRECT_CONFIGURATION_INCOMPATIBLE`.

Legacy codes remain `STRIPE_CONFIGURATION`, `LIVE_CONFIGURATION_REQUIRED`, `STRIPE_UNVERIFIED`, `STRIPE_MISSING`, `STRIPE_ONBOARDING`, `STRIPE_RESTRICTED`, `STRIPE_CHARGES`, `STRIPE_DESTINATION`, `STRIPE_PAYMENT_METHODS`. Existing business/setup codes are unchanged.

## Exact future account-creation delta (not applied)

Keep contact/business metadata and US country. Replace `type: "express"` with the explicit Accounts v1 controller hash below, and request card/ACH plus transfers for Stripe's documented card-request dependency and continued destination coexistence. This hash is type-supported and documented; platform eligibility and end-to-end behavior still need verification before changing onboarding.

```ts
controller: {
  fees: { payer: "account" },
  losses: { payments: "stripe" },
  requirement_collection: "stripe",
  stripe_dashboard: { type: "full" },
},
capabilities: {
  card_payments: { requested: true },
  us_bank_account_ach_payments: { requested: true },
  transfers: { requested: true },
},
```

Do not send `application_express` as a creation value. Onboarding must collect the newly requested capability requirements and show the actual dashboard/Stripe responsibilities; existing Express copy/audit language must eventually change. Keep legacy transfers during coexistence. Do not replace an existing business connection until historical-payment routing and webhook ownership support account transitions in a later phase.

Stripe documents that fee payer can be specified only at account creation and dashboard type is immutable. An account confirmed to have the existing Express tuple cannot be converted in place to this target tuple: it requires a new Account and onboarding. This does not prove every account in the deployed database is Express; inventory and retrieve each one. Accounts already matching the target can be evaluated individually. No actual account compatibility or migration eligibility was established here.

## Verification checklist before Phase 4

All checks apply to **both existing and new accounts** unless noted. Perform sandbox checks first; this implementation has not executed them. Any later live verification needs separate authorization.

| Inspect / API object | Expected evidence | Why / applicability |
| --- | --- | --- |
| Connect platform profile and integration settings in Dashboard | Stripe approves target direct charges, application fees and Stripe-managed connected-account pricing | Supported platform configuration; both |
| `GET /v1/accounts/{id}` using the intended platform credentials | Exact stored account ID; platform can retrieve and act for it; `controller.type=application`, `is_controller=true` | Connection and platform authority; both |
| Account `controller.fees.payer` | `account` | Connected account pays Stripe processing separately from RFL app fee; both |
| Account `controller.losses.payments` | `stripe` | Intended connected payment negative-balance responsibility; platform still owns its own negative balance; both |
| Account `controller.requirement_collection` | `stripe` | Stripe collects verification; both |
| Account `controller.stripe_dashboard.type` | `full` | Supported target policy and management access; both; existing Express requires new account for dashboard change |
| Authenticated request context plus PaymentMethodConfiguration `livemode` | Same test/live environment for account evidence and actual request; production live | Accounts v1 has no livemode; do not invent one; both |
| Account `country`, `default_currency` | `US`, `usd` | Initial RFL region/currency policy; both |
| Account `charges_enabled`, `details_submitted`, `payouts_enabled` | All true | Take payments and remit funds to management; both |
| Account `requirements.disabled_reason`, `currently_due`, `past_due`, `pending_verification`, `errors` | Null disabled reason, empty arrays | Fully verified current eligibility; both; refresh on changes |
| Account `capabilities.card_payments` and `/v1/accounts/{id}/capabilities/card_payments` | Active; inspect requested state and capability requirements | Card direct charges; both; new creation request card + documented transfers dependency |
| Account `capabilities.us_bank_account_ach_payments` and matching Capability object | Active; inspect requested state and requirements | ACH direct debit; both |
| Connected-account effective PaymentMethodConfiguration, scoped read with `Stripe-Account` where supported | Correct account, application/parent/default or explicit configuration selection, mode, active, `card.available=true`, `us_bank_account.available=true` | Platform default config is not direct evidence; resolve ambiguity fail closed; both |
| Account `capabilities.transfers` and existing legacy readiness reads | Active while destination payments remain in use | Coexistence only, not direct evaluator; both |
| Stripe Dashboard connected-account pricing / contract | Stripe-managed actual card/ACH prices; no unintended platform fee-payer or speed-fee setup | Planning estimates are not proof of contracted pricing; both |
| Authorized sandbox Checkout/PaymentIntent/Charge and BalanceTransaction | Connected-account scope; expected tenant total; app fee is RFL share; processing deducted from connected balance; actual fee/net breakdown retrievable | Prove fee responsibility and input availability for later reconciliation; both; not executed in Phase 3 |
| Sandbox standard payout settings and bank eligibility | Management can receive standard payout; no RFL speed fee | No payout implementation in this phase; both; do not infer Instant Payout eligibility |
| Connect webhook endpoint and sandbox Event | Connected events delivered with `event.account`, correct mode/signature and retrieval scope | Required before activating direct payments; current webhook unchanged; both |
| Existing account inventory plus immutable Payment/CheckoutSession snapshots | Each old charge retains original account/model; new account transition does not rebind old payments | Existing accounts only; no bulk backfill or connection swap in this phase |
| New account response and completed onboarding | Requested controller tuple and both capabilities actually returned/active; destination coexistence verified | New accounts only; type support alone is insufficient |

The sandbox charge/payout checks above are future verification tasks, not operations authorized or executed by this phase. READY from this pure evaluator does not prove fee amounts, successful browser flow, webhook/reconciliation deployment or rollout activation.

## Authoritative references

- [Controller properties and immutable dashboard mapping](https://docs.stripe.com/connect/migrate-to-controller-properties)
- [Fee payer behavior and creation-only setting](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior)
- [Accounts v1 creation parameters](https://docs.stripe.com/api/accounts/create)
- [Capabilities, ACH and sandbox limitations](https://docs.stripe.com/connect/account-capabilities)
- [Connected-account payment-method configurations](https://docs.stripe.com/connect/multiple-payment-method-configurations)
- [Direct Checkout scope and application fees](https://docs.stripe.com/connect/direct-charges?platform=web&ui=stripe-hosted)
