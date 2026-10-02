import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { loadBusinessPaymentReadiness } from "@/lib/businessPaymentReadiness";
import AccountCodeClient from "./AccountCodeClient";

export default async function AccountCodePage() {
  const { business } = await requireManager();

  if (business.accountCodeLockedAt && business.accountCode) {
    redirect("/manager/dashboard");
  }

  const current = await loadBusinessPaymentReadiness(business.id);
  if (!current?.readiness.canChooseAccountCode) redirect(current?.readiness.actionRoute ?? "/setup/stripe");

  return (
    <AccountCodeClient
      initialAccountCode={business.accountCode}
    />
  );
}
