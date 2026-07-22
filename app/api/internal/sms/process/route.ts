import { NextRequest, NextResponse } from "next/server";
import { processQueuedSmsReceipts } from "@/lib/smsReceipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  const authorization =
    request.headers.get("authorization");

  return authorization === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
      }
    );
  }

  try {
    const results = await processQueuedSmsReceipts(20);

    const sent = results.filter(
      (result) => result.status === "SENT"
    ).length;

    const failed = results.filter(
      (result) => result.status === "FAILED"
    ).length;

    const skipped = results.filter(
      (result) => result.status === "SKIPPED"
    ).length;

    return NextResponse.json({
      processed: results.length,
      sent,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    console.error("SMS queue processing failed:", error);

    return NextResponse.json(
      {
        error: "SMS queue processing failed.",
      },
      {
        status: 500,
      }
    );
  }
}