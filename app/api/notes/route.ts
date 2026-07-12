import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { emitEvent } from "@/lib/realtime";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type NoteType = "GENERAL" | "PAYMENT" | "SYSTEM";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
  error: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function clampContent(value: string) {
  return value.slice(0, 500);
}

// =======================
// GET — fetch notes
// =======================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session || !session.propertyId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const unitId = req.nextUrl.searchParams.get("unitId");

    if (!unitId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Missing unitId" },
        { status: 400 }
      );
    }

    const notes = await prisma.unitNote.findMany({
      where: {
        unitId,
        propertyId: session.propertyId,
      },
      orderBy: [
        { isPinned: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json<ApiSuccess<typeof notes>>({
      ok: true,
      data: notes,
    });
  } catch (err) {
    console.error("GET /api/notes error", err);
    return NextResponse.json<ApiError>(
      { ok: false, error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

// =======================
// POST — create OR update
// =======================

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session || !session.propertyId) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const action = clean(body.action);

    // =======================
    // 🔥 PIN TOGGLE
    // =======================

    if (action === "PIN_TOGGLE") {
      const noteId = clean(body.noteId);

      if (!noteId) {
        return NextResponse.json<ApiError>(
          { ok: false, error: "Missing noteId" },
          { status: 400 }
        );
      }

      const existing = await prisma.unitNote.findFirst({
        where: {
          id: noteId,
          propertyId: session.propertyId,
        },
      });

      if (!existing) {
        return NextResponse.json<ApiError>(
          { ok: false, error: "Note not found" },
          { status: 404 }
        );
      }

      const updated = await prisma.unitNote.update({
        where: { id: noteId },
        data: {
          isPinned: !existing.isPinned,
        },
      });

      emitEvent("admin:notes:update", {
        unitId: updated.unitId,
      });

      return NextResponse.json<ApiSuccess<typeof updated>>({
        ok: true,
        data: updated,
      });
    }

    // =======================
    // ✍️ CREATE NOTE
    // =======================

    const unitId = clean(body.unitId);
    const contentRaw = clean(body.content);
    const noteType = clean(body.noteType) as NoteType;
    const isPinned = Boolean(body.isPinned);

    if (!unitId || !contentRaw) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const content = clampContent(contentRaw);

    const note = await prisma.unitNote.create({
      data: {
        unitId,
        propertyId: session.propertyId,
        content,
        noteType: ["GENERAL", "PAYMENT", "SYSTEM"].includes(noteType)
          ? noteType
          : "GENERAL",
        isPinned,
        createdBy: session.managementUserId ?? null,
      },
    });

    emitEvent("admin:notes:update", {
      unitId,
    });

    return NextResponse.json<ApiSuccess<typeof note>>({
      ok: true,
      data: note,
    });
  } catch (err) {
    console.error("POST /api/notes error", err);
    return NextResponse.json<ApiError>(
      { ok: false, error: "Failed to process note" },
      { status: 500 }
    );
  }
}
