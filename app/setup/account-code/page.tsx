import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AccountCodeClient from "./AccountCodeClient";

export default async function AccountCodePage() {
  const { business } = await requireManager();

  if (business.setupCompletedAt) {
    redirect("/manager/dashboard");
  }

  const stripeConnection =
    await prisma.stripeConnection.findUnique({
      where: {
        businessId: business.id,
      },
      select: {
        readyForLive: true,
      },
    });

  if (!stripeConnection?.readyForLive) {
    redirect("/setup/stripe");
  }

  return (
    <AccountCodeClient
      initialAccountCode={business.accountCode}
    />
  );
}