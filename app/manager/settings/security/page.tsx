import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getSetupRoute } from "@/lib/setupProgress";
import SecuritySettingsClient from "./SecuritySettingsClient";

export default async function ManagerSecuritySettingsPage() {
  const { business, manager } = await requireManager();

  const setupRoute = getSetupRoute(business);

  if (setupRoute !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  return (
    <main className="rfl-settings-page">
      <section className="rfl-settings-shell">
        <header className="rfl-settings-header">
          <p className="rfl-eyebrow">Manager tools</p>
          <h1>Login &amp; Security</h1>
          <p>Update the credentials used to access this account.</p>
        </header>

        <SecuritySettingsClient currentEmail={manager.email} />

        <Link
          className="rfl-settings-back"
          href="/manager/settings"
        >
          Back to Settings
        </Link>
      </section>
    </main>
  );
}