import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();

  if (auth.response) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ businesses: [] });
  }

  const businesses = await prisma.business.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { ownerName: { contains: query, mode: "insensitive" } },
        { contactEmail: { contains: query, mode: "insensitive" } },
        { contactPhone: { contains: query, mode: "insensitive" } },
        { accountCode: { contains: query, mode: "insensitive" } },
        {
          manager: {
            is: {
              email: { contains: query, mode: "insensitive" },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      ownerName: true,
      contactEmail: true,
      contactPhone: true,
      accountCode: true,
      status: true,
      isActive: true,
      setupCompletedAt: true,
      createdAt: true,
      manager: {
        select: {
          email: true,
          displayName: true,
          isActive: true,
        },
      },
      stripeConnection: {
        select: {
          readyForLive: true,
          onboardingComplete: true,
          chargesEnabled: true,
          payoutsEnabled: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
    take: 25,
  });

  return NextResponse.json({ businesses });
}