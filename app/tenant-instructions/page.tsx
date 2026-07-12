"use client";

export default function TenantInstructionsPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-2xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            RentFray
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Tenant Instructions
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Follow these 6 easy steps to access your tenant portal.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="font-semibold">1) Go to RentFray.com</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="font-semibold">2) Click on "Enter your property."</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="font-semibold">
              3) Type in the property code management gives you.
            </div>
            <div className="mt-4 text-sm text-slate-600">Property Code:</div>
            <div className="mt-2 h-10 rounded-xl border border-dashed border-slate-400 bg-white" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="font-semibold">
  5) Select Tier{" "}
  <span className="inline-block w-12 border-b border-slate-400 mx-1" />{" "}
  ${" "}
  <span className="inline-block w-16 border-b border-slate-400 mx-1" />{" "}
  and create your account.
</div>
</div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="font-semibold">
              6) Use your login to view and pay balances, and submit maintenance requests.
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Print Page
          </button>
        </div>
      </div>
    </main>
  );
}