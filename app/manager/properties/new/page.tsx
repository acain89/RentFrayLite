import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

async function createProperty(formData: FormData) {
  "use server";

  const name = clean(formData.get("name"));
  const code = clean(formData.get("code")).toUpperCase();
  const timezone = clean(formData.get("timezone")) || "America/Chicago";
  const unitCount = Math.max(0, Number(formData.get("unitCount") || 0));
  const marketRent = Math.max(0, Number(formData.get("marketRent") || 0));
  const billingDay = Math.min(31, Math.max(1, Number(formData.get("billingDay") || 1)));
  const gracePeriodDays = Math.min(
    31,
    Math.max(0, Number(formData.get("gracePeriodDays") || 5))
  );
  const rawLateFeeType = clean(formData.get("lateFeeType")).toUpperCase();
  const lateFeeType = rawLateFeeType === "PERCENT" ? "PERCENT" : "FLAT";
  const lateFeeValue = Math.max(0, Number(formData.get("lateFeeValue") || 50));

  if (!name || !code) {
    throw new Error("Name and code are required.");
  }

  const existing = await prisma.property.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Property code already exists.");
  }

  const property = await prisma.property.create({
    data: {
      name,
      code,
      timezone,
      propertySettings: {
        create: {
          billingDay,
          gracePeriodDays,
          lateFeeType,
          lateFeeValue,
        },
      },
      units: {
        create: Array.from({ length: unitCount }).map((_, i) => ({
          unitNumber: String(i + 1).padStart(3, "0"),
          tier: "Standard",
          marketRent,
          occupancyStatus: "vacant",
        })),
      },
    },
    select: { id: true },
  });

  redirect(`/manager/properties/${property.id}`);
}

export default function NewPropertyPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Property</h1>
        <div className="text-sm text-gray-600">
          Preview-first property setup
        </div>
      </div>

      <form action={createProperty} className="max-w-2xl space-y-4 rounded border p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Property Name</label>
          <input
            name="name"
            type="text"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="Demo Property"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Property Code</label>
          <input
            name="code"
            type="text"
            required
            className="w-full rounded border px-3 py-2"
            placeholder="DEMO"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Timezone</label>
          <input
            name="timezone"
            type="text"
            defaultValue="America/Chicago"
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Preview Unit Count</label>
            <input
              name="unitCount"
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Default Market Rent</label>
            <input
              name="marketRent"
              type="number"
              min={0}
              step="0.01"
              defaultValue={1200}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Billing Day</label>
            <input
              name="billingDay"
              type="number"
              min={1}
              max={31}
              defaultValue={1}
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
              defaultValue={5}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Late Fee Type</label>
            <select
              name="lateFeeType"
              defaultValue="FLAT"
              className="w-full rounded border px-3 py-2"
            >
              <option value="FLAT">FLAT</option>
              <option value="PERCENT">PERCENT</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Late Fee Value</label>
            <input
              name="lateFeeValue"
              type="number"
              min={0}
              step="0.01"
              defaultValue={50}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white"
        >
          Create Property
        </button>
      </form>
    </div>
  );
}