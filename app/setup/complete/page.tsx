import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { loadBusinessPaymentReadiness } from "@/lib/businessPaymentReadiness";

export default async function SetupCompletePage() {
  const { business } = await requireManager();

  if (!business.setupCompletedAt) {
    redirect("/setup/continue");
  }

  const current = await loadBusinessPaymentReadiness(business.id);
  return (
    <main className="rfl-setup-page">
      <section className="rfl-complete-card">
        <div className="rfl-complete-icon" aria-hidden="true">
          ✓
        </div>

        <header className="rfl-complete-header">
          <h1>{current?.readiness.title ?? "Payment status unavailable"}</h1>
          <p>
            Your account setup is saved. Check your current payment status below.
          </p>
        </header>

        {current?.readiness.reasons.map((reason) => <p key={reason.code}><Link href={reason.route}>{reason.message}</Link></p>)}
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
              {current?.readiness.ready ? "Your connected payment account is ready." : "Resolve the items above before accepting payments."}
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