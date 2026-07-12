export const metadata = {
  title: "Terms of Service | RentFray",
  description: "RentFray Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-14 text-slate-800">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-slate-500">
            Effective Date: May 2026
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">1. Overview</h2>
          <p>
            RentFray is a rent collection and property management platform that
            allows property managers, landlords, and tenants to manage rental
            payments, balances, property communication, and related services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">2. Account Responsibility</h2>
          <p>
            Users are responsible for maintaining the confidentiality of their
            account credentials and for all activity that occurs under their
            account.
          </p>
          <p>
            Users agree to provide accurate information during registration and
            while using the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">3. Payments</h2>
          <p>
            RentFray processes rent payments through third-party payment
            providers, including Stripe.
          </p>
          <p>
            By using RentFray, users authorize ACH and related payment
            processing activities required to complete rent transactions.
          </p>
          <p>
            Processing times may vary depending on banking systems and payment
            provider processing schedules.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">4. Prohibited Use</h2>
          <p>Users may not:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Use the platform for fraudulent activity</li>
            <li>Attempt unauthorized access to accounts or systems</li>
            <li>Upload malicious software or harmful content</li>
            <li>Use the service in violation of applicable laws</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">5. Data & Privacy</h2>
          <p>
            Use of RentFray is also governed by the RentFray Privacy Policy.
          </p>
          <p>
            Users acknowledge that certain financial and account information is
            required for operation of the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">6. Service Availability</h2>
          <p>
            RentFray may update, modify, suspend, or discontinue portions of
            the service at any time to maintain security, compliance, or system
            reliability.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">7. Limitation of Liability</h2>
          <p>
            RentFray is provided on an “as is” and “as available” basis.
          </p>
          <p>
            To the maximum extent permitted by law, RentFray shall not be liable
            for indirect, incidental, consequential, or special damages arising
            from use of the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">8. Termination</h2>
          <p>
            RentFray reserves the right to suspend or terminate accounts that
            violate these terms or create security, fraud, or operational risks.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">9. Contact</h2>
          <p>
            For questions regarding these Terms of Service, contact:
          </p>
          <p className="font-medium">helpdesk@rentfray.com</p>
        </section>
      </div>
    </main>
  );
}