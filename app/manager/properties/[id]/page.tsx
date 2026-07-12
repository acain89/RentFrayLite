import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUnitLedgerSummary } from "@/lib/ledger";
import { getUnitDelinquencySummary } from "@/lib/delinquency";

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      units: {
        orderBy: { unitNumber: "asc" },
        include: {
          assignments: {
            where: { moveOut: null },
            orderBy: { moveIn: "desc" },
            include: { tenant: true },
          },
        },
      },
      maintenanceRequests: {
        orderBy: { createdAt: "desc" },
        include: {
          unit: true,
        },
      },
    },
  });

  if (!property) {
    return <div className="p-6">Property not found</div>;
  }

  const unitRows = await Promise.all(
    property.units.map(async (unit: (typeof property.units)[number]) => {
      const summary = await getUnitLedgerSummary(unit.id);
      const delinquency = await getUnitDelinquencySummary(unit.id);

      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        tenantName: unit.assignments[0]?.tenant?.name || "Vacant",
        occupancyStatus: unit.occupancyStatus,
        marketRent: Number(unit.marketRent || 0),
        balance: Number(summary.balance || 0),
        totalPaid: Number(summary.totalPaid || 0),
        isDelinquent: Boolean(delinquency.isDelinquent),
      };
    })
  );

  const totalReceivables = unitRows.reduce(
    (sum, row) => sum + Math.max(row.balance, 0),
    0
  );

  const totalCollected = unitRows.reduce((sum, row) => sum + row.totalPaid, 0);

  const totalBalance = unitRows.reduce((sum, row) => sum + row.balance, 0);

  const delinquentUnits = unitRows.filter((row) => row.isDelinquent).length;

  const delinquentBalance = unitRows
    .filter((row) => row.isDelinquent)
    .reduce((sum, row) => sum + row.balance, 0);

  const openMaintenance = property.maintenanceRequests.filter(
    (r: (typeof property.maintenanceRequests)[number]) => r.status === "OPEN"
  ).length;

  const inProgressMaintenance = property.maintenanceRequests.filter(
    (r: (typeof property.maintenanceRequests)[number]) =>
      r.status === "IN_PROGRESS"
  ).length;

  const completedMaintenance = property.maintenanceRequests.filter(
    (r: (typeof property.maintenanceRequests)[number]) =>
      r.status === "COMPLETED"
  ).length;

  const totalMaintenance = property.maintenanceRequests.length;

  const recentMaintenance = property.maintenanceRequests.slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{property.name}</h1>
          <div className="text-sm text-gray-600">
            Code: {property.code} · Timezone: {property.timezone}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/manager/properties/${property.id}/settings`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Property Settings
          </Link>

          <Link
            href={`/manager/properties/${property.id}/maintenance`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Maintenance
          </Link>

          <Link
            href={`/manager/properties/${property.id}/units/new`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Create Unit
          </Link>

          <Link
            href={`/manager/properties/${property.id}/tenants/new`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Create Tenant
          </Link>

          <a
            href={`/api/exports/ledger?propertyId=${property.id}`}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Export Ledger CSV
          </a>

          <a
            href={`/api/exports/payments?propertyId=${property.id}`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Export Payments CSV
          </a>

          <a
            href={`/api/exports/balances?propertyId=${property.id}`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Export Balances CSV
          </a>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Total Balance</div>
          <div className="text-lg font-semibold">{money(totalBalance)}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Receivables</div>
          <div className="text-lg font-semibold">{money(totalReceivables)}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Collected</div>
          <div className="text-lg font-semibold">{money(totalCollected)}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Delinquent Units</div>
          <div className="text-lg font-semibold">{delinquentUnits}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Delinquent $</div>
          <div className="text-lg font-semibold">{money(delinquentBalance)}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Open Maintenance</div>
          <div className="text-lg font-semibold">{openMaintenance}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">In Progress</div>
          <div className="text-lg font-semibold">{inProgressMaintenance}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Completed</div>
          <div className="text-lg font-semibold">{completedMaintenance}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Maintenance Summary</h2>

          <Link
            href={`/manager/properties/${property.id}/maintenance`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            Open Maintenance
          </Link>
        </div>

        {totalMaintenance === 0 ? (
          <div className="rounded border p-3 text-sm text-gray-500">
            No maintenance requests for this property.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Total Requests</div>
              <div className="text-lg font-semibold">{totalMaintenance}</div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Open</div>
              <div className="text-lg font-semibold">{openMaintenance}</div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">In Progress</div>
              <div className="text-lg font-semibold">{inProgressMaintenance}</div>
            </div>

            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Completed</div>
              <div className="text-lg font-semibold">{completedMaintenance}</div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Recent Maintenance Requests</h2>

          <Link
            href={`/manager/properties/${property.id}/maintenance`}
            className="rounded border px-4 py-2 text-sm font-medium"
          >
            View Full Queue
          </Link>
        </div>

        {recentMaintenance.length === 0 ? (
          <div className="rounded border p-3 text-sm text-gray-500">
            No recent maintenance requests.
          </div>
        ) : (
          <div className="space-y-2">
            {recentMaintenance.map(
              (request: (typeof recentMaintenance)[number]) => (
                <div
                  key={request.id}
                  className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-5 md:items-center"
                >
                  <div>
                    <div className="text-xs text-gray-500">Status</div>
                    <div className="font-medium">{request.status}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Urgency</div>
                    <div>{request.urgency}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Unit</div>
                    <div>{request.unit?.unitNumber || "—"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Submitted</div>
                    <div>{formatDateTime(request.createdAt)}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Category</div>
                    <div>{request.category}</div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Units</h2>

        <div className="space-y-2">
          {unitRows.length === 0 ? (
            <div className="rounded border p-3 text-sm text-gray-500">
              No units found.
            </div>
          ) : (
            unitRows.map((row: (typeof unitRows)[number]) => (
              <div
                key={row.id}
                className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-8 md:items-center"
              >
                <div>
                  <div className="text-xs text-gray-500">Unit</div>
                  <div className="font-medium">{row.unitNumber}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Tenant</div>
                  <div>{row.tenantName}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Status</div>
                  <div>{row.occupancyStatus}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Rent</div>
                  <div>{money(row.marketRent)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Balance</div>
                  <div className="font-medium">{money(row.balance)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Delinquency</div>
                  <div>{row.isDelinquent ? "DELINQUENT" : "CURRENT"}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/manager/units/${row.id}`}
                    className="text-sm underline"
                  >
                    Open
                  </Link>

                  <Link
                    href={`/manager/units/${row.id}/history`}
                    className="text-sm underline"
                  >
                    History
                  </Link>

                  <Link
                    href={`/manager/properties/${property.id}/maintenance`}
                    className="text-sm underline"
                  >
                    Maintenance
                  </Link>

                  {row.occupancyStatus === "VACANT" && (
                    <Link
                      href={`/manager/properties/${property.id}/tenants/new?unitId=${row.id}`}
                      className="text-sm underline"
                    >
                      Assign
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}