import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Body = {
  unitId?: unknown;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (
      !session ||
      !session.propertyId ||
      (session.role !== "OWNER" && session.role !== "MANAGER")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const unitId = clean(body.unitId);

    if (!unitId) {
      return NextResponse.json({ error: "Missing unitId." }, { status: 400 });
    }

    const existing = await prisma.unit.findFirst({
      where: {
        id: unitId,
        propertyId: session.propertyId,
        isActive: false,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Inactive unit not found." },
        { status: 404 }
      );
    }

    await prisma.unit.delete({
      where: { id: unitId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/manager/units/delete failed", error);
    return NextResponse.json(
      { error: "Failed to delete inactive unit." },
      { status: 500 }
    );
  }
}
