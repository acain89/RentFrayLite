// app/manager/properties/[id]/tenants/new/page.tsx

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPin, isValidFourDigitPin } from "@/lib/pin";

export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function parseMoveInDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return new Date();

  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();

  return parsed;
}

async function createTenantAssignment(formData: FormData) {
  "use server";

  const session = await getSession();

  if (!session || !["OWNER", "MANAGER", "STAFF"].includes(session.role)) {
    redirect("/");
  }

  const propertyId = clean(formData.get("propertyId"));
  const unitId = clean(formData.get("unitId"));
  const firstName = clean(formData.get("firstName"));
  const lastName = clean(formData.get("lastName"));
  const moveIn = clean(formData.get("moveIn"));
  const activateNow = clean(formData.get("activateNow")) === "yes";
  const pin = clean(formData.get("pin"));

  if (!propertyId) {
    redirect("/manager/properties");
  }

  if (session.propertyId !== propertyId) {
    redirect("/manager/dashboard");
  }

  if (!unitId || !firstName || !lastName) {
    redirect(
      `/manager/properties/${propertyId}/tenants/new?error=${encodeURIComponent(
        "Missing required fields"
      )}`
    );
  }

  if (activateNow && !isValidFourDigitPin(pin)) {
    redirect(
      `/manager/properties/${propertyId}/tenants/new?error=${encodeURIComponent(
        "PIN must be exactly 4 digits"
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
        take: 1,
      },
    },
  });

  if (!unit) {
    redirect(
      `/manager/properties/${propertyId}/tenants/new?error=${encodeURIComponent(
        "Unit not found"
      )}`
    );
  }

  if (unit.tenantAssignments.length > 0) {
    redirect(
      `/manager/properties/${propertyId}/tenants/new?error=${encodeURIComponent(
        "Unit already has an active tenant"
      )}`
    );
  }

  const fullName = `${firstName} ${lastName}`.trim();
  const pinHash = activateNow ? await hashPin(pin) : null;
  const moveInDate = parseMoveInDate(moveIn);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.tenantAssignment.create({
      data: {
        propertyId,
        unitId,
        firstName,
        lastName,
        moveInDate,
        isCurrent: true,
        createdByManagementUserId: session.managementUserId || null,
      },
    });

    await tx.unit.update({
      where: { id: unitId },
      data: {
        portalActivated: activateNow,
        tenantPinHash: pinHash,
        portalFirstName: firstName,
        portalLastName: lastName,
        activatedAt: activateNow ? new Date() : null,
        activationSource: activateNow ? "STAFF_RESET" : null,
      },
    });

    await tx.auditLog.create({
      data: {
        propertyId,
        actorType: session.role,
        actorManagementUserId: session.managementUserId || null,
        action: "TENANT_ASSIGNED",
        targetType: "UNIT",
        targetId: unitId,
        summary: `Tenant assigned to unit ${unit.unitNumber}`,
        metadataJson: JSON.stringify({
          unitNumber: unit.unitNumber,
          tenantName: fullName,
          moveIn: moveIn || null,
          activateNow,
        }),
      },
    });
  });

  redirect(`/manager/properties/${propertyId}?assigned=1`);
}

type PageSearchParams = {
  error?: string;
};

type UnitRow = {
  id: string;
  unitNumber: string;
  tenantAssignments: { id: string }[];
};

export default async function NewTenantAssignmentPage({
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
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });

  if (!property) {
    return <div className="p-6">Property not found.</div>;
  }

  const availableUnits = property.units.filter(
    (unit: UnitRow) => unit.tenantAssignments.length === 0
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assign Tenant</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {property.name} ({property.propertyCode})
        </p>
      </div>

      {availableUnits.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-neutral-700">
          No available units.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {availableUnits.length > 0 ? (
        <form
          action={createTenantAssignment}
          className="space-y-4 rounded-xl border bg-white p-4"
        >
          <input type="hidden" name="propertyId" value={property.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-sm font-medium">Unit</div>
              <select
                name="unitId"
                className="w-full rounded-lg border px-3 py-2"
                required
              >
                {availableUnits.map((unit: UnitRow) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.unitNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">Move-In Date</div>
              <input
                type="date"
                name="moveIn"
                className="w-full rounded-lg border px-3 py-2"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">First Name</div>
              <input
                name="firstName"
                className="w-full rounded-lg border px-3 py-2"
                required
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">Last Name</div>
              <input
                name="lastName"
                className="w-full rounded-lg border px-3 py-2"
                required
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="font-medium">Portal Activation</div>

            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="activateNow" value="no" defaultChecked />
              Do not activate now
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="activateNow" value="yes" />
              Activate now with a 4-digit PIN
            </label>

            <label className="block space-y-1">
              <div className="text-sm font-medium">4-Digit PIN</div>
              <input
                name="pin"
                inputMode="numeric"
                maxLength={4}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Only required if activating now"
              />
            </label>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            Assign Tenant
          </button>
        </form>
      ) : null}
    </div>
  );
}