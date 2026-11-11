import type { Metadata } from "next";
import { PaymentStatus } from "@prisma/client";
import { smsReceiptMessage } from "@/lib/smsDeliveryReporting";
import { notFound } from "next/navigation";
import { getPaymentResult } from "@/lib/paymentResult";
import { formatReportingTimestamp, reportingTimeZone } from "@/lib/reportingCalendar";

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
  const { payment, outcome, accountCode, stripeSessionId } = result;
  const content = statusContent(payment.status, payment.paymentMethod);
  const timeZone = reportingTimeZone(payment.business.propertyTimeZone ?? null);
  const statusDateLabel = payment.status === PaymentStatus.PAID ? "Original payment confirmation"
    : payment.status === PaymentStatus.PENDING ? "Processing first recorded"
    : payment.status === PaymentStatus.FAILED ? "Failure first recorded"
    : payment.status === PaymentStatus.EXPIRED ? "Checkout expiry recorded"
    : payment.status === PaymentStatus.RETURNED ? "Return first recorded"
    : payment.status === PaymentStatus.DISPUTED ? "Dispute first recorded" : "Checkout start recorded";
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
        <h1 id="payment-result-heading">{payment.status === PaymentStatus.RETURNED ? content.heading : outcome.refundState === "FULL" ? "Payment fully refunded" : outcome.refundState === "PARTIAL" ? "Payment partially refunded" : outcome.disputeOutcome === "ACTIVE" ? "Payment disputed" : outcome.disputeOutcome && outcome.disputeOutcome !== "UNKNOWN" ? outcome.statusLabel : content.heading}</h1>
        <p className="rfl-payment-result-message" role="status">{payment.status === PaymentStatus.RETURNED ? content.message : outcome.refundState === "FULL" || outcome.refundState === "PARTIAL" ? "The original payment is preserved below. Observed customer refunds are shown separately; principal and fee allocation is unavailable." : outcome.disputeOutcome ? "The recorded dispute outcome is shown below. Contact the business for details." : content.message}</p>
        <div className="rfl-payment-result-summary">
          <div><span>Business</span><strong>{payment.business.name}</strong></div>
          <div><span>Status</span><strong>{outcome.statusLabel}</strong></div>
          <div><span>Payment for</span><strong>{payment.itemDescription}</strong></div>
          {payment.referenceLabel && <div><span>Unit / space</span><strong>{payment.referenceLabel}</strong></div>}
          {payment.paymentMethod && <div><span>Payment method</span><strong>{payment.paymentMethod === "ACH" ? "Bank account (ACH)" : "Card"}</strong></div>}
          {payment.createdAt && <div><span>Original transaction date</span><strong><time dateTime={payment.createdAt.toISOString()} title={payment.createdAt.toISOString()}>{formatReportingTimestamp(payment.createdAt, timeZone)}</time></strong></div>}
          {statusDate && <div><span>{statusDateLabel}</span><strong><time dateTime={statusDate.toISOString()} title={statusDate.toISOString()}>
            {formatReportingTimestamp(statusDate, timeZone)}
          </time></strong></div>}
        </div>
        <p>{payment.business.propertyTimeZone == null ? "UTC display compatibility: property timezone is not configured." : "Display timezone: " + timeZone + "."} These are original recorded dates, not refund or dispute-resolution timestamps.</p>
        <div className="rfl-payment-result-summary rfl-payment-result-breakdown">
          {breakdown(payment.lineItemsSnapshot).map((item, index) => (
            <div key={index}><span>{item.label}</span><strong>{money(item.amountCents)}</strong></div>
          ))}
          <div><span>Subtotal</span><strong>{money(payment.subtotalCents)}</strong></div>
          <div><span>Platform service fee</span><strong>{money(payment.platformFeeCents)}</strong></div>
          <div className="rfl-payment-result-total"><span>Original payment amount</span><strong>{money(payment.totalChargedCents)}</strong></div>
          <div><span>Observed customer refunds</span><strong>{outcome.customerRefundCents === null ? "Unknown / unavailable" : money(outcome.customerRefundCents)}</strong></div>
          {outcome.pendingCustomerRefundCents !== null && outcome.pendingCustomerRefundCents > 0 && <div><span>Refund pending</span><strong>{money(outcome.pendingCustomerRefundCents)}</strong></div>}
        </div>
        {payment.status === PaymentStatus.PAID && outcome.refundState === "UNKNOWN" && !outcome.disputeOutcome && <p className="rfl-payment-result-message">{smsReceiptMessage(result.smsDelivery)}</p>}
        <div className="rfl-payment-result-actions">
          <a className="rfl-primary-button" href={refreshUrl}>Refresh payment status</a>
          <a href={`/${encodeURIComponent(accountCode)}`}>Return to business payment page</a>
        </div>
        <p className="rfl-payment-result-footer">Refreshing this page does not submit another payment or send another receipt.</p>
      </section>
    </main>
  );
}
