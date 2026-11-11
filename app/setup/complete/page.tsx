import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { loadBusinessPaymentReadiness } from "@/lib/businessPaymentReadiness";
import { getFirstBillingDateLabel } from "@/lib/managementBillingSetup";

export default async function SetupCompletePage() {
  const { business } = await requireManager();

  if (!business.setupCompletedAt) {
    redirect("/setup/continue");
  }

  const current = await loadBusinessPaymentReadiness(business.id);
  const firstBillingDate = business.propertyTimeZone && business.firstStandardBillingDate
    ? getFirstBillingDateLabel(business.firstStandardBillingDate)
    : null;
  return (
    <main className="rfl-setup-page">
      <section className="rfl-complete-card">
        <div className="rfl-complete-icon" aria-hidden="true">
          ✓
        </div>

        <header className="rfl-complete-header">
          <h1>{firstBillingDate ? "Account setup complete" : current?.readiness.title ?? "Payment status unavailable"}</h1>
          <p>
            {firstBillingDate
              ? `Your account is ready. Your first standard billing cycle begins ${firstBillingDate}. Standard rent payments become available on that date.`
              : "Your account setup is saved. Your existing billing settings remain unchanged."}
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
            <strong>Payment account status</strong>
            <p>
              {current?.readiness.ready ? "Your connected payment account is ready. Standard rent is scheduled according to your billing setup." : "Resolve the items above to finish payment readiness."}
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
