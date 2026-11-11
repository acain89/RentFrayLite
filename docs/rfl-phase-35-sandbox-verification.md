# RFL Phase 3.5 sandbox verification

## Safety and scope

The standalone `scripts/verify-rfl-direct-stripe-sandbox.ts` reads only the RFL project's `.env` STRIPE_SECRET_KEY, ignores inherited credential variables, and refuses to run outside the fixed RFL project directory. No alternate credential/platform flags exist. Before ANY creation it requires a test-key prefix, authenticated Account ID exactly `acct_1Ttxz8B9QfvernJe`, and a Stripe Balance response with `livemode === false`. The connected balance must also be non-live before payments. SDK API version remains `2026-02-25.clover`, SDK 20.4.1, with bounded requests and no automatic retries.

No database or application checkout/webhook imports exist. Normal checkout remains legacy. The inactive pricing module is imported only by this standalone script. The tool never performs refunds, transfers, payouts, reconciliation writes, deployments or migrations. Reconciliation output is a pure plan only.

## Observed sandbox results

Authenticated platform: **acct_1Ttxz8B9QfvernJe**. API Balance: **livemode false**. These results were reported before account creation and reverified on each script run.

Created account: **acct_1UMIjeB503dxDmW9**.

Actual controller response:

```json
{"fees":{"payer":"account"},"is_controller":true,"losses":{"payments":"stripe"},"requirement_collection":"stripe","stripe_dashboard":{"type":"full"},"type":"application"}
```

This proves target account configuration is creatable in this sandbox. It does not prove payment eligibility or observed economics.

Nested sandbox objects created by the Account request:

- Person: **person_1UMIjeB503dxDmW9AVFfrAnM**.
- External test bank account: **ba_1UMIjeB503dxDmW9HJSxCYAu**.
- Requested capability resources: card_payments, us_bank_account_ach_payments, transfers. Transfers was requested only because Stripe documents it as a card capability request dependency.

All three capabilities remained inactive. `charges_enabled`, `payouts_enabled` and `details_submitted` were false; disabled reason was `requirements.past_due`.

Currently/past due:

- business_profile.support_phone
- tos_acceptance.date
- tos_acceptance.ip

Pending verification:

- individual.address.city / line1 / postal_code / state
- individual.id_number
- individual.verification.document

The tool stopped before creating PaymentIntents. **Zero PaymentIntents, Charges, application fees, payment balance transactions, mandates, refunds, transfers, or payouts were created by this experiment.** Direct-charge economics and rounding remain empirically unverified.

The first request failed with `url_invalid` for example.com. The retry used Stripe's documented successful verification token URL `https://accessible.stripe.com`; no target configuration was weakened. The final script additionally supplies the documented support-phone token `0000000000` for future new-account requests. The already-created account has not been updated with that field; its outstanding requirement remains visible. Use a new run ID for a new account because create-request parameters changed; never change parameters under an existing idempotency key.

## Pricing comparison prepared, not observed

Values below come directly from `priceRflDirectV1`, not a duplicated formula:

| Cents | Card | ACH |
| --- | ---: | ---: |
| Management owed | 100000 | 100000 |
| Tenant fee | 4100 | 995 |
| Tenant total | 104100 | 100995 |
| Planning Stripe processing fee | 3049 | 500 |
| Planned RFL application fee | 1051 | 495 |
| Expected management net | 100000 | 100000 |

If the account later becomes eligible, the script creates direct PaymentIntents with `{stripeAccount: connectedAccountId}`, omits transfer_data, uses pm_card_visa / pm_usBankAccount_success, and retrieves actual connected-account Charge/BalanceTransaction plus platform ApplicationFee/BalanceTransaction. It checks object IDs, scope, non-live state, settled/captured gross, currencies, complete fee breakdown, application fee linkage/amount, management net, and platform application-fee receipt. Unknown fee categories fail the breakdown check; they are never silently classified as ordinary processing fees. Cost/net differences print FAIL and the unchanged pure reconciliation plan; no monetary adjustments are executed.

