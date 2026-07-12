// app/api/manager/proration/route.ts

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getProrationSummary } from "@/lib/proration";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (!session || !["OWNER", "MANAGER", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const moveInRaw = clean(body.moveInDate);
    const rentRaw = Number(body.monthlyRent);

    if (!moveInRaw || !Number.isFinite(rentRaw)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const moveInDate = new Date(`${moveInRaw}T00:00:00`);

    if (Number.isNaN(moveInDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = getProrationSummary(moveInDate, rentRaw);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("Proration error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
