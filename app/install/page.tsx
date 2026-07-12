export default function InstallPage() {
  return (
    <main className="min-h-screen bg-[#dfe7ee] px-5 py-10 text-[#0f172a]">
      <section className="mx-auto max-w-xl rounded-[32px] border border-[#d7e3ec] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">
          RentFray App
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Get RentFray on your phone.
        </h1>

        <p className="mt-4 text-sm leading-6 text-[#475569]">
          RentFray can be installed directly from your browser as an app. No app
          store required.
        </p>

        <div className="mt-6 space-y-4 rounded-2xl border border-[#dbe4ee] bg-[#f8fafc] p-4 text-sm leading-6 text-[#334155]">
          <div>
            <strong>iPhone:</strong> Open RentFray in Safari, tap Share, then tap
            Add to Home Screen.
          </div>

          <div>
            <strong>Android:</strong> Open RentFray in Chrome, tap the menu, then
            tap Add to Home screen or Install app.
          </div>
        </div>

        <a
          href="/"
          className="mt-6 inline-flex rounded-2xl bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white"
        >
          Back to RentFray
        </a>
      </section>
    </main>
  );
}