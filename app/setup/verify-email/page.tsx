import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getSetupRoute } from "@/lib/setupProgress";

// Compatibility for saved legacy URLs; this does not verify an email address.
export default async function LegacyVerifyEmailPage() {
  const { business } = await requireManager();
  redirect(getSetupRoute(business));
}
