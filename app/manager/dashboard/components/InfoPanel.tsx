"use client";

type Props = {
  onClose: () => void;
  propertyName: string;
  propertyCode: string;
};

function OverlayShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#173024]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--rf-border)] bg-[var(--rf-bg-panel)] shadow-[var(--rf-shadow-lg)] sm:h-auto sm:max-h-[90vh] sm:rounded-[32px]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--rf-border)] bg-[rgba(255,255,255,0.28)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--rf-text)]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-[var(--rf-text-soft)]">
                {subtitle}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rf-btn rf-btn-secondary px-3 text-sm"
          >
            Close
          </button>
        </div>

        <div className="rf-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>

        <div className="border-t border-[var(--rf-border)] bg-[rgba(255,255,255,0.18)] px-4 py-4 sm:px-6" />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-4 shadow-[var(--rf-shadow-sm)]">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--rf-text-muted)]">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-1 text-sm text-[var(--rf-text-soft)]">
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function LegendRow({
  dotClass,
  label,
  description,
}: {
  dotClass: string;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.55)] px-3 py-3">
      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${dotClass}`} />
      <div>
        <div className="text-sm font-semibold text-[var(--rf-text)]">
          {label}
        </div>
        <div className="mt-1 text-xs text-[var(--rf-text-soft)]">
          {description}
        </div>
      </div>
    </div>
  );
}

export default function InfoPanel({
  onClose,
  propertyName,
  propertyCode,
}: Props) {
  return (
    <OverlayShell
      title="Property Info"
      subtitle="Read-only property details, status legend, and dashboard notes."
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <SectionCard title="Property name">
            <div className="text-lg font-semibold text-[var(--rf-text)]">
              {propertyName}
            </div>
          </SectionCard>

          <SectionCard title="Property code">
            <div className="font-mono text-lg font-semibold text-[var(--rf-text)]">
              {propertyCode}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Status dot legend"
          subtitle="These colors match the unit-level payment and due-state indicators."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <LegendRow
              dotClass="bg-emerald-500"
              label="Paid"
              description="Balance is fully satisfied."
            />
            <LegendRow
              dotClass="bg-blue-500"
              label="In grace period"
              description="Balance is due, but still within grace."
            />
            <LegendRow
              dotClass="bg-yellow-400"
              label="Payment pending"
              description="Payment was initiated and is still processing."
            />
            <LegendRow
              dotClass="bg-orange-500"
              label="Payment failed"
              description="A payment attempt failed and needs attention."
            />
            <LegendRow
              dotClass="bg-red-500"
              label="Past due"
              description="Balance remains unpaid beyond the grace period."
            />
          </div>
        </SectionCard>

        <SectionCard
  title="Processing fee"
  subtitle="Simple, upfront payment transparency."
>
  <div className="rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.55)] px-3 py-3">
    <div className="text-sm leading-6 text-[var(--rf-text-soft)]">
      A small, single-digit processing fee is added to each tenant payment.
      That fee is what keeps RentFray free for businesses while supporting the platform,
      payment processing, and ongoing system upkeep.
    </div>
  </div>
</SectionCard>
      </div>
    </OverlayShell>
  );
}