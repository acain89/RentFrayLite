import { requireManager } from "@/lib/auth";

export default async function ManagerDashboardPage() {
  const { manager, business } = await requireManager();

  return (
    <main className="rfl-dashboard-page">
      <header className="rfl-dashboard-header">
        <div>
          <p className="rfl-eyebrow">Manager dashboard</p>
          <h1>{business.name}</h1>
          <p>
            Signed in as {manager.displayName ?? manager.email}
          </p>
        </div>

        <form action="/api/auth/logout" method="post">
          <button className="rfl-secondary-button" type="submit">
            Sign Out
          </button>
        </form>
      </header>

      <section className="rfl-dashboard-empty">
        <h2>Your dashboard is ready.</h2>
        <p>
          Payments and current-cycle activity will appear here after setup
          is complete.
        </p>
      </section>
    </main>
  );
}
