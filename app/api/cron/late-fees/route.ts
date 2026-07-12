import { NextResponse } from "next/server";
import { runLateFeesJob } from "@/jobs/lateFees";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ApiSuccess = {
  ok: true;
  billingCycle: string;
  posted: number;
  skipped: number;
};

type ApiError = {
  ok: false;
  error: string;
};

export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    if (!cronSecret) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "CRON_SECRET is not configured." },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json<ApiError>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await runLateFeesJob();

    return NextResponse.json<ApiSuccess>({
      ok: true,
      billingCycle: result.billingCycle,
      posted: result.posted,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("POST /api/cron/late-fees error:", error);

    return NextResponse.json<ApiError>(
      { ok: false, error: "Failed to run late fees job." },
      { status: 500 }
    );
  }
}