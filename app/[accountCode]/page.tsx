import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPublicCheckoutBusiness,
  isRecurringCheckoutBusiness,
} from "@/lib/publicCheckout";
import RecurringCheckoutClient from "./RecurringCheckoutClient";

type PublicPaymentPageProps = {
  params: Promise<{
    accountCode: string;
  }>;
};

export default async function PublicPaymentPage({
  params,
}: PublicPaymentPageProps) {
  const { accountCode } = await params;

  const business = await getPublicCheckoutBusiness(accountCode);

  if (!business) {
    notFound();
  }

  if (!isRecurringCheckoutBusiness(business)) {
    return (
      <main className="rfl-placeholder-page">
        <section className="rfl-placeholder-card">
          <p className="rfl-eyebrow">Customer checkout</p>

          <h1>{business.name}</h1>

          <p>This payment page is not available yet.</p>

          <Link href="/" className="rfl-secondary-button">
            Return Home
          </Link>
        </section>
      </main>
    );
  }

  if (business.recurringPlans.length === 0) {
    return (
      <main className="rfl-placeholder-page">
        <section className="rfl-placeholder-card">
          <p className="rfl-eyebrow">Customer checkout</p>

          <h1>{business.name}</h1>

          <p>This business has not added any payment options yet.</p>

          <Link href="/" className="rfl-secondary-button">
            Return Home
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="rfl-public-checkout-page">
      <RecurringCheckoutClient
        businessName={business.name}
        accountCode={business.accountCode ?? accountCode}
        plans={business.recurringPlans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          baseAmountCents: plan.baseAmountCents,
          dueDay: plan.dueDay,
          charges: plan.charges.map((charge) => ({
            id: charge.id,
            label: charge.label,
            amountCents: charge.amountCents,
          })),
        }))}
      />

      <Link href="/" className="rfl-text-button">
        Use a different account code
      </Link>
    </main>
  );
}