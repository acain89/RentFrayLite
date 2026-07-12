import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Request id is required." },
        { status: 400 }
      );
    }

    await prisma.setupRequest.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete incoming request:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to delete request.",
      },
      { status: 500 }
    );
  }
}