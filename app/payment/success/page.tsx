import type { Metadata } from "next";
import { PaymentStatus, SmsReceiptStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { getPaymentResult } from "@/lib/paymentResult";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Payment result",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = {
  searchParams: Promise<{ session_id?: string | string[]; accountCode?: string | string[] }>;
};

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function statusContent(status: PaymentStatus, method: string | null) {
  switch (status) {
    case PaymentStatus.PAID:
      return { heading: "Payment successful", label: "Paid", message: "Your payment has been confirmed." };
    case PaymentStatus.PENDING:
      return {
        heading: "Payment processing", label: "Processing",
        message: method === "ACH"
          ? "Your bank payment is still processing and is not yet confirmed as paid. Bank payments may take several business days. Avoid submitting another payment while this one is processing."
          : "Your payment is still processing and is not yet confirmed as paid. Please refresh for an update before submitting another payment.",
      };
    case PaymentStatus.FAILED:
      return { heading: "Payment unsuccessful", label: "Failed", message: "No successful payment has been recorded. Please contact the business before trying again." };
    case PaymentStatus.EXPIRED:
      return { heading: "Checkout expired", label: "Expired", message: "This checkout expired without a confirmed payment. Return to the business payment page to begin again." };
    case PaymentStatus.RETURNED:
      return { heading: "Payment returned", label: "Returned", message: "The bank returned this payment. It is no longer recorded as paid. Contact the business before submitting another payment." };
    case PaymentStatus.DISPUTED:
      return { heading: "Payment disputed", label: "Disputed", message: "This payment is under dispute. Please contact the business." };
    default:
      return { heading: "Awaiting payment confirmation", label: "Not yet confirmed", message: "A successful payment has not yet been confirmed. Wait a moment and refresh before submitting another payment." };
  }
}

function receiptMessage(status?: SmsReceiptStatus): string {
  switch (status) {
    case SmsReceiptStatus.SENT: return "Your SMS receipt has been sent.";
    case SmsReceiptStatus.QUEUED:
    case SmsReceiptStatus.SENDING: return "Your SMS receipt is being prepared for delivery.";
    case SmsReceiptStatus.FAILED: return "Your payment is confirmed, but the SMS receipt could not be delivered. Keep this page as your confirmation.";
    default: return "Keep this page as your payment confirmation.";
  }
}

function breakdown(snapshot: unknown): { label: string; amountCents: number }[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.flatMap((item) => {
    if (!item || typeof item !== "object" || item.type === "PLATFORM_FEE" ||
        typeof item.label !== "string" || typeof item.amountCents !== "number" ||
        !Number.isSafeInteger(item.amountCents) || item.amountCents < 0) return [];
    return [{ label: item.label, amountCents: item.amountCents }];
  });
}

export default async function PaymentSuccessPage({ searchParams }: Props) {
  const params = await searchParams;
  const result = await getPaymentResult(params.accountCode, params.session_id);
  if (!result) notFound();
  const { payment, accountCode, stripeSessionId } = result;
  const content = statusContent(payment.status, payment.paymentMethod);
  const statusDate = payment.status === PaymentStatus.PAID ? payment.paidAt
    : payment.status === PaymentStatus.PENDING ? payment.pendingAt
    : payment.status === PaymentStatus.FAILED ? payment.failedAt
    : payment.status === PaymentStatus.EXPIRED ? payment.expiredAt
    : payment.status === PaymentStatus.RETURNED ? payment.returnedAt
    : payment.status === PaymentStatus.DISPUTED ? payment.disputedAt
    : payment.checkoutStartedAt;
  const refreshUrl = "/payment/success?" + new URLSearchParams({
    session_id: stripeSessionId, accountCode,
  }).toString();

  return (
    <main className="rfl-payment-result-page">
      <section className="rfl-payment-result-card" aria-labelledby="payment-result-heading">
        <p className="rfl-payment-result-brand">RentFrayLite</p>
        <h1 id="payment-result-heading">{content.heading}</h1>
        <p className="rfl-payment-result-message" role="status">{content.message}</p>
        <div className="rfl-payment-result-summary">
          <div><span>Business</span><strong>{payment.business.name}</strong></div>
          <div><span>Status</span><strong>{content.label}</strong></div>
          <div><span>Payment for</span><strong>{payment.itemDescription}</strong></div>
          {payment.referenceLabel && <div><span>Unit / space</span><strong>{payment.referenceLabel}</strong></div>}
          {payment.paymentMethod && <div><span>Payment method</span><strong>{payment.paymentMethod === "ACH" ? "Bank account (ACH)" : "Card"}</strong></div>}
          {statusDate && <div><span>Updated</span><strong><time dateTime={statusDate.toISOString()}>
            {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(statusDate)} Central
          </time></strong></div>}
        </div>
        <div className="rfl-payment-result-summary rfl-payment-result-breakdown">
          {breakdown(payment.lineItemsSnapshot).map((item, index) => (
            <div key={index}><span>{item.label}</span><strong>{money(item.amountCents)}</strong></div>
          ))}
          <div><span>Subtotal</span><strong>{money(payment.subtotalCents)}</strong></div>
          <div><span>Platform service fee</span><strong>{money(payment.platformFeeCents)}</strong></div>
          <div className="rfl-payment-result-total"><span>{payment.status === PaymentStatus.PAID ? "Total paid" : "Payment amount"}</span><strong>{money(payment.totalChargedCents)}</strong></div>
        </div>
        {payment.status === PaymentStatus.PAID && <p className="rfl-payment-result-message">{receiptMessage(payment.smsReceipt?.status)}</p>}
        <div className="rfl-payment-result-actions">
          <a className="rfl-primary-button" href={refreshUrl}>Refresh payment status</a>
          <a href={`/${encodeURIComponent(accountCode)}`}>Return to business payment page</a>
        </div>
        <p className="rfl-payment-result-footer">Refreshing this page does not submit another payment or send another receipt.</p>
      </section>
    </main>
  );
}
