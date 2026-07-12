import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {

getSeededLivePropertyCount,
  getSeededMonthlyProcessedCents,
  getSeededTenantsPaidToday,
} from "@/lib/stats";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
  );
}

function startOfDayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );
}

export async function GET() {
  const monthStart = startOfMonthUtc();
  const dayStart = startOfDayUtc();
  const now = new Date();

  const [realLiveProperties, monthlyPaidAgg, tenantsPaidToday] =
    await Promise.all([
      prisma.property.count({
        where: {
          status: "LIVE",
          isActive: true,
        },
      }),

      prisma.payment.aggregate({
        where: {
          status: "PAID",
          paidAt: {
            gte: monthStart,
          },
        },
        _sum: {
          amountCents: true,
        },
      }),

      prisma.payment.count({
        where: {
          status: "PAID",
          paidAt: {
            gte: dayStart,
          },
        },
      }),
    ]);

  const realMonthlyProcessedCents =
    monthlyPaidAgg._sum.amountCents ?? 0;

  return NextResponse.json({
    liveProperties: getSeededLivePropertyCount(
      realLiveProperties,
      now
    ),
    monthlyProcessedCents: getSeededMonthlyProcessedCents(
      realMonthlyProcessedCents,
      now
    ),
    tenantsPaidToday: getSeededTenantsPaidToday(
      tenantsPaidToday,
      now
    ),
  });
}
