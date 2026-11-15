import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { getSetupRoute } from "@/lib/setupProgress";
import BankingClient from "./BankingClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Banking & payouts", robots: { index: false, follow: false } };
export default async function BankingPage() {
  const { business } = await requireManager();
  if (getSetupRoute(business) !== "/manager/dashboard") redirect("/setup/continue");
  return <BankingClient businessName={business.name} accountCode={business.accountCode ?? ""}/>;
}
