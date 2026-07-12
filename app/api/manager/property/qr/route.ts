// app/api/manager/property/qr/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("rf_session");

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = verifySessionToken(sessionCookie.value);

    if (!session || session.role !== "MANAGER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const property = await prisma.property.findUnique({
      where: { id: session.propertyId },
      select: {
        id: true,
        name: true,
        propertyCode: true,
      },
    });

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      property: {
        id: property.id,
        name: property.name,
        propertyCode: property.propertyCode,
      },
      qrValue: property.propertyCode,
    });
  } catch (error) {
    console.error("manager property qr GET error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
