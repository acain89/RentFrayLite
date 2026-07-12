// app/manager/properties/[id]/tenants/remove/page.tsx

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function parseMoveOutDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return new Date();

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();

  return parsed;
}

async function removeTenantAssignment(formData: FormData) {
  "use server";

  const session = await getSession();

  if (!session || !["OWNER", "MANAGER", "STAFF"].includes(session.role)) {
    redirect("/");
  }

  const propertyId = clean(formData.get("propertyId"));
  const unitId = clean(formData.get("unitId"));
  const moveOut = clean(formData.get("moveOut"));
  const reason = clean(formData.get("reason"));

  if (!propertyId) {
    redirect("/manager/properties");
  }

  if (session.propertyId !== propertyId) {
    redirect("/manager/dashboard");
  }

  if (!unitId) {
    redirect(
      `/manager/properties/${propertyId}/tenants/remove?error=${encodeURIComponent(
        "Missing unit selection"
      )}`
    );
  }

  const unit = await prisma.unit.findFirst({
    where: {
      id: unitId,
      propertyId,
    },
    include: {
      tenantAssignments: {
        where: { isCurrent: true },
        orderBy: { moveInDate: "desc" },
        take: 1,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          moveInDate: true,
        },
      },
    },
  });

  if (!unit) {
    redirect(
      `/manager/properties/${propertyId}/tenants/remove?error=${encodeURIComponent(
        "Unit not found"
      )}`
    );
  }

  const activeAssignment = unit.tenantAssignments[0];

  if (!activeAssignment) {
    redirect(
      `/manager/properties/${propertyId}/tenants/remove?error=${encodeURIComponent(
        "No active tenant found for that unit"
      )}`
    );
  }

  const moveOutDate = parseMoveOutDate(moveOut);
  const tenantName = [activeAssignment.firstName, activeAssignment.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.tenantAssignment.update({
      where: { id: activeAssignment.id },
      data: {
        moveOutDate,
        isCurrent: false,
      },
    });

    await tx.unit.update({
      where: { id: unitId },
      data: {
        portalActivated: false,
        tenantPinHash: null,
        portalFirstName: null,
        portalLastName: null,
        activatedAt: null,
        activationSource: null,
      },
    });

    await tx.auditLog.create({
      data: {
        propertyId,
        actorType: session.role,
        actorManagementUserId: session.managementUserId || null,
        action: "TENANT_REMOVED",
        targetType: "UNIT",
        targetId: unitId,
        summary: `Tenant removed from unit ${unit.unitNumber}`,
        metadataJson: JSON.stringify({
          unitNumber: unit.unitNumber,
          tenantName: tenantName || null,
          moveOut: moveOut || null,
          reason: reason || null,
        }),
      },
    });
  });

  redirect(`/manager/properties/${propertyId}?removed=1`);
}

type PageSearchParams = {
  error?: string;
};

type UnitRow = {
  id: string;
  unitNumber: string;
  tenantAssignments: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  }[];
};

export default async function RemoveTenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const session = await getSession();

  if (!session || !["OWNER", "MANAGER", "STAFF"].includes(session.role)) {
    redirect("/");
  }

  const { id } = await params;
  const qp = searchParams ? await searchParams : {};
  const error = qp?.error ? decodeURIComponent(qp.error) : "";

  if (session.propertyId !== id) {
    redirect("/manager/dashboard");
  }

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      units: {
        orderBy: { unitNumber: "asc" },
        include: {
          tenantAssignments: {
            where: { isCurrent: true },
            orderBy: { moveInDate: "desc" },
            take: 1,
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!property) {
    return <div className="p-6">Property not found.</div>;
  }

  const occupiedUnits = property.units.filter(
    (unit: UnitRow) => unit.tenantAssignments.length > 0
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Remove Tenant</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {property.name} ({property.propertyCode})
        </p>
      </div>

      {occupiedUnits.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-neutral-700">
          No occupied units found.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {occupiedUnits.length > 0 ? (
        <form
          action={removeTenantAssignment}
          className="space-y-4 rounded-xl border bg-white p-4"
        >
          <input type="hidden" name="propertyId" value={property.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-sm font-medium">Occupied Unit</div>
              <select
                name="unitId"
                className="w-full rounded-lg border px-3 py-2"
                required
              >
                {occupiedUnits.map((unit: UnitRow) => {
                  const assignment = unit.tenantAssignments[0];
                  const tenantName = [assignment?.firstName, assignment?.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim();

                  return (
                    <option key={unit.id} value={unit.id}>
                      {unit.unitNumber} — {tenantName || "Active Tenant"}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">Move-Out Date</div>
              <input
                type="date"
                name="moveOut"
                className="w-full rounded-lg border px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <div className="text-sm font-medium">Reason</div>
            <textarea
              name="reason"
              className="min-h-[110px] w-full rounded-lg border px-3 py-2"
              placeholder="Optional removal note"
            />
          </label>

          <div className="rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-700">
            This will:
            <div>• set move-out on the active assignment</div>
            <div>• clear portal tenant name</div>
            <div>• disable portal access</div>
            <div>• clear the tenant PIN</div>
            <div>• make the unit available again</div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            Remove Tenant
          </button>
        </form>
      ) : null}
    </div>
  );
}