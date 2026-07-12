export const metadata = {
  title: "Account Deletion | RentFray",
  description: "RentFray account deletion policy and instructions",
};

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-14 text-slate-800">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            Account Deletion
          </h1>
          <p className="text-sm text-slate-500">
            Effective Date: May 2026
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">
            Requesting Account Deletion
          </h2>
          <p>
            Users may request deletion of their RentFray account and associated
            personal data by contacting:
          </p>
          <p className="font-medium">helpdesk@rentfray.com</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Information We Delete</h2>
          <p>
            Upon approved deletion requests, RentFray will delete or anonymize
            applicable account-related personal information where reasonably
            possible.
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Login and account information</li>
            <li>Profile information</li>
            <li>Associated property access permissions</li>
            <li>Application session data</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Information We May Retain</h2>
          <p>
            Certain information may be retained for legal, compliance,
            accounting, fraud prevention, dispute resolution, or payment record
            requirements.
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Payment transaction records</li>
            <li>Ledger and accounting records</li>
            <li>Security and fraud monitoring records</li>
            <li>Records required by applicable law</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Deletion Timeline</h2>
          <p>
            Most approved deletion requests are processed within 30 days,
            although certain retained records may remain longer if required by
            law or financial compliance obligations.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Contact</h2>
          <p>
            For account deletion requests or related questions, contact:
          </p>
          <p className="font-medium">helpdesk@rentfray.com</p>
        </section>
      </div>
    </main>
  );
}
