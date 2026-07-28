import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security",
  description: "How RentFrayLite protects accounts and payments",
};

export default function SecurityPage() {
  return (
    <main className="rfl-info-page">
      <section className="rfl-info-card rfl-security-public-card">
        <p className="rfl-eyebrow">Trust</p>
        <h1>Security at RentFrayLite</h1>
        <p>
          RentFrayLite is designed to collect only the information
          needed to provide account management, payment pages, payment
          records, and transactional receipts.
        </p>

        <div className="rfl-security-public-grid">
          <article>
            <h2>Payments handled by Stripe</h2>
            <p>
              Secure payment entry occurs through Stripe. RentFrayLite
              does not store complete bank account numbers or complete
              card numbers on its own servers.
            </p>
          </article>

          <article>
            <h2>Protected credentials</h2>
            <p>
              Manager passwords are stored as cryptographic hashes, not
              readable passwords. Sessions use HTTP-only cookies.
            </p>
          </article>

          <article>
            <h2>Encrypted connections</h2>
            <p>
              Production traffic is transmitted over HTTPS to protect
              information while it moves between browsers and servers.
            </p>
          </article>

          <article>
            <h2>Server-side authorization</h2>
            <p>
              Manager and administrator routes validate authenticated
              sessions on the server before protected information or
              account actions are permitted.
            </p>
          </article>

          <article>
            <h2>Limited payment authority</h2>
            <p>
              A RentFrayLite checkout authorizes one payment only. The
              platform does not create automatic or recurring debits
              from a payer's account.
            </p>
          </article>

          <article>
            <h2>Responsible disclosure</h2>
            <p>
              Suspected security issues should be reported promptly to
              helpdesk@rentfray.com with enough detail for
              investigation.
            </p>
          </article>
        </div>

        <div className="rfl-trust-strip">
          <strong>Secure checkout powered by Stripe</strong>
          <span>ACH and card payment options</span>
        </div>

        <Link className="rfl-info-home-link" href="/">
          Back to RentFrayLite
        </Link>
      </section>
    </main>
  );
}