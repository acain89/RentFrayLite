import { requireAdmin } from "@/lib/auth";
import { getAdminDashboardData } from "@/lib/adminDashboard";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminPage() {
  await requireAdmin();

  const dashboard = await getAdminDashboardData();

  return <AdminDashboardClient initialData={dashboard} />;
}