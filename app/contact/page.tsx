import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact RentFrayLite",
};

export default function ContactPage() {
  return (
    <main className="rfl-info-page">
      <section className="rfl-info-card">
        <p className="rfl-eyebrow">Contact</p>
        <h1>Contact RentFrayLite</h1>
        <p>
          Questions about RentFrayLite, account setup, or support can
          be directed to:
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

        <p className="rfl-info-muted">
          Messages are reviewed as soon as reasonably possible.
        </p>

        <Link className="rfl-info-home-link" href="/">
          Back to RentFrayLite
        </Link>
      </section>
    </main>
  );
}