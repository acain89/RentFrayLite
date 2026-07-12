import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return d.toISOString().split("T")[0];
}

async function moveOutTenant(formData: FormData) {
  "use server";

  const unitId = clean(formData.get("unitId"));
  const moveOutRaw = clean(formData.get("moveOut"));
  const note = clean(formData.get("note"));
  const exportAcknowledged = clean(formData.get("exportAcknowledged"));

  if (!unitId) {
    throw new Error("Unit is required.");
  }

  if (exportAcknowledged !== "yes") {
    throw new Error("Please confirm the export reminder before move-out.");
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      assignments: {
        where: { moveOut: null },
        orderBy: { moveIn: "desc" },
        include: { tenant: true },
      },
    },
  });

  if (!unit) {
    throw new Error("Unit not found.");
  }

  const activeAssignment = unit.assignments[0];
  if (!activeAssignment) {
    throw new Error("No active tenant assignment found.");
  }

  const moveOut = moveOutRaw ? new Date(`${moveOutRaw}T00:00:00`) : new Date();

  await prisma.unitAssignment.update({
    where: { id: activeAssignment.id },
    data: {
      moveOut,
    },
  });

  await prisma.tenant.update({
    where: { id: activeAssignment.tenantId },
    data: {
      status: "INACTIVE",
    },
  });

  await prisma.unit.update({
    where: { id: unit.id },
    data: {
      occupancyStatus: "VACANT",
    },
  });

  if (note) {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: unit.propertyId,
        unitId: unit.id,
        tenantId: activeAssignment.tenantId,
        type: "OTHER_FEE",
        amount: 0,
        effectiveDate: moveOut,
        memo: `Move-out note: ${note}`,
        source: "MANUAL",
      },
    });
  }

  redirect(`/manager/units/${unit.id}`);
}

export default async function MoveOutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
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

  const activeAssignment = unit.assignments[0];

  if (!activeAssignment) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-xl font-bold">Move Out Tenant</div>
        <div className="rounded border p-4 text-sm text-gray-600">
          This unit does not currently have an active tenant assignment.
        </div>
        <Link
          href={`/manager/units/${unit.id}`}
          className="inline-block rounded border px-4 py-2 text-sm"
        >
          Back to Unit
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Move Out Tenant</h1>
        <div className="text-sm text-gray-600">
          Unit {unit.unitNumber} · {activeAssignment.tenant.name}
        </div>
      </div>

      <div className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
        Before move-out, export the final tenant records if needed.
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={`/api/exports/ledger?unitId=${unit.id}`}
            className="rounded border px-4 py-2 text-sm"
            target="_blank"
            rel="noreferrer"
          >
            Export Ledger CSV
          </a>

          <a
            href={`/api/exports/payments?unitId=${unit.id}`}
            className="rounded border px-4 py-2 text-sm"
            target="_blank"
            rel="noreferrer"
          >
            Export Payments CSV
          </a>
        </div>
      </div>

      <form
        action={moveOutTenant}
        className="max-w-2xl space-y-4 rounded border p-4"
      >
        <input type="hidden" name="unitId" value={unit.id} />

        <div className="space-y-1">
          <label className="text-sm font-medium">Tenant</label>
          <input
            value={activeAssignment.tenant.name}
            disabled
            className="w-full rounded border bg-gray-50 px-3 py-2"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Move In Date</label>
            <input
              value={fmtDate(activeAssignment.moveIn)}
              disabled
              className="w-full rounded border bg-gray-50 px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Move Out Date</label>
            <input
              name="moveOut"
              type="date"
              defaultValue={fmtDate(new Date())}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Optional Note</label>
          <textarea
            name="note"
            rows={4}
            className="w-full rounded border px-3 py-2"
            placeholder="Optional move-out note"
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="exportAcknowledged"
            value="yes"
            required
            className="mt-1"
          />
          <span>
            I exported the final CSV if needed, or I want to continue without exporting.
          </span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-white"
          >
            Complete Move Out
          </button>

          <Link
            href={`/manager/units/${unit.id}`}
            className="rounded border px-4 py-2"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}