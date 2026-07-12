// app/components/manager/DashboardSummary.tsx

type DashboardSummaryProps = {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  delinquentUnits: number;
};

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="text-sm font-medium text-neutral-600">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-black">
        {value}
      </div>
    </div>
  );
}

export default function DashboardSummary({
  totalUnits,
  occupiedUnits,
  vacantUnits,
  delinquentUnits,
}: DashboardSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Total Units" value={totalUnits} />
      <SummaryCard label="Has used portal" value={occupiedUnits} />
      <SummaryCard label="Has not used portal" value={vacantUnits} />
      <SummaryCard label="Delinquent" value={delinquentUnits} />
    </div>
  );
}