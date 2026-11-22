import { timingSafeEqual } from "node:crypto";
import { boundedRawBody } from "@/lib/boundedRawBody";
import { processPushQueue } from "@/lib/pushDelivery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || auth.length !== expected.length || !timingSafeEqual(auth, expected)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try { if (request.body) await boundedRawBody(request, 0); } catch { return Response.json({ error: "An empty body is required." }, { status: 400 }); }
  try { return Response.json(await processPushQueue(20), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Notification processing unavailable. Retry later." }, { status: 503 }); }
}
