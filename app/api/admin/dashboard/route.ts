import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { getAdminDashboardData } from "@/lib/adminDashboard";

export async function GET() {
  const auth = await requireAdminApi();

  if (auth.response) {
    return auth.response;
  }

  const data = await getAdminDashboardData();
  const finalAuth = await requireAdminApi();
  if (finalAuth.response) return finalAuth.response;

  return NextResponse.json(data);
}
