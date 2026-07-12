import Link from "next/link";

type NextStepsPageProps = {
  searchParams?: Promise<{
    code?: string;
  }>;
};

export default async function NextStepsPage({
  searchParams,
}: NextStepsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const propertyCode = resolvedSearchParams?.code ?? "XXXX";

  return (
    <main className="min-h-screen bg-[#dfe7ee] px-4 py-8 text-[#0f172a]">
      <div className="mx-auto max-w-2xl rounded-[28px] border border-[#cbd5e1] bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#475569]">
            RentFray
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Setup Complete
          </h1>

          <p className="mt-2 text-sm text-[#64748b]">
            Your property account has been created. Finish these steps before
            tenants start paying.
          </p>
        </div>

        <div className="mt-8 space-y-5 text-sm leading-relaxed text-[#334155]">
          <div>
            <strong>1. Save your property code</strong>
            <div className="mt-1 rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-lg font-semibold tracking-wide">
              {propertyCode}
            </div>
            <p className="mt-1 text-xs text-[#64748b]">
              Managers and tenants use this code to find the correct property.
            </p>
          </div>

          <div>
            <strong>2. Connect payouts</strong>
            <p className="mt-1">
              Open the dashboard, click <strong>Manage</strong>, then select{" "}
              <strong>Account & Payouts</strong>. Payments cannot be accepted
              until Stripe onboarding is complete.
            </p>
          </div>

          <div>
            <strong>3. Set your billing cycle start date</strong>
            <p className="mt-1">
              In <strong>Account & Payouts</strong>, set the date RentFray
              should begin tracking balances. This prevents tenants from seeing
              old pre-RentFray balances.
            </p>
          </div>

          <div>
            <strong>4. Review rent, grace period, and late fees</strong>
            <p className="mt-1">
              Use <strong>Manage</strong> to confirm each tier’s rent amount,
              due day, grace period, and late fee rules before tenant activation.
            </p>
          </div>

          <div>
            <strong>5. Give tenants the instruction sheet</strong>
            <p className="mt-1">
              Print the Tenant Instructions sheet. Write the property code and
              correct tier for each tenant. That's it. Your dashboard will now build itself 
              as tenant use the RentFray portal. 
            </p>
          </div>
        </div>

        <Link
          href="/manager/dashboard"
          className="mt-8 block w-full rounded-2xl bg-[#0f172a] px-5 py-4 text-center text-sm font-semibold text-white transition hover:opacity-90"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}