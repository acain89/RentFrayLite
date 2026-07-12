// app/api/stream/route.ts

import { NextRequest } from "next/server";
import { subscribe } from "@/lib/realtime";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      interval = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      cleanup = subscribe((event) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      });
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }

      cleanup?.();
      cleanup = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}