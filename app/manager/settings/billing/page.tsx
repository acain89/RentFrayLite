import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getSetupRoute } from "@/lib/setupProgress";

export default async function ManagerBillingSettingsPage() {
  const { business } = await requireManager();

  if (getSetupRoute(business) !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  redirect("/setup/recurring/billing?mode=settings");
}