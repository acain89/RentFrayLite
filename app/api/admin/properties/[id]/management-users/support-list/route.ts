import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id: propertyId } = await params;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        propertyCode: true,
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found." },
        { status: 404 }
      );
    }

    const users = await prisma.managementUser.findMany({
      where: { propertyId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      property,
      users,
    });
  } catch (error) {
    console.error(
      "GET /api/admin/properties/[id]/management-users/support-list failed",
      error
    );

    return NextResponse.json(
      { error: "Failed to load management users." },
      { status: 500 }
    );
  }
}