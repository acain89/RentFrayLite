import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/session";

export async function POST(request: Request) {
  await destroyCurrentSession();

  return NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
}
