import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type IncomingRequestResponseRow = {
  id: string;
  propertyName: string;
  propertyCode: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  contactName: string;
  contactEmail: string;
  status: string;
  createdAt: string;
  propertyType: string;
  address: string;
  unitCount: number;
  notes: string;
};

type IncomingRequestsResponse = {
  ok: true;
  requests: IncomingRequestResponseRow[];
};

type IncomingRequestsErrorResponse = {
  ok: false;
  error: string;
};

export async function GET() {
  try {
    const requests = await prisma.setupRequest.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        propertyName: true,
        propertyType: true,
        address: true,
        contactName: true,
        contactInfo: true,
        unitCount: true,
        notes: true,
        status: true,
        createdAt: true,
      },
    });

    const response: IncomingRequestsResponse = {
      ok: true,
      requests: requests.map((request: typeof requests[number]) => ({
        id: request.id,
        propertyName: request.propertyName ?? "",
        propertyCode: "",
        requesterName: request.contactName ?? "",
        requesterEmail: "",
        requesterPhone: "",
        contactName: request.contactName ?? "",
        contactEmail: request.contactInfo ?? "",
        status: request.status ?? "",
        createdAt: request.createdAt.toISOString(),
        propertyType: request.propertyType ?? "",
        address: request.address ?? "",
        unitCount: request.unitCount ?? 0,
        notes: request.notes ?? "",
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to load incoming requests:", error);

    const response: IncomingRequestsErrorResponse = {
      ok: false,
      error: "Failed to load incoming requests.",
    };

    return NextResponse.json(response, { status: 500 });
  }
}
