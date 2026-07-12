"use client";

import { useMemo, useState } from "react";

type UnitOption = {
  id: string;
  unitNumber: string;
  marketRent: number;
};

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getDaysInMonth(year: number, monthIndexZeroBased: number) {
  return new Date(year, monthIndexZeroBased + 1, 0).getDate();
}

function getProratedAmount(monthlyRent: number, moveInRaw: string) {
  if (!moveInRaw) return null;

  const moveIn = new Date(`${moveInRaw}T00:00:00`);
  if (Number.isNaN(moveIn.getTime())) return null;

  const totalDays = getDaysInMonth(moveIn.getFullYear(), moveIn.getMonth());
  const occupiedDays = totalDays - moveIn.getDate() + 1;
  const dailyRate = Number(monthlyRent || 0) / totalDays;
  const amount = Math.round((dailyRate * occupiedDays + Number.EPSILON) * 100) / 100;

  return {
    totalDays,
    occupiedDays,
    amount,
  };
}

export default function AssignmentFields({
  units,
}: {
  units: UnitOption[];
}) {
  const [unitId, setUnitId] = useState(units[0]?.id || "");
  const [moveIn, setMoveIn] = useState("");
  const [postProratedRent, setPostProratedRent] = useState(true);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === unitId) || null,
    [unitId, units]
  );

  const proration = useMemo(() => {
    if (!selectedUnit) return null;
    return getProratedAmount(Number(selectedUnit.marketRent || 0), moveIn);
  }, [selectedUnit, moveIn]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Unit</label>
        <select
          name="unitId"
          required
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="w-full rounded border px-3 py-2"
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              Unit {unit.unitNumber} — ${Number(unit.marketRent || 0).toFixed(2)}/mo
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Move In Date</label>
          <input
            name="moveIn"
            type="date"
            value={moveIn}
            onChange={(e) => setMoveIn(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Monthly Rent</label>
          <div className="rounded border px-3 py-2 bg-gray-50">
            {selectedUnit ? money(selectedUnit.marketRent) : "—"}
          </div>
        </div>
      </div>

      <label className="flex items-start gap-2 rounded border p-3">
        <input
          type="checkbox"
          name="postProratedRent"
          checked={postProratedRent}
          onChange={(e) => setPostProratedRent(e.target.checked)}
          className="mt-1"
        />
        <div className="text-sm">
          <div className="font-medium">Post prorated first rent charge</div>
          <div className="text-gray-600">
            If enabled, the system will post a RENT_CHARGE for the remainder of the move-in month.
          </div>
        </div>
      </label>

      <div className="rounded border p-3 space-y-1">
        <div className="text-xs text-gray-500">Proration Preview</div>

        {!moveIn ? (
          <div className="text-sm text-gray-600">
            Select a move-in date to preview prorated first rent.
          </div>
        ) : !selectedUnit || !proration ? (
          <div className="text-sm text-gray-600">No preview available.</div>
        ) : (
          <>
            <div className="text-sm">
              Unit {selectedUnit.unitNumber} monthly rent:{" "}
              <span className="font-medium">{money(selectedUnit.marketRent)}</span>
            </div>
            <div className="text-sm">
              Occupied days this month:{" "}
              <span className="font-medium">
                {proration.occupiedDays} / {proration.totalDays}
              </span>
            </div>
            <div className="text-sm">
              Prorated first rent:{" "}
              <span className="font-medium">{money(proration.amount)}</span>
            </div>
            {!postProratedRent ? (
              <div className="text-xs text-amber-700">
                Prorated preview shown only. No charge will be posted unless the box is checked.
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}