import { prisma } from "@/lib/prisma";
import {
  getPropertySettings,
  upsertPropertySettings,
} from "@/lib/propertySettings";

export const dynamic = "force-dynamic";

type PropertyStatus = "SETUP" | "TEST" | "READY" | "LIVE" | "SUSPENDED";

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parsePropertyStatus(value: unknown): PropertyStatus {
  const raw = String(value ?? "SETUP").toUpperCase();

  switch (raw) {
    case "TEST":
    case "READY":
    case "LIVE":
    case "SUSPENDED":
      return raw;
    case "SETUP":
    default:
      return "SETUP";
  }
}

async function saveSettings(formData: FormData) {
  "use server";

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  if (!propertyId) {
    throw new Error("Missing propertyId");
  }

  const rentDueDay = clampInt(formData.get("billingDay"), 1, 1, 31);
  const gracePeriodDays = clampInt(formData.get("gracePeriodDays"), 5, 0, 31);

  const lateFeeFlatCents = Math.round(
    clampFloat(formData.get("lateFeeValue"), 50, 0, 100000) * 100
  );

  const status = parsePropertyStatus(formData.get("lifecycleStatus"));

  await upsertPropertySettings(propertyId, {
    rentDueDay,
    gracePeriodDays,
    lateFeeFlatCents,
    lateFeeEnabled: lateFeeFlatCents > 0,
  });

  await prisma.property.update({
    where: { id: propertyId },
    data: { status },
  });
}

export default async function PropertySettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const property = await prisma.property.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!property) {
    return <div className="p-6">Property not found</div>;
  }

  const settings = await getPropertySettings(property.id);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Property Settings</h1>
        <div className="text-sm text-gray-600">{property.name}</div>
      </div>

      <form
        action={saveSettings}
        className="max-w-2xl space-y-4 rounded border p-4"
      >
        <input type="hidden" name="propertyId" value={property.id} />

        <div className="space-y-1">
          <label className="text-sm font-medium">Lifecycle Status</label>
          <select
            name="lifecycleStatus"
            defaultValue={property.status || "SETUP"}
            className="w-full rounded border px-3 py-2"
          >
            <option value="SETUP">SETUP</option>
            <option value="TEST">TEST</option>
            <option value="READY">READY</option>
            <option value="LIVE">LIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
          <div className="text-xs text-gray-500">
            Controls payment availability and platform behavior.
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Billing Day</label>
          <input
            name="billingDay"
            type="number"
            min={1}
            max={31}
            defaultValue={settings.rentDueDay}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Grace Period Days</label>
          <input
            name="gracePeriodDays"
            type="number"
            min={0}
            max={31}
            defaultValue={settings.gracePeriodDays}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Late Fee Value</label>
          <input
            name="lateFeeValue"
            type="number"
            step="0.01"
            min={0}
            defaultValue={(settings.lateFeeFlatCents ?? 0) / 100}
            className="w-full rounded border px-3 py-2"
          />
          <div className="text-xs text-gray-500">
            Enter a flat dollar amount. Leave at 0 to disable late fees.
          </div>
        </div>

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Save Settings
        </button>
      </form>
    </div>
  );
}