import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support",
  description: "RentFrayLite support information",
};

export default function SupportPage() {
  return (
    <main className="rfl-info-page">
      <section className="rfl-info-card">
        <p className="rfl-eyebrow">Help</p>
        <h1>RentFrayLite Support</h1>
        <p>
          For account access, setup, checkout, payment-status, or
          receipt questions, contact RentFrayLite support.
        </p>

        <div className="rfl-contact-grid">
          <div>
            <span>Email</span>
            <a href="mailto:helpdesk@rentfray.com">
              helpdesk@rentfray.com
            </a>
          </div>

          <div>
            <span>Phone</span>
            <a href="tel:+19363461538">936-346-1538</a>
          </div>
        </div>

        <div className="rfl-info-callout">
          <h2>Payment questions</h2>
          <p>
            For questions about why an amount was charged, a late fee,
            rent, service, product, one-time charge, refund, or account
            balance, contact the Business shown on the payment page
            first. The Business controls the underlying charge.
          </p>
        </div>

        <Link className="rfl-info-home-link" href="/">
          Back to RentFrayLite
        </Link>
      </section>
    </main>
  );
}