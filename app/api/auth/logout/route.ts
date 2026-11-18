import { boundedRawBody } from "@/lib/boundedRawBody";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/session";

export async function POST(request: Request) {
  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  if (request.body) {
    try { await boundedRawBody(request, 0); }
    catch { return NextResponse.json({ error: "This action does not accept a request body." }, { status: 400 }); }
  }

  await destroyCurrentSession();

  return NextResponse.json({
    success: true,
  });
}
