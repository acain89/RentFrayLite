# ACH operations: RentFrayLite

Internal instructions, not a certification of compliance or authorization to move
money. Assign a named payment-operations owner and backup before publication.
Record review dates and outcomes in an access-controlled incident/review record,
not this repository. Never put customer banking data, credentials, raw provider
payloads, or mandate IP addresses in source control or ordinary logs.

## Authorization evidence and retention

- Using existing authorized Stripe Dashboard access, trace the stored payment to
  its Checkout Session/PaymentIntent, bank PaymentMethod and Mandate, in the
  correct platform/connected-account context. Retrieve the accepted mandate text,
  acceptance details and linkage; the Mandate API is an alternative for an
  authorized operator. Do not infer authorization from a PAID status alone.
- Confirm evidence is reproducible and the payer received the mandate copy.
  Stripe-hosted Checkout records acceptance; copy delivery depends on the actual
  email/settings configuration. Notifications are not a substitute for a mandate.
- Retain reproducible authorization for at least two years after termination or
  revocation, and longer when current rules, agreements or legal holds require.
  Confirm the actual Stripe retrieval/retention arrangement and restricted backup
  procedure rather than assuming Stripe retains accessible evidence indefinitely.
  Keep original payment and audit records; account closure is not permission to
  delete financial history. Counsel/accounting must confirm other retention terms.

## Refunds, returns and rights

- Management handles voluntary tenant refunds directly, outside the platform.
  There is no discretionary manager-initiated platform refund feature. An external
  refund leaves the original platform transaction intact; it is not proof of a
  Stripe refund, reversal or adjusted platform balance.
- Platform service fees are ordinarily retained after processing, subject to law,
  network rules and Stripe processes. Do not promise irrevocable fees/transfers.
- Escalate unauthorized transactions, bank returns, disputes, legally required
  refunds and provider reversals to the assigned operator promptly. Record the
  provider case, deadline and current status using restricted evidence. Follow
  applicable provider deadlines; do not substitute this voluntary policy for
  statutory rights or tell a payer that an external refund removes bank rights.
- Before any separately authorized credit, check existing refunds, disputes and
  returns to avoid duplicate reimbursement. Do not guess principal/fee allocation,
  issue another refund to clear an exception, or rewrite historical ledger rows.
  Provider money movements require separate authority and a documented review.

## Reconciliation and exception review

- At least each business day, review failed/retried webhooks and unresolved
  exceptions, and compare stored payments/history exports with Stripe payment,
  balance, transfer, refund and dispute reports. Reconcile payouts separately to
  bank deposits. Distinguish principal, platform fee, Stripe costs and reversals;
  unknown amounts are not zero. ACH success is not proof of bank payout.
- Record owner, oldest unresolved exception, investigation, evidence and next
  action. Monitor callback failures and aged pending payments; test alert delivery.
  Source code alone does not establish working alerts or completed reconciliation.
- RFL uses destination charges without `on_behalf_of`; do not confuse it with RF
  or activate dormant direct-charge code. The platform balance can bear Stripe
  fees, refunds and disputes; recoverability depends on actual agreements/facts.
- Review durable webhook exceptions (`AuditLog.actorType` of
  `STRIPE_WEBHOOK_EXCEPTION`) and actual provider status before recovery. Keep
  original payments and historical SMS/card records intact.
- Preserve working Web Push. Optional push delivery is not payment reconciliation
  or the sole incident signal. Current worker/release instructions are in
  [ACH/Web Push implementation](ACH_PUSH_IMPLEMENTATION.md); legacy SMS worker
  instructions are not a current operating procedure. Do not drain old SMS queues.

## Annual fraud-monitoring review

Assign an owner to document the applicable Nacha Originator/TPS/TPSP role and
risk-based fraud procedures, including account validation for first WEB use or
account-number changes, unauthorized and false-pretenses transactions, return
patterns, anomalies and escalation. Review at least annually and after material
changes; date the review, evidence, decisions and follow-up. Stripe processing
alone does not demonstrate that the platform's own obligations have been met.
Confirm validation coverage and role allocation with Stripe; do not invent a new
customer authorization or assume recurring charges authorize automatic debits.

## Open confirmations and publication gate

- Counsel: actual lease/business agreements permit the tenant-paid fee; applicable
  debt-collection, Texas payment/lease, Reg E, nonwaiver and money-transmission
  requirements; any agent-of-payee exemption requires actual qualifying facts.
- Stripe: actual Connect agreements/controller settings, permitted business model,
  authorization evidence retrieval/copy/retention and allocation of losses. These
  are confirmations still needed, not code defects proved by missing evidence.
- Operations: assign owners, demonstrate mandate retrieval, restore capability,
  monitoring and a completed reconciliation. Do not claim they were verified here.
- Before publishing the Terms changes, set the actual revised effective date and
  version and provide any required notice/assent under applicable agreements and
  counsel's advice. Existing dates have not been silently made retroactive.
- RFL's public operational-launch-draft label is deliberately retained. Approved
  refund policy does not establish legal readiness of the role declarations in
  Terms section 3, liability/indemnity in sections 18-19, or their interaction with
  actual business/Stripe agreements and nonwaivable rights. Qualified legal review
  of those provisions and actual agreements is needed before removing the label.

## Primary references

- [Stripe ACH terms](https://stripe.com/legal/ach)
- [Stripe ACH and mandate evidence](https://docs.stripe.com/payments/ach-direct-debit)
- [Retrieve a mandate](https://docs.stripe.com/api/mandates/retrieve)
- [Connect destination charges](https://docs.stripe.com/connect/destination-charges)
- [Nacha WEB proof of authorization guidance](https://www.nacha.org/system/files/2022-11/WEB_Proof_of_Authorization_Industry_Practices.pdf)
- [Nacha WEB validation](https://www.nacha.org/rules/supplementing-fraud-detection-standards-web-debits)
- [Nacha fraud monitoring, phase 2](https://www.nacha.org/rules/risk-management-topics-fraud-monitoring-phase-2)
- [EFTA nonwaiver](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section1693l&num=0&edition=prelim)
- [Reg E error resolution](https://www.consumerfinance.gov/rules-policy/regulations/1005/11/)
