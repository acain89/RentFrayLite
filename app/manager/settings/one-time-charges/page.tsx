import {
  OneTimeChargeStatus,
} from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSetupRoute } from "@/lib/setupProgress";
import OneTimeChargesClient from "./OneTimeChargesClient";

export default async function ManagerOneTimeChargesPage() {
  const { business } = await requireManager();

  if (getSetupRoute(business) !== "/manager/dashboard") {
    redirect("/setup/continue");
  }

  const charges = await prisma.oneTimeCharge.findMany({
    where: {
      businessId: business.id,
      status: OneTimeChargeStatus.PENDING,
    },
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    select: {
      id: true,
      unitNumber: true,
      label: true,
      amountCents: true,
      createdAt: true,
    },
  });

  return (
    <main className="rfl-settings-page">
      <section className="rfl-settings-shell">
        <header className="rfl-settings-header">
          <p className="rfl-eyebrow">Settings</p>
          <h1>One-Time Charges</h1>
        </header>

        <section className="rfl-settings-notice">
          <h2>Add a charge to a specific unit.</h2>

          <p>
            Use this for damage, cleaning, repairs, or
            another one-time expense.
          </p>
        </section>

        <section className="rfl-settings-next-step">
          <h2>After you add a charge</h2>

          <p>
            Any charge you add here will automatically
            appear on that unit&apos;s bill the next time
            they make a payment. Once paid, it will not
            appear again.
          </p>
        </section>

        <OneTimeChargesClient
          initialCharges={charges.map((charge) => ({
            ...charge,
            createdAt: charge.createdAt.toISOString(),
          }))}
        />

        <Link
          className="rfl-settings-back"
          href="/manager/settings"
        >
          ← Back to Settings
        </Link>
      </section>
    </main>
  );
}