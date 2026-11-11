import { NextRequest, NextResponse } from "next/server";
import { processQueuedSmsReceipts } from "@/lib/smsReceipts";
import { loadSmsWorkerReport, loadSmsQueueHealth } from "@/lib/smsDeliveryReporting";
import { prisma } from "@/lib/prisma";
import { createHash, randomUUID } from "node:crypto";
import { logOperationalError } from "@/lib/operationalLogging";

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

    const report = await loadSmsWorkerReport(prisma, results);
    const backlog = await loadSmsQueueHealth(prisma);
    return NextResponse.json({ ...report, backlog });
  } catch (error) {
    const reference = randomUUID();
    logOperationalError("sms_worker_failed", error, reference);
    return NextResponse.json(
      {
        error: "SMS queue processing failed.",
      },
      {
        status: 500,
        headers: { "X-RFL-Correlation": createHash("sha256").update(reference).digest("hex") },
      }
    );
  }
}
