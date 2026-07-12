import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") || "").trim();

    if (!/^\d{4}$/.test(code)) {
      return NextResponse.json(
        { available: false, error: "Invalid code" },
        { status: 400 }
      );
    }

    const existing = await prisma.property.findUnique({
      where: { propertyCode: code },
      select: { id: true },
    });

    return NextResponse.json({
      available: !existing,
    });
  } catch {
    return NextResponse.json(
      { available: false, error: "Server error" },
      { status: 500 }
    );
  }
}
