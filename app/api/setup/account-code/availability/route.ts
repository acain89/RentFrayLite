import { NextResponse } from "next/server";
import { ACCOUNT_CODE_PATTERN } from "@/lib/accountCode";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountCode = (
    url.searchParams.get("code") ?? ""
  ).toUpperCase();

  if (!ACCOUNT_CODE_PATTERN.test(accountCode)) {
    return NextResponse.json({
      available: false,
      valid: false,
    });
  }

  const existing = await prisma.business.findUnique({
    where: {
      accountCode,
    },
    select: {
      id: true,
    },
  });

  return NextResponse.json({
    available: !existing,
    valid: true,
  });
}
