// app/offline/page.tsx

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[var(--rf-bg-app)] px-6 py-16 text-[var(--rf-text-main)]">
      <section className="mx-auto max-w-md rounded-[28px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-6 shadow-[var(--rf-shadow-sm)]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--rf-accent)]">
          RentFray
        </p>

        <h1 className="mt-3 text-3xl font-bold">You’re offline</h1>

        <p className="mt-3 text-sm leading-6 text-[var(--rf-text-muted)]">
          RentFray needs an internet connection for balances, payments, manager tools,
          tenant records, and live status updates.
        </p>

        <a
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--rf-primary)] px-5 py-3 text-sm font-bold text-white"
        >
          Try again
        </a>
      </section>
    </main>
  );
}