ACH processing or absent balance transactions/application fees produce pending/failed verification rather than a false pass. Same-run idempotency plus a fresh PaymentIntent retrieval supports later settlement inspection without intentionally creating another charge. Stripe's idempotency retention is finite (at least 24 hours); do not rerun payment creation outside that retention window or assume a run ID is a durable uniqueness constraint. This tool has no database-backed long-term retry guarantee.

Optional rounding probes price owed amounts 299/300/301 cents using the same pricing engine; tenant totals become 499/500/501 cents, exercising below/tie/above half-cent percentage cases under the planning card rate. Three observations cannot prove a general rounding rule or contractual live pricing. No probes ran because onboarding was incomplete.

## Supported continuation; no architecture substitution

Installed Accounts v1 types permit individual/business/bank information at account creation. After an Account Link/Session is created, these fields become restricted when requirement collection belongs to Stripe. In particular, `tos_acceptance` is only programmatically updateable for accounts with requirement_collection=application. This tool deliberately does not fabricate acceptance or switch responsibility to application, change losses/fee payer, or substitute Express/Custom to get payments through.

The remaining supported path must use Stripe-owned onboarding/terms acceptance or the documented test OAuth flow. Stripe documents a test Connect client_id with a sandbox OAuth flow that can force-skip the account form for Stripe Dashboard accounts. That platform's test client_id, an allowed redirect URI, and the correct sandbox account authentication/approval flow have not been established in this repository or experiment. They are the next required verification inputs; not an invitation to supply real personal or bank information. Do not assume OAuth will activate the existing account or preserve the target tuple without checking the resulting Account. If a different test account is produced, verify the tuple/ownership and explicitly adapt the isolated tool before using it; do not silently substitute accounts.

Reinspect the already-created account without creating another account:

```powershell
npx --no-install tsx scripts/verify-rfl-direct-stripe-sandbox.ts --account-id acct_1UMIjeB503dxDmW9 --run-id phase35-20261002-a --rounding-probes
```

This stops at incomplete readiness today. Once eligibility is complete, the same invocation is payment-creating and must be treated as such. It is NOT a permanent read-only inspection command.

For a deliberately new sandbox experiment, use a distinct run ID and `--create-account`. Every run repeats the hardcoded identity/non-live checks. Existing-account reuse requires this script's experiment metadata, platform and run ID to match; arbitrary/manual accounts are not silently accepted.

## Webhook investigation

Authenticated `webhookEndpoints.list({limit:100})` returned **data=[]**, **has_more=false**. There are no API-visible webhook endpoints in this sandbox; this does not inventory separate Event Destination products or local CLI listeners. No endpoint was created or modified, and no direct-payment event delivery was observed.

Stripe documents v1 direct-payment events under the connected-account event scope, carrying top-level event.account. Associated payment objects must be retrieved in that account context; livemode and the sandbox signing secret must be validated. Current RFL `lib/stripePaymentWebhook.ts` explicitly returns for event.account and otherwise retrieves payment objects in platform scope. It cannot settle these future direct events, even if a suitable endpoint is later configured. Nothing in that implementation was changed.

Future delivery verification requires a sandbox-specific connected-events destination/listener, appropriate event subscriptions, correct sandbox signing secret and authenticated connected-account retrieval. A connected account's Events API read is useful context evidence but does not prove webhook HTTP delivery. The script never sends these experimental payments through the normal RFL webhook/database path.

## References

- [Stripe Connect test data, successful URL/phone tokens and test OAuth](https://docs.stripe.com/connect/testing)
- [Accounts v1 create parameters and collection-dependent restrictions](https://docs.stripe.com/api/accounts/create)
- [Test card and ACH PaymentMethods](https://docs.stripe.com/testing?testing-method=payment-methods)
- [Connected account webhook event scope](https://docs.stripe.com/connect/webhooks)
- [Stripe idempotent request retention](https://docs.stripe.com/api/idempotent_requests)

No RF project/resources were accessed. No RFL production database access, live Stripe objects, migration application, environment edits, commits, pushes or deployments occurred. Application checkout, webhook, pricing, schema and financial-state files remained unchanged during Phase 3.5.
