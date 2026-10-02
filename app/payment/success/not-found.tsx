import Link from "next/link";

export default function PaymentResultNotFound() {
  return (
    <main className="rfl-payment-result-page">
      <section className="rfl-payment-result-card">
        <p className="rfl-payment-result-brand">RentFrayLite</p>
        <h1>Payment details unavailable</h1>
        <p className="rfl-payment-result-message">Open your payment confirmation in the browser you used to start checkout. If the details are still unavailable, contact the business for help.</p>
        <Link className="rfl-review-back-button" href="/">Return to RentFrayLite</Link>
      </section>
    </main>
  );
}
