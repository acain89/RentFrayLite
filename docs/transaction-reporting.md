# Management transaction reporting

The dashboard and history show recorded PENDING, PAID, FAILED, RETURNED and
DISPUTED payments. Checkout reservations, started sessions and expired/abandoned
checkouts are excluded. There are no inferred unpaid units or rent obligations.

Primary display categories are Pending, Successful and Failed. Returned and
Disputed retain explicit detail under Failed; stored financial states are unchanged.

## Dates and cycle attribution

All displayed original transaction dates and history date filters use immutable
Payment.createdAt. Settlement, failure, return and dispute timestamps remain
separate details. They never move a transaction into a different month.

The dashboard's current cycle uses propertyTimeZone and the existing property
calendar authority. Standard payments match their captured billingCycle. Custom
payments match createdAt within the actual local month's UTC instant boundaries.
Rollover only changes a SELECT filter. It never deletes, archives, updates or
creates payments. An open dashboard requests a server refresh at the next
server-calculated cycle boundary, including after sleep/focus restoration.

For explicitly NULL propertyTimeZone, reports use UTC display compatibility and
say that the property's timezone is unconfigured. This does not assign or persist
a timezone. Invalid or unavailable timezone values fail closed. Calendar range
calculations handle DST rather than assuming every local day lasts 24 hours.

## History and exports

History filters are GET parameters: from/to inclusive local dates, name, unit,
method, status, type, and page. Name words match first/last names case-insensitively.
Name/unit SQL wildcard characters are escaped and treated literally. Failed
includes returns/disputes; specific detail filters are also available. All query
parameters are validated. Property IDs are never accepted from report parameters.

History and the current-cycle dashboard use 50-row server pages, ordered by
original date then unique ID. Count and page reads use a repeatable-read snapshot.
Records beyond the current page are not sent to the browser.

CSV and printable HTML use one authenticated endpoint and the same selected
filters, ignoring page offset. They include all matches up to 10,000 rows and a
20 MiB response limit. Larger reports reject with a narrowing instruction instead
of returning incomplete data. Print opens a complete report in a separate tab;
use the browser Print command. Print CSS repeats headings and hides instructions.
Each request is a consistent snapshot; later requests reflect subsequent legitimate
payment-state changes rather than persisting a separate report ledger.

Both formats include original charge snapshots, amounts, fees, current status,
failure code, return/dispute dates, and original UTC/property-local timestamps.
No current tier/charge settings are joined or used to recalculate old payments.

## Financial labels and privacy

Expected management proceeds and estimated Stripe processing costs are explicitly
separate from verified amounts. Verified fields require a captured balance
transaction reference and a currently PAID payment; unavailable values stay blank
in exports or show unavailable in the UI. A later return/dispute removes any claim
that the payment is currently successful. Settlement is not a bank payout.
The reporting path never triggers Stripe observation or reconciliation; unpopulated
Payment observation fields remain unavailable even when operational journals hold
additional evidence. Those journals and provider references remain retained for
authorized operational investigation.

The existing management session is checked before reading and again before a
report response. Every query is scoped to its authenticated business. Report
exports are private/no-store and carry no-referrer/nosniff headers. Printable HTML
escapes all values and disallows scripts, remote resources, forms and framing.
CSV cells quote embedded delimiters and neutralize leading formulas/control
characters. Phone/email fields, raw provider error messages, payment credentials
and raw provider payloads are not selected for reports.

No schema changes, migrations, new accounting models, or activation of dormant
payment/payout functionality are required by this stage.
