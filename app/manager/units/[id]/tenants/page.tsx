import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hashPin, isValidFourDigitPin } from "@/lib/pin";

export const dynamic = "force-dynamic";

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US");
}

export default async function UnitTenantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      property: true,
      assignments: {
        where: { moveOut: null },
        orderBy: { moveIn: "desc" },
        include: { tenant: true },
      },
    },
  });

  if (!unit) {
    return <div className="p-6">Unit not found</div>;
  }

  const activeAssignment = unit.assignments[0] ?? null;
  const tenant = activeAssignment?.tenant ?? null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Unit {unit.unitNumber} Tenant</h1>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <div>
              {unit.property.name} · {unit.property.code}
            </div>
            <div>Status: {unit.occupancyStatus}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/manager/units/${unit.id}`}
            className="inline-block rounded border px-4 py-2 text-sm font-medium"
          >
            Back to Unit
          </Link>

          {tenant ? (
            <Link
              href={`/manager/units/${unit.id}/move-out`}
              className="inline-block rounded border px-4 py-2 text-sm font-medium"
            >
              Move Out Tenant
            </Link>
          ) : null}
        </div>
      </div>

      {!tenant || !activeAssignment ? (
        <div className="rounded border p-4 text-sm text-gray-600">
          No active tenant is assigned to this unit.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Tenant Name</div>
              <div className="text-lg font-semibold">{tenant.name || "—"}</div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Email</div>
              <div className="text-lg font-semibold break-all">
                {tenant.email || "—"}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Phone</div>
              <div className="text-lg font-semibold">{tenant.phone || "—"}</div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Tenant Status</div>
              <div className="text-lg font-semibold">{tenant.status || "—"}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Move In Date</div>
              <div className="text-lg font-semibold">
                {fmtDate(activeAssignment.moveIn)}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Move Out Date</div>
              <div className="text-lg font-semibold">
                {fmtDate(activeAssignment.moveOut)}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Unit</div>
              <div className="text-lg font-semibold">{unit.unitNumber}</div>
            </div>
          </div>

          <ResetPinCard tenantId={tenant.id} tenantName={tenant.name} />
        </>
      )}
    </div>
  );
}

function ResetPinCard({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  async function resetPin(formData: FormData) {
    "use server";

    const pin = String(formData.get("pin") || "").trim();

    if (!isValidFourDigitPin(pin)) {
      throw new Error("PIN must be exactly 4 digits.");
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        pinHash: hashPin(pin),
      },
    });
  }

  return (
    <form action={resetPin} className="max-w-xl rounded border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Reset Tenant PIN</h2>
        <div className="text-sm text-gray-600">
          Reset PIN for {tenantName}. Tenant login uses Property Code + Unit
          Number + 4-digit PIN.
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">New 4-Digit PIN</label>
        <input
          name="pin"
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          minLength={4}
          required
          className="w-full rounded border px-3 py-2"
          placeholder="1234"
        />
      </div>

      <button
        type="submit"
        className="rounded bg-black px-4 py-2 text-white"
      >
        Reset PIN
      </button>
    </form>
  );
}