import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getSetupRoute } from "@/lib/setupProgress";

export default async function ManagerChargeSettingsPage() {
  const { business } = await requireManager();

  if (getSetupRoute(business) !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  redirect("/setup/recurring/charges?mode=settings");
}