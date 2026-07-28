import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getSetupRoute } from "@/lib/setupProgress";

export default async function ManagerSettingsPage() {
  const { business } = await requireManager();

  const setupRoute = getSetupRoute(business);

  if (setupRoute !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  return (
    <main className="rfl-settings-page">
      <section className="rfl-settings-shell">
        <header className="rfl-settings-header">
          <p className="rfl-eyebrow">Manager tools</p>
          <h1>Settings</h1>
        </header>

        <section
          className="rfl-settings-notice"
          aria-labelledby="settings-configuration-heading"
        >
          <h2 id="settings-configuration-heading">
            Your account is already configured.
          </h2>

          <p>
            Most businesses will never need to change these settings
            again. Only edit them if your rent structure, monthly
            charges, or billing rules have actually changed.
          </p>
        </section>

        <nav
          className="rfl-settings-links"
          aria-label="Account configuration"
        >
          <Link
            className="rfl-settings-link"
            href="/manager/settings/tiers"
          >
            <span>Rent Tiers</span>
            <span aria-hidden="true">›</span>
          </Link>

          <Link
            className="rfl-settings-link"
            href="/manager/settings/charges"
          >
            <span>Monthly Charges</span>
            <span aria-hidden="true">›</span>
          </Link>

          <Link
            className="rfl-settings-link"
            href="/manager/settings/billing"
          >
            <span>Billing Rules</span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>

        <section className="rfl-settings-one-time">
          <div className="rfl-settings-one-time-copy">
            <h2>Login &amp; Security</h2>

            <p>
              Change the manager login email or password.
            </p>
          </div>

          <Link
            className="rfl-settings-link"
            href="/manager/settings/security"
          >
            <span>Login &amp; Security</span>
            <span aria-hidden="true">&gt;</span>
          </Link>
        </section>

        <section className="rfl-settings-one-time">
          <div className="rfl-settings-one-time-copy">
            <h2>One-Time Charges</h2>

            <p>
              Need to charge a specific unit for damage, cleaning,
              repairs, or another one-time expense? Add it here.
            </p>
          </div>

          <Link
            className="rfl-settings-link"
            href="/manager/settings/one-time-charges"
          >
            <span>One-Time Charges</span>
            <span aria-hidden="true">›</span>
          </Link>
        </section>

        <Link
          className="rfl-settings-back"
          href="/manager/dashboard"
        >
          ← Back to Dashboard
        </Link>
      </section>
    </main>
  );
}