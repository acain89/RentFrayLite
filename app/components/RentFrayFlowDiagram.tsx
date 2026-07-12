// app/components/RentFrayFlowDiagram.tsx

export default function RentFrayFlowDiagram() {
  return (
    <section className="w-full rounded-[28px] bg-[#eef3f7] p-3 sm:p-4 md:p-6">
      <div className="mx-auto max-w-6xl rounded-[30px] bg-[#dfe6ec] p-4 sm:p-5 md:p-7">
        <div className="rounded-[28px] bg-[#e7edf2] p-4 sm:p-5 md:p-6">
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl md:text-4xl">
              This is how RentFray works
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px] md:text-base">
              Businesses and tenants use RentFray. Stripe processes the payment.
              The business gets paid automatically.
            </p>
          </div>

          {/* Mobile */}
          <div className="mt-6 space-y-3 lg:hidden">
            <MobileCard
              title="BUSINESS"
              subtitle="Owner / Manager"
              icon={<BusinessIcon />}
            />

            <ArrowDown />

            <MobileCard
              title="RENTFRAY"
              subtitle="Tracks & Organizes:"
              icon={<RentFrayIcon />}
              accent="rentfray"
              pills={["Accounts", "Balances", "Payments"]}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-3">
                <ArrowDown />
                <MobileCard
                  title="TENANTS"
                  subtitle="Portal Users"
                  icon={<TenantsIcon />}
                />
              </div>

              <div className="space-y-3">
                <ArrowDown />
                <MobileCard
                  title="STRIPE"
                  subtitle="Secure payment processing"
                  icon={<StripeIcon />}
                  accent="stripe"
                />
                <ArrowDown />
                <MobileCard
                  title="CONNECTED ACCOUNT"
                  subtitle="Payout destination"
                  icon={<AccountIcon />}
                  accent="success"
                />
              </div>
            </div>

            <div className="rounded-full border border-slate-200 bg-white px-4 py-3 text-center text-[11px] font-bold text-slate-800 shadow-sm sm:text-xs">
              Payments are processed securely by Stripe. RentFray does not
              collect or hold your money.
            </div>
          </div>

          {/* Desktop */}
          <div className="relative mt-7 hidden rounded-[28px] bg-[#dfe5eb] p-5 lg:block xl:p-6">
            <svg
              viewBox="0 0 1120 500"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="rfArrowSolid"
                  markerWidth="12"
                  markerHeight="12"
                  refX="10"
                  refY="6"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L12,6 L0,12 Z" fill="#2563eb" />
                </marker>
              </defs>

              {/* 1. Business -> RentFray */}
              <path
                d="M302 150 H430"
                fill="none"
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#rfArrowSolid)"
              />

              {/* 2. RentFray -> Tenants */}
              <path
                d="M430 300 H302"
                fill="none"
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#rfArrowSolid)"
              />

              {/* 3. Tenants -> RentFray */}
              <path
                d="M302 350 C345 350 388 340 430 315"
                fill="none"
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#rfArrowSolid)"
              />

              {/* 4. RentFray -> Stripe */}
              <path
                d="M690 150 H818"
                fill="none"
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#rfArrowSolid)"
              />

              {/* 5. Stripe -> Connected Account */}
              <path
                d="M944 188 V292"
                fill="none"
                stroke="#2563eb"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#rfArrowSolid)"
              />
            </svg>

            <div className="grid grid-cols-[250px_minmax(0,1fr)_250px] items-center gap-8 xl:grid-cols-[270px_minmax(0,1fr)_270px] xl:gap-10">
              <div className="space-y-9 xl:space-y-10">
                <DesktopCard
                  title="BUSINESS"
                  subtitle="Owner / Manager"
                  icon={<BusinessIcon />}
                />

                <DesktopCard
                  title="TENANTS"
                  subtitle="Portal Users"
                  icon={<TenantsIcon />}
                />
              </div>

              <div className="flex items-center justify-center">
                <div className="w-full max-w-[320px] rounded-[28px] border border-emerald-300 bg-gradient-to-br from-[#8fd9b6] to-[#6fc89e] px-5 py-6 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)] xl:max-w-[340px]">
                  <div className="text-center text-[1.95rem] font-black leading-none xl:text-[2.15rem]">
                    RENTFRAY
                  </div>

                  <p className="mt-5 text-center text-[1rem] font-semibold leading-6 text-white/95">
                    Tracks &amp; Organizes:
                  </p>

                  <div className="mt-5 flex items-center justify-center gap-2">
                    <Pill>Accounts</Pill>
                    <Pill>Balances</Pill>
                    <Pill>Payments</Pill>
                  </div>
                </div>
              </div>

              <div className="space-y-9 xl:space-y-10">
                <DesktopCard
                  title="STRIPE"
                  subtitle="Secure payment processing"
                  icon={<StripeIcon />}
                  accent="stripe"
                />

                <DesktopCard
                  title="CONNECTED ACCOUNT"
                  subtitle="Payout destination"
                  icon={<AccountIcon />}
                  accent="success"
                />
              </div>
            </div>

            <div className="mt-8 rounded-full border border-slate-200 bg-white px-5 py-3 text-center text-xs font-bold text-slate-800 shadow-sm xl:text-sm">
              Payments are processed securely by Stripe. RentFray does not
              collect or hold your money.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DesktopCard({
  title,
  subtitle,
  icon,
  accent = "default",
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent?: "default" | "stripe" | "success";
}) {
  const accentStyles = {
    default: "bg-blue-50 text-blue-600 border-blue-100",
    stripe: "bg-violet-50 text-violet-600 border-violet-100",
    success: "bg-emerald-50 text-emerald-600 border-emerald-100",
  } as const;

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.07)] xl:px-5 xl:py-5">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border xl:h-14 xl:w-14 ${accentStyles[accent]}`}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <div className="text-[1.05rem] font-black leading-tight text-slate-950 xl:text-[1.2rem]">
            {title}
          </div>
          <div className="mt-1 text-sm text-slate-600 xl:text-[15px]">
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileCard({
  title,
  subtitle,
  icon,
  accent = "default",
  pills,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent?: "default" | "rentfray" | "stripe" | "success";
  pills?: string[];
}) {
  const cardStyles = {
    default:
      "border-slate-200 bg-white text-slate-950 shadow-[0_10px_22px_rgba(15,23,42,0.07)]",
    rentfray:
      "border-emerald-300 bg-gradient-to-br from-[#8fd9b6] to-[#6fc89e] text-white shadow-[0_14px_28px_rgba(15,23,42,0.12)]",
    stripe:
      "border-slate-200 bg-white text-slate-950 shadow-[0_10px_22px_rgba(15,23,42,0.07)]",
    success:
      "border-slate-200 bg-white text-slate-950 shadow-[0_10px_22px_rgba(15,23,42,0.07)]",
  } as const;

  const iconStyles = {
    default: "bg-blue-50 text-blue-600 border-blue-100",
    rentfray: "bg-white/15 text-white border-white/20",
    stripe: "bg-violet-50 text-violet-600 border-violet-100",
    success: "bg-emerald-50 text-emerald-600 border-emerald-100",
  } as const;

  return (
    <div className={`rounded-[22px] border p-4 ${cardStyles[accent]}`}>
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${iconStyles[accent]}`}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <div className="text-base font-black leading-tight">{title}</div>
          <div className="mt-1 text-sm leading-5 opacity-90">{subtitle}</div>
        </div>
      </div>

      {pills ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {pills.map((pill) => (
            <Pill key={pill}>{pill}</Pill>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-slate-900 shadow-sm">
      {children}
    </span>
  );
}

function ArrowDown() {
  return (
    <div className="flex justify-center py-0.5">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 text-blue-600"
        aria-hidden="true"
      >
        <path d="M11 3h2v11h5l-6 7-6-7h5z" fill="currentColor" />
      </svg>
    </div>
  );
}

function BusinessIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true">
      <rect x="8" y="16" width="18" height="32" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="24" y="8" width="18" height="40" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="42" y="24" width="14" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M4 52h56" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function TenantsIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true">
      <circle cx="20" cy="20" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="44" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M6 50c2-10 10-16 20-16s18 6 20 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 50c2-8 8-12 16-12 6 0 12 4 14 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function RentFrayIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true">
      <rect x="10" y="12" width="44" height="34" rx="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M18 24h28M18 32h18M18 40h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="48" r="8" fill="currentColor" />
    </svg>
  );
}

function StripeIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true">
      <path
        d="M32 8 48 14v14c0 14-9 24-16 28-7-4-16-14-16-28V14L32 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="m25 31 5 5 10-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7 xl:h-8 xl:w-8" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="3" />
      <path
        d="M37 22c-1-2-3-3-6-3-4 0-7 2-7 5 0 4 3 5 8 6 5 1 8 2 8 6 0 4-4 7-9 7-4 0-7-1-9-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M32 16v32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}