import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPin, isValidFourDigitPin } from "@/lib/pin";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const tenantId = clean(body.tenantId);
    const pin = clean(body.pin);

    if (!tenantId || !pin) {
      return NextResponse.json(
        { error: "tenantId and pin are required." },
        { status: 400 }
      );
    }

    if (!isValidFourDigitPin(pin)) {
      return NextResponse.json(
        { error: "PIN must be exactly 4 digits." },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        pinHash: hashPin(pin),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to reset PIN." },
      { status: 500 }
    );
  }
}
