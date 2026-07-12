import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function clean(value: unknown) {
  return String(value || "").trim();
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        settings: true,
        units: {
          orderBy: { unitNumber: "asc" },
        },
      },
    });

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, property });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const baseRent = toNumber(body.baseRent);
    const convenienceFee = toNumber(body.convenienceFee);

    const unitStart = clean(body.unitStart);
    const unitEnd = clean(body.unitEnd);

    const recurringFees = Array.isArray(body.recurringFees)
      ? body.recurringFees
      : [];

    // --- Update settings ---
    await prisma.propertySettings.update({
      where: { propertyId: id },
      data: {
        baseRentDefault: baseRent,
        convenienceFee,
      },
    });

    // --- Create units (range-based) ---
    const start = Number(unitStart);
    const end = Number(unitEnd);

    if (Number.isInteger(start) && Number.isInteger(end) && end >= start) {
      const unitsToCreate = [];

      for (let i = start; i <= end; i++) {
        unitsToCreate.push({
          propertyId: id,
          unitNumber: String(i),
        });
      }

      // avoid duplicates
      for (const u of unitsToCreate) {
        const exists = await prisma.unit.findFirst({
          where: {
            propertyId: id,
            unitNumber: u.unitNumber,
          },
        });

        if (!exists) {
          await prisma.unit.create({ data: u });
        }
      }
    }

    // --- Recurring fees reset + recreate ---
    await prisma.unitRecurringFee.deleteMany({
      where: { propertyId: id },
    });

    for (const fee of recurringFees) {
      const name = clean(fee.name);
      const amount = toNumber(fee.amount);

      if (!name || amount <= 0) continue;

      await prisma.unitRecurringFee.create({
        data: {
          propertyId: id,
          name,
          amount,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed setup save" }, { status: 500 });
  }
}