import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicRequestGuard } from "@/lib/publicRequestBudget";
import { verifiedLookupIp } from "@/lib/verifiedLookupIp";

export async function proxy(request: NextRequest) {
  let path = request.nextUrl.pathname;
  // Next decodes route params; the lookup helper also decodes account codes.
  // Match both layers so percent-encoded guesses cannot bypass interception.
  try { for (let i = 0; i < 2; i++) path = decodeURIComponent(path); } catch { /* Invalid paths cannot resolve a property. */ }
  const code = path.startsWith("/") ? path.slice(1).replace(/\/$/, "").trim() : "";
  const lookup = /^(?:GET|HEAD)$/.test(request.method) && /^[a-z]{2}-?\d{4}$/i.test(code);
  const routePath = path.toLowerCase().replace(/\/$/, "");
  const quote = request.method === "POST" && routePath === "/api/public/checkout/session";
  const availability = /^(?:GET|HEAD)$/.test(request.method) && routePath === "/api/setup/account-code/availability";
  if (!lookup && !quote && !availability) return NextResponse.next();
  const ip = verifiedLookupIp(request);
  if (!ip) return NextResponse.json({ error: "Temporarily unavailable. Please try again later." }, {
    status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" },
  });
  const denied = await publicRequestGuard(prisma, "LOOKUP", ip);
  return denied ?? NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
