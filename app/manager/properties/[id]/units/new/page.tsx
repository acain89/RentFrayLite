import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

async function createUnit(formData: FormData) {
  "use server";

  const propertyId = clean(formData.get("propertyId"));
  const unitNumber = clean(formData.get("unitNumber"));
  const tier = clean(formData.get("tier")) || "Standard";
  const marketRent = Math.max(0, Number(formData.get("marketRent") || 0));
  const occupancyStatus = clean(formData.get("occupancyStatus")) || "vacant";

  if (!propertyId || !unitNumber) {
    throw new Error("Property and unit number are required.");
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });

  if (!property) {
    throw new Error("Property not found.");
  }

  const existing = await prisma.unit.findFirst({
    where: {
      propertyId,
      unitNumber,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Unit number already exists for this property.");
  }

  await prisma.unit.create({
    data: {
      propertyId,
      unitNumber,
      tier,
      marketRent,
      occupancyStatus,
    },
  });

  redirect(`/manager/properties/${propertyId}`);
}

export default async function NewUnitPage({
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
      code: true,
    },
  });

  if (!property) {
    return <div className="p-6">Property not found</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Unit</h1>
        <div className="text-sm text-gray-600">
          {property.name} · {property.code}
        </div>
      </div>

      <form action={createUnit} className="max-w-2xl space-y-4 rounded border p-4">
        <input type="hidden" name="propertyId" value={property.id} />

        <div className="space-y-1">
          <label className="text-sm font-medium">Unit Number</label>
          <input
            name="unitNumber"
            type="text"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="101"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Tier</label>
          <input
            name="tier"
            type="text"
            defaultValue="Standard"
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Market Rent</label>
          <input
            name="marketRent"
            type="number"
            min={0}
            step="0.01"
            defaultValue={1200}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Occupancy Status</label>
          <select
            name="occupancyStatus"
            defaultValue="vacant"
            className="w-full rounded border px-3 py-2"
          >
            <option value="vacant">vacant</option>
            <option value="occupied">occupied</option>
            <option value="notice">notice</option>
            <option value="offline">offline</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Create Unit
        </button>
      </form>
    </div>
  );
}