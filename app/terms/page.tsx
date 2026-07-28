import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "RentFrayLite Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="rfl-legal-page">
      <article className="rfl-legal-card">
        <header className="rfl-legal-header">
          <p className="rfl-eyebrow">Legal</p>
          <h1>Terms of Service</h1>
          <p>Effective date: July 26, 2026</p>
          <p>Version 1.0</p>
        </header>

        <section>
          <h2>1. Agreement to These Terms</h2>
          <p>
            These Terms of Service govern access to and use of
            RentFrayLite, including its websites, dashboards, payment
            pages, checkout tools, communications, and related services
            (collectively, the "Service").
          </p>
          <p>
            By creating an account, connecting a payment account, using
            a RentFrayLite payment page, or otherwise using the Service,
            you agree to these Terms and our{" "}
            <Link href="/privacy">Privacy Policy</Link>. If you do not
            agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Who May Use RentFrayLite</h2>
          <p>
            You must be at least 18 years old and legally able to enter
            into a binding agreement. If you use the Service for a
            business or organization, you represent that you have
            authority to bind that business or organization.
          </p>
        </section>

        <section>
          <h2>3. What RentFrayLite Provides</h2>
          <p>
            RentFrayLite provides software that allows participating
            businesses and organizations ("Businesses") to configure
            recurring payment options, one-time charges, billing rules,
            and public payment pages. Customers and other payers
            ("Payers") may use those pages to submit one-time payments.
          </p>
          <p>
            RentFrayLite is not a bank, landlord, property manager,
            lender, escrow agent, collection agency, or legal adviser.
            RentFrayLite does not determine whether a charge is lawful,
            accurate, owed, or properly disclosed. The Business that
            posts or configures a charge is responsible for the
            underlying transaction and customer relationship.
          </p>
        </section>

        <section>
          <h2>4. Business Accounts and Credentials</h2>
          <p>
            Businesses must provide accurate, current information and
            keep login credentials secure. A Business is responsible
            for activity performed through its account unless it
            promptly reports unauthorized access to RentFrayLite.
          </p>
          <p>
            Businesses must keep their contact information and Stripe
            account information current. RentFrayLite may rely on the
            information supplied through the account.
          </p>
        </section>

        <section>
          <h2>5. Stripe and Payment Processing</h2>
          <p>
            Payment processing and connected-account services are
            provided by Stripe and its financial partners. A Business
            may be required to enter into separate agreements with
            Stripe, complete identity and business verification, and
            comply with Stripe rules, payment-method rules, and
            applicable law.
          </p>
          <p>
            RentFrayLite does not receive or store complete bank account
            numbers or complete card numbers. Stripe controls payment
            authorization, processing, settlement, payout timing,
            reserves, account restrictions, and other payment-processing
            decisions.
          </p>
          <p>
            Payment availability and timing may be affected by banks,
            card networks, ACH rules, Stripe review, holidays, technical
            interruptions, disputes, returns, or other circumstances
            outside RentFrayLite's control.
          </p>
        </section>

        <section>
          <h2>6. Platform Service Fees</h2>
          <p>
            RentFrayLite may charge a Platform Service Fee that is shown
            before a Payer proceeds to secure checkout. The fee is for
            access to and use of the RentFrayLite platform and is
            separate from the underlying amount charged by the
            Business.
          </p>
          <p>
            Fees may vary by payment method, transaction amount, or
            other disclosed pricing rules. The total amount presented
            for review before checkout controls for that transaction.
          </p>
        </section>

        <section>
          <h2>7. Payer Authorization</h2>
          <p>
            Each RentFrayLite checkout authorizes only the payment shown
            during that checkout. RentFrayLite does not create automatic
            payments or autopay from a one-time checkout.
          </p>
          <p>
            By continuing to secure checkout, the Payer represents that
            the payment information is authorized for use and instructs
            Stripe and applicable financial institutions to process the
            displayed amount.
          </p>
        </section>

        <section>
          <h2>8. Business Charges and Billing Rules</h2>
          <p>
            Businesses are solely responsible for configuring payment
            amounts, recurring charges, due dates, grace periods, late
            fees, one-time charges, descriptions, and customer
            identifiers. Businesses must ensure those settings and
            charges comply with contracts, disclosures, notices, and
            applicable laws.
          </p>
          <p>
            RentFrayLite calculates amounts from the settings supplied
            by the Business. Businesses should review their settings and
            payment records for accuracy.
          </p>
        </section>

        <section>
          <h2>9. Returns, Disputes, Chargebacks, and Negative Balances</h2>
          <p>
            ACH payments may be returned, and card payments may be
            disputed or charged back. A payment initially shown as paid
            may later be reversed or returned.
          </p>
          <p>
            The Business is responsible for its customer relationship,
            supporting documentation, and responding to disputes. Costs,
            reversals, negative balances, reserves, and dispute or return
            fees may be allocated by Stripe or RentFrayLite as permitted
            by the applicable Stripe agreements, payment-method rules,
            and law.
          </p>
        </section>

        <section>
          <h2>10. Refunds and Payment Corrections</h2>
          <p>
            RentFrayLite does not currently provide a self-service
            refund tool. A Payer seeking a refund or correction should
            first contact the Business that received the payment.
          </p>
          <p>
            RentFrayLite does not guarantee that a Business will approve
            a refund. Any refund, credit, adjustment, or off-platform
            resolution is the responsibility of the Business unless
            otherwise required by law.
          </p>
        </section>

        <section>
          <h2>11. SMS Receipts</h2>
          <p>
            A Payer who supplies a mobile number requests and authorizes
            a transactional SMS receipt or payment-status message.
            Message and data rates may apply. Delivery is not guaranteed
            and may depend on the mobile carrier, Twilio, device
            settings, and network availability.
          </p>
          <p>
            RentFrayLite does not use payment-receipt consent as consent
            for unrelated marketing messages.
          </p>
        </section>

        <section>
          <h2>12. Acceptable Use</h2>
          <p>You may not use the Service to:</p>
          <ul>
            <li>Commit fraud or misrepresent a transaction.</li>
            <li>Charge amounts you are not legally entitled to collect.</li>
            <li>Violate sanctions, payment-network rules, or applicable law.</li>
            <li>Access another account or customer record without authorization.</li>
            <li>Interfere with, probe, reverse engineer, or damage the Service.</li>
            <li>Transmit malware or harmful code.</li>
            <li>Use the Service for a business prohibited by Stripe.</li>
          </ul>
        </section>

        <section>
          <h2>13. Service Availability and Changes</h2>
          <p>
            We may update, change, limit, suspend, or discontinue part
            of the Service. We may perform maintenance or make changes
            needed for security, legal compliance, payment-provider
            requirements, reliability, or product improvement.
          </p>
          <p>
            We do not guarantee uninterrupted, error-free, or
            continuously available service.
          </p>
        </section>

        <section>
          <h2>14. Suspension and Termination</h2>
          <p>
            RentFrayLite may suspend or terminate access when an account
            presents fraud, security, legal, payment, reputational, or
            operational risk; violates these Terms; is required to be
            restricted by Stripe or law; or remains inactive or
            incomplete.
          </p>
          <p>
            A Business may stop using RentFrayLite. Ending use of
            RentFrayLite does not eliminate obligations relating to
            prior transactions, disputes, returns, fees, records, or
            applicable law.
          </p>
        </section>

        <section>
          <h2>15. Intellectual Property</h2>
          <p>
            RentFrayLite and its software, branding, designs, text, and
            other platform materials are owned by RentFrayLite or its
            licensors. These Terms provide a limited, revocable,
            non-transferable right to use the Service for its intended
            business purpose.
          </p>
        </section>

        <section>
          <h2>16. Feedback</h2>
          <p>
            If you provide suggestions or feedback, you permit
            RentFrayLite to use them without restriction or
            compensation, provided we do not publicly identify you
            without permission.
          </p>
        </section>

        <section>
          <h2>17. Disclaimer of Warranties</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS
            PROVIDED "AS IS" AND "AS AVAILABLE." RENTFRAYLITE DISCLAIMS
            IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR
            A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
          </p>
          <p>
            RENTFRAYLITE DOES NOT WARRANT THAT A BUSINESS'S CHARGES,
            BILLING RULES, CONTRACTS, OR COLLECTION PRACTICES ARE LAWFUL
            OR ENFORCEABLE.
          </p>
        </section>

        <section>
          <h2>18. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, RENTFRAYLITE WILL
            NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES; LOST
            PROFITS; LOST DATA; BUSINESS INTERRUPTION; OR LOSSES CAUSED
            BY BANKS, STRIPE, PAYMENT NETWORKS, BUSINESSES, PAYERS,
            RETURNS, DISPUTES, FRAUD, OR UNAUTHORIZED ACCOUNT USE.
          </p>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, RENTFRAYLITE'S TOTAL
            LIABILITY ARISING FROM THE SERVICE WILL NOT EXCEED THE
            PLATFORM SERVICE FEES RETAINED BY RENTFRAYLITE FROM THE
            AFFECTED USER DURING THE THREE MONTHS BEFORE THE EVENT
            GIVING RISE TO THE CLAIM.
          </p>
          <p>
            Some jurisdictions do not allow certain limitations, so
            portions of this section may not apply.
          </p>
        </section>

        <section>
          <h2>19. Indemnification</h2>
          <p>
            To the extent permitted by law, a Business agrees to defend,
            indemnify, and hold RentFrayLite harmless from claims,
            losses, liabilities, and expenses arising from the
            Business's charges, customer relationships, agreements,
            disclosures, taxes, legal violations, account activity, or
            misuse of the Service.
          </p>
        </section>

        <section>
          <h2>20. Governing Law and Venue</h2>
          <p>
            These Terms are governed by the laws of the State of Texas,
            without regard to conflict-of-law principles. Unless
            applicable law requires otherwise, disputes must be brought
            in a state or federal court with jurisdiction in Texas.
          </p>
        </section>

        <section>
          <h2>21. Changes to These Terms</h2>
          <p>
            We may update these Terms. The revised version will be
            posted with a new effective date. Continued use after an
            update becomes effective constitutes acceptance of the
            updated Terms.
          </p>
        </section>

        <section>
          <h2>22. General Terms</h2>
          <p>
            If any provision is unenforceable, the remaining provisions
            remain effective. Failure to enforce a provision is not a
            waiver. You may not transfer your rights under these Terms
            without our consent. These Terms and referenced policies
            are the entire agreement concerning the Service unless a
            separate written agreement applies.
          </p>
        </section>

        <section>
          <h2>23. Contact</h2>
          <p>
            Questions about these Terms may be sent to:
          </p>
          <p>
            <a href="mailto:helpdesk@rentfray.com">
              helpdesk@rentfray.com
            </a>
            <br />
            <a href="tel:+19363461538">936-346-1538</a>
          </p>
        </section>

        <aside className="rfl-legal-note">
          <strong>Important:</strong> These Terms are an operational
          launch draft and should be reviewed by a qualified attorney
          familiar with payment platforms and the states where the
          Service operates.
        </aside>
      </article>
    </main>
  );
}