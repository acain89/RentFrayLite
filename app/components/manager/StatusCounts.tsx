// app/components/manager/StatusCounts.tsx

type StatusCountsProps = {
  occupiedUnits: number;
  vacantUnits: number;
  delinquentUnits: number;
};

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="text-sm font-medium text-neutral-600">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-black">
        {value}
      </div>
    </div>
  );
}

export default function StatusCounts({
  occupiedUnits,
  vacantUnits,
  delinquentUnits,
}: StatusCountsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatusCard label="Occupied Units" value={occupiedUnits} />
      <StatusCard label="Vacant Units" value={vacantUnits} />
      <StatusCard label="Delinquent Units" value={delinquentUnits} />
    </div>
  );
}