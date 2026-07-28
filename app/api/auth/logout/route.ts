import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/session";

export async function POST() {
  await destroyCurrentSession();

  return NextResponse.json({
    success: true,
  });
}
