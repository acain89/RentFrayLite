import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "RentFrayLite Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="rfl-legal-page">
      <article className="rfl-legal-card">
        <header className="rfl-legal-header">
          <p className="rfl-eyebrow">Legal</p>
          <h1>Privacy Policy</h1>
          <p>Effective date: July 26, 2026</p>
          <p>Version 1.0</p>
        </header>

        <section>
          <h2>1. Scope</h2>
          <p>
            This Privacy Policy explains how RentFrayLite collects,
            uses, shares, and protects information when Businesses,
            managers, Payers, and visitors use our websites, payment
            pages, dashboards, communications, and related services.
          </p>
          <p>
            This Policy should be read with our{" "}
            <Link href="/terms">Terms of Service</Link>.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>

          <h3>Business and manager information</h3>
          <p>
            We may collect business names, owner or manager names,
            email addresses, telephone numbers, business addresses,
            login credentials in hashed form, account codes, settings,
            Stripe connection status, and account activity.
          </p>

          <h3>Payer and transaction information</h3>
          <p>
            We may collect payer names, mobile numbers, unit or
            reference identifiers, selected payment options, billing
            cycles, charge descriptions, transaction amounts, payment
            methods, payment status, failure information, Stripe
            transaction identifiers, and receipt-delivery status.
          </p>

          <h3>Payment information</h3>
          <p>
            Stripe collects and processes bank-account, card, identity,
            and payment information needed to provide payment services.
            RentFrayLite does not store complete bank account numbers or
            complete card numbers on its own servers.
          </p>

          <h3>Device and usage information</h3>
          <p>
            We may collect IP address, browser type, device type,
            operating system, referring page, pages viewed, timestamps,
            approximate location derived from IP address, and
            interactions with the Service.
          </p>

          <h3>Support information</h3>
          <p>
            We collect information included in support requests,
            emails, calls, troubleshooting details, and other
            communications.
          </p>
        </section>

        <section>
          <h2>3. How We Use Information</h2>
          <p>We may use information to:</p>
          <ul>
            <li>Create, authenticate, and administer accounts.</li>
            <li>Provide public payment pages and payment reviews.</li>
            <li>Calculate configured charges and Platform Service Fees.</li>
            <li>Initiate and track transactions through Stripe.</li>
            <li>Prevent duplicate, unauthorized, or fraudulent activity.</li>
            <li>Send transactional SMS receipts and status messages.</li>
            <li>Provide dashboards, history, support, and account recovery.</li>
            <li>Monitor security, reliability, and performance.</li>
            <li>Understand product usage and improve the Service.</li>
            <li>Comply with law and enforce our agreements.</li>
          </ul>
        </section>

        <section>
          <h2>4. Stripe</h2>
          <p>
            We use Stripe for payment processing, connected accounts,
            fraud prevention, identity verification, analytics related
            to Stripe services, and other payment-related functions.
            Stripe may collect transactional information, identity
            information, device information, and information through
            cookies or similar technologies.
          </p>
          <p>
            Stripe processes information under its own agreements and
            privacy policy. Businesses may also enter directly into a
            connected-account agreement with Stripe.
          </p>
        </section>

        <section>
          <h2>5. Twilio and SMS</h2>
          <p>
            We may use Twilio or another communications provider to
            send transactional SMS receipts or payment-status messages.
            We may share the destination phone number and message
            content with that provider for delivery, security,
            troubleshooting, and delivery reporting.
          </p>
          <p>
            Mobile carriers and communications providers may process
            message metadata under their own policies.
          </p>
        </section>

        <section>
          <h2>6. Google Analytics and Cookies</h2>
          <p>
            We may use Google Analytics or similar tools to understand
            how visitors use the Service. These tools may use
            first-party cookies, device identifiers, and event data to
            generate usage and performance reports.
          </p>
          <p>
            We do not intentionally send names, email addresses, mobile
            numbers, full payment information, or other directly
            identifying form content to Google Analytics.
          </p>
          <p>
            Browser settings may allow you to block or delete cookies,
            although doing so may affect certain features. Additional
            consent controls may be introduced where legally required
            or as our analytics and advertising use changes.
          </p>
        </section>

        <section>
          <h2>7. How We Share Information</h2>
          <p>We may share information with:</p>
          <ul>
            <li>
              Stripe, banks, payment networks, and financial partners
              needed to process or administer payments.
            </li>
            <li>
              Twilio, mobile carriers, and communications providers
              needed to deliver transactional messages.
            </li>
            <li>
              Hosting, database, analytics, security, error-monitoring,
              and technical service providers.
            </li>
            <li>
              The relevant Business, including payment and payer
              information associated with that Business.
            </li>
            <li>
              Government authorities, courts, or other parties when
              required by law or reasonably necessary to protect
              rights, safety, security, and the integrity of the
              Service.
            </li>
            <li>
              A buyer, successor, investor, or adviser in connection
              with a merger, financing, sale, reorganization, or
              similar transaction, subject to appropriate
              confidentiality protections.
            </li>
          </ul>
          <p>
            RentFrayLite does not sell personal information for money.
            We do not use transactional SMS consent for unrelated
            marketing.
          </p>
        </section>

        <section>
          <h2>8. Business Responsibilities</h2>
          <p>
            A Business may independently collect, use, or retain
            information about its customers. Each Business is
            responsible for its own privacy notices, legal basis,
            disclosures, retention practices, and responses to customer
            requests. RentFrayLite is not responsible for a Business's
            separate privacy practices.
          </p>
        </section>

        <section>
          <h2>9. Data Retention</h2>
          <p>
            We retain information for as long as reasonably necessary
            to provide the Service, maintain payment and audit records,
            prevent fraud, resolve disputes, support users, comply with
            legal and financial obligations, and enforce agreements.
          </p>
          <p>
            Retention periods vary by information type and may continue
            after an account is closed. Stripe and other providers
            maintain information under their own retention policies.
          </p>
        </section>

        <section>
          <h2>10. Security</h2>
          <p>
            We use administrative, technical, and organizational
            safeguards designed to protect information. These include
            access controls, hashed passwords, secure session cookies,
            encrypted network connections in production, and limiting
            the payment credentials stored by RentFrayLite.
          </p>
          <p>
            No online service can guarantee absolute security. You are
            responsible for protecting account credentials and promptly
            reporting suspected unauthorized access.
          </p>
        </section>

        <section>
          <h2>11. Your Choices and Requests</h2>
          <p>
            Depending on your relationship with RentFrayLite and
            applicable law, you may request access to, correction of, or
            deletion of certain information. Some information may be
            retained for payment, fraud, legal, accounting, security,
            or dispute-resolution purposes.
          </p>
          <p>
            Payers should generally contact the relevant Business first
            because the Business controls the underlying customer
            relationship and charge.
          </p>
        </section>

        <section>
          <h2>12. State Privacy Rights</h2>
          <p>
            Residents of certain states may have additional rights
            relating to access, correction, deletion, portability, or
            certain disclosures. We will review verified requests under
            applicable law. We may need to confirm your identity and
            relationship to the relevant account or transaction.
          </p>
        </section>

        <section>
          <h2>13. Children's Privacy</h2>
          <p>
            The Service is intended for adults and business use. It is
            not directed to children under 13, and we do not knowingly
            collect personal information from children under 13.
          </p>
        </section>

        <section>
          <h2>14. United States Operations</h2>
          <p>
            RentFrayLite is operated in the United States. Information
            may be processed and stored in the United States and other
            locations where our service providers operate.
          </p>
        </section>

        <section>
          <h2>15. Changes to This Policy</h2>
          <p>
            We may update this Policy as the Service, providers, or
            legal requirements change. We will post the updated version
            with a revised effective date.
          </p>
        </section>

        <section>
          <h2>16. Contact</h2>
          <p>
            Privacy questions and requests may be sent to:
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
          <strong>Important:</strong> This Privacy Policy is an
          operational launch draft and should be reviewed by a
          qualified attorney, particularly before expanding analytics,
          advertising, or operations into additional jurisdictions.
        </aside>
      </article>
    </main>
  );
}