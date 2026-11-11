# Phase 4.1 ownership and environment contract

Normal checkout remains legacy destination charging. These pure helpers are
not wired into production routes, readiness selection, or webhook processing.
Direct payment creation remains disabled. No credential or signing changes occur.

`resolveStripePaymentContext` accepts only architecture loaded by the server
from an RFL-owned persisted CheckoutSession/Payment. Browser bodies, metadata,
event.account, and current Business connections must never supply its snapshot.
The TypeScript brand prevents accidental use of an unresolved context; it is
not a security boundary against arbitrary trusted-server code forging inputs.
The resolver validates architecture identity, not monetary snapshot completeness.
Phase 4.2 must validate all monetary invariants before object creation.

Both models require captured platform ID, mode, connected account, and a
supported charge-model/pricing-version pair. Legacy objects resolve platform
scope; direct objects resolve captured connected scope. No configuration
fallback reconstructs historical ownership. Unknown snapshots fail closed in
the new resolver. Existing legacy paths remain unchanged until a deliberate
migration/coexistence integration supplies historical ownership evidence.

Future configuration must provide explicit expected platform IDs separately
for test/live and an explicit credential selection contract, with no automatic
fallback. `validateStripePaymentIdentity` requires authenticated Account ID,
independent API livemode evidence, and credential mode to agree. Pure validation
cannot authenticate caller-supplied evidence; the future server collector must
obtain it using the selected credential. No new environment values are added.
Do not replace STRIPE_SECRET_KEY or result-access signing behavior.

The readiness adapter in Phase 3 already requires authenticated accountMode and
account-bound method evidence. Phase 4.1 requires no change to its eligibility
rules. Its future collector must validate identity before producing that evidence.

`matchesStripePaymentEventContext` checks only account/mode compatibility of an
already resolved context. It does not authorize financial processing. Metadata
or event.account alone cannot produce ownership. Phase 4.5 must additionally
require RFL database ownership and exact linked Session/Intent/Charge IDs.
Sharing a platform and credential authorization with RF does not establish RFL
ownership. Do not enumerate RF objects. Connected events remain ignored today.

Deferred to Phase 4.2: nullable captured `stripePlatformAccountId` and `stripeMode`
on CheckoutSession and Payment; copy atomically before Stripe creation and
include in retry comparisons. No defaults or backfill from current settings.
Existing monetary aliases remain authoritative; no schema change or migration
is introduced in Phase 4.1. Live economics validation is still pending.
