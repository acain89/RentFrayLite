import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";

export default async function SetupCompletePage() {
  const { business } = await requireManager();

  if (!business.setupCompletedAt) {
    redirect("/setup/continue");
  }

  return (
    <main className="rfl-setup-page">
      <section className="rfl-complete-card">
        <div className="rfl-complete-icon" aria-hidden="true">
          ✓
        </div>

        <header className="rfl-complete-header">
          <h1>You’re all set!</h1>
          <p>
            Your account is ready to go. You can now start
            accepting payments.
          </p>
        </header>

        <div className="rfl-complete-summary">
          <h2>What’s next?</h2>

          <div>
            <strong>Share your account code</strong>
            <p>
              Customers use {business.accountCode} to reach
              your payment page.
            </p>
          </div>

          <div>
            <strong>View your dashboard</strong>
            <p>
              See payments, current-cycle activity, and reports.
            </p>
          </div>

          <div>
            <strong>Start accepting payments</strong>
            <p>
              Your connected payment account is ready.
            </p>
          </div>
        </div>

        <Link
          className="rfl-primary-button rfl-link-button"
          href="/manager/dashboard"
        >
          Go to Dashboard
        </Link>
      </section>
    </main>
  );
}