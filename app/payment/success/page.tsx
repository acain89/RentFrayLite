import { PaymentStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type PaymentSuccessPageProps = {
  searchParams: Promise<{
    session_id?: string;
  }>;
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getStatusContent(status: PaymentStatus) {
  switch (status) {
    case PaymentStatus.PAID:
      return {
        heading: "Payment successful",
        message:
          "Your payment has been confirmed. A receipt will be sent to your phone.",
      };

    case PaymentStatus.PENDING:
    case PaymentStatus.CHECKOUT_STARTED:
      return {
        heading: "Payment processing",
        message:
          "Your payment was submitted and is still being processed. Bank payments may take several business days to complete.",
      };

    case PaymentStatus.FAILED:
      return {
        heading: "Payment unsuccessful",
        message:
          "Stripe could not complete this payment. No successful payment has been recorded.",
      };

    case PaymentStatus.RETURNED:
      return {
        heading: "Payment returned",
        message:
          "The bank later returned this payment. Please contact the business or submit another payment.",
      };

    case PaymentStatus.REFUNDED:
      return {
        heading: "Payment refunded",
        message:
          "This payment has been refunded.",
      };

    case PaymentStatus.DISPUTED:
      return {
        heading: "Payment disputed",
        message:
          "This payment is currently under dispute.",
      };

    case PaymentStatus.CREATED:
    default:
      return {
        heading: "Payment not yet confirmed",
        message:
          "Stripe has not confirmed this payment yet. Please wait a moment and refresh this page.",
      };
  }
}

export default async function PaymentSuccessPage({
  searchParams,
}: PaymentSuccessPageProps) {
  const { session_id: stripeCheckoutSessionId } =
    await searchParams;

  if (!stripeCheckoutSessionId) {
    notFound();
  }

  const payment = await prisma.payment.findUnique({
    where: {
      stripeCheckoutSessionId,
    },
    include: {
      business: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!payment) {
    notFound();
  }

  const statusContent = getStatusContent(
    payment.status
  );

  return (
    <main className="rfl-payment-result-page">
      <section className="rfl-payment-result-card">
        <p className="rfl-payment-result-brand">
          RentFrayLite
        </p>

        <h1>{statusContent.heading}</h1>

        <p className="rfl-payment-result-message">
          {statusContent.message}
        </p>

        <div className="rfl-payment-result-summary">
          <div>
            <span>Business</span>
            <strong>{payment.business.name}</strong>
          </div>

          <div>
            <span>Payment for</span>
            <strong>{payment.itemDescription}</strong>
          </div>

          <div>
            <span>Name</span>
            <strong>
              {payment.payerFirstName}{" "}
              {payment.payerLastName}
            </strong>
          </div>

          {payment.referenceLabel && (
            <div>
              <span>Reference</span>
              <strong>
                {payment.referenceLabel}
              </strong>
            </div>
          )}

          <div>
            <span>Subtotal</span>
            <strong>
              {formatMoney(payment.subtotalCents)}
            </strong>
          </div>

          <div>
            <span>Platform service fee</span>
            <strong>
              {formatMoney(
                payment.platformFeeCents
              )}
            </strong>
          </div>

          <div className="rfl-payment-result-total">
            <span>Total</span>
            <strong>
              {formatMoney(
                payment.totalChargedCents
              )}
            </strong>
          </div>
        </div>

        <p className="rfl-payment-result-footer">
          You may safely close this page.
        </p>
      </section>
    </main>
  );
}