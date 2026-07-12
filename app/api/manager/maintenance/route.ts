// app/api/manager/maintenance/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ActiveTenantAssignment = {
  firstName: string | null;
  lastName: string | null;
};

type MaintenanceRequestWithUnit = {
  id: string;
  category: string;
  urgency: string;
  status: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  unit: {
    unitNumber: string;
    tenantAssignments: ActiveTenantAssignment[];
  };
};

type MaintenanceRequestResponse = {
  id: string;
  unitNumber: string;
  tenantName: string | null;
  category: string;
  urgency: string;
  status: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

type MaintenanceSuccessResponse = {
  ok: true;
  requests: MaintenanceRequestResponse[];
};

type MaintenanceErrorResponse = {
  ok: false;
  error: string;
};

const ALLOWED_ROLES = new Set([
  "OWNER",
  "MANAGER",
  "STAFF",
  "MAINTENANCE",
] as const);

function buildTenantName(
  assignment: ActiveTenantAssignment | null
): string | null {
  if (!assignment) return null;

  const tenantName = [assignment.firstName, assignment.lastName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ")
    .trim();

  return tenantName || null;
}

export async function GET() {
  try {
    const session = await getSession();

    if (
      !session ||
      !session.propertyId ||
      !ALLOWED_ROLES.has(
        session.role as "OWNER" | "MANAGER" | "STAFF" | "MAINTENANCE"
      )
    ) {
      return NextResponse.json<MaintenanceErrorResponse>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const requests = await prisma.maintenanceRequest.findMany({
      where: {
        propertyId: session.propertyId,
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        unit: {
          select: {
            unitNumber: true,
            tenantAssignments: {
              where: {
                isCurrent: true,
                moveOutDate: null,
              },
              orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const responseRequests: MaintenanceRequestResponse[] = (
      requests as MaintenanceRequestWithUnit[]
    ).map((row) => {
      const assignment = row.unit.tenantAssignments[0] ?? null;

      return {
        id: row.id,
        unitNumber: row.unit.unitNumber,
        tenantName: buildTenantName(assignment),
        category: row.category,
        urgency: row.urgency,
        status: row.status,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return NextResponse.json<MaintenanceSuccessResponse>({
      ok: true,
      requests: responseRequests,
    });
  } catch (error) {
    console.error("GET /api/manager/maintenance error:", error);

    return NextResponse.json<MaintenanceErrorResponse>(
      { ok: false, error: "Failed to load maintenance." },
      { status: 500 }
    );
  }
}
