import { NextResponse } from "next/server";
import { runMonthlyRentJob } from "@/jobs/monthlyRent";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ApiSuccess = {
  ok: true;
};

type ApiError = {
  ok: false;
  error: string;
};

export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
    const rawAuth =
      req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const token = rawAuth.replace(/^Bearer\s+/i, "").trim();

    if (!cronSecret) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "CRON_SECRET is not configured." },
        { status: 500 }
      );
    }

    if (token !== cronSecret) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await runMonthlyRentJob();

return NextResponse.json(result);

  } catch (error: unknown) {
    console.error("POST /api/cron/monthly-rent error:", error);

    return NextResponse.json<ApiError>(
      { ok: false, error: "Failed to run monthly rent job." },
      { status: 500 }
    );
  }
}