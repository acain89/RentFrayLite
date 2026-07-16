import { requireAdmin } from "@/lib/auth";

export default async function AdminPage() {
  await requireAdmin();

  return (
    <main className="rfl-dashboard-page">
      <header className="rfl-dashboard-header">
        <div>
          <p className="rfl-eyebrow">Administration</p>
          <h1>RentFrayLite Admin</h1>
        </div>

        <form action="/api/auth/logout" method="post">
          <button className="rfl-secondary-button" type="submit">
            Sign Out
          </button>
        </form>
      </header>

      <section className="rfl-dashboard-empty">
        <h2>Admin access confirmed.</h2>
        <p>Administrative tools will be implemented later.</p>
      </section>
    </main>
  );
}
