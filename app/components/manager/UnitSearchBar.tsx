// app/components/manager/UnitSearchBar.tsx

type UnitSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function UnitSearchBar({
  value,
  onChange,
}: UnitSearchBarProps) {
  return (
    <div className="w-full">
      <label className="mb-2 block text-sm font-medium text-neutral-700">
        Search Units
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by unit number or tenant name..."
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-black"
      />
    </div>
  );
}