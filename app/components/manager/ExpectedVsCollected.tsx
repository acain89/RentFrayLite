// app/components/manager/ExpectedVsCollected.tsx

type Props = {
  expected: number;
  collected: number;
  collectionRate: number; // 0–1
};

function money(v: number) {
  return `$${Number(v || 0).toFixed(2)}`;
}

export default function ExpectedVsCollected({
  expected,
  collected,
  collectionRate,
}: Props) {
  const pct = Math.max(0, Math.min(1, collectionRate || 0));
  const width = `${Math.round(pct * 100)}%`;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-sm font-medium text-neutral-600">
            Expected vs Collected
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-black">
            {money(collected)} / {money(expected)}
          </div>
        </div>
        <div className="text-sm text-neutral-600">
          {Math.round(pct * 100)}%
        </div>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full bg-black transition-all"
          style={{ width }}
        />
      </div>
    </div>
  );
}