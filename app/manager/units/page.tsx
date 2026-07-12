export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function UnitsPage() {
  const units = await prisma.unit.findMany({
    include: {
      tenantAssignments: {
        where: { isCurrent: true },
        orderBy: { moveInDate: "desc" },
        take: 1,
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { unitNumber: "asc" },
  });

  type UnitRow = (typeof units)[number];

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Units</h1>

      <div className="space-y-3">
        {units.map((u: UnitRow) => {
          const assignment = u.tenantAssignments[0] ?? null;
          const tenantName = assignment
            ? `${assignment.firstName || ""} ${assignment.lastName || ""}`.trim()
            : "";

          return (
            <Link
              key={u.id}
              href={`/manager/units/${u.id}`}
              className="block rounded border p-4 hover:bg-gray-50"
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">Unit {u.unitNumber}</div>
                  <div className="text-sm text-gray-500">
                    {tenantName || "Vacant"}
                  </div>
                </div>

                <div>${Number(u.baseRent || 0).toFixed(2)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}