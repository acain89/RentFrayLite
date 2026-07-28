import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { getAdminDashboardData } from "@/lib/adminDashboard";

export async function GET() {
  const auth = await requireAdminApi();

  if (auth.response) {
    return auth.response;
  }

  const data = await getAdminDashboardData();

  return NextResponse.json(data);
}