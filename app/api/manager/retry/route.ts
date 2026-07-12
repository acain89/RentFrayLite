// app/api/manager/payments/retry/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (
      !session ||
      (session.role !== "OWNER" &&
        session.role !== "MANAGER" &&
        session.role !== "STAFF")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { paymentId } = await req.json();

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId required" },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    if (payment.status !== "FAILED") {
      return NextResponse.json(
        { error: "Only failed payments can be retried" },
        { status: 400 }
      );
    }

    // 🔥 Reset to pending (simulate retry trigger)
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "PENDING",
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("retry payment error", err);
    return NextResponse.json(
      { error: "Retry failed" },
      { status: 500 }
    );
  }
}
