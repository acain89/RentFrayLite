import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { createPaymentQr } from "@/lib/paymentQr";
import PrintControls from "./PrintControls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Print Payment QR Code",
  robots: { index: false, follow: false },
};

export default async function PaymentQrPage() {
  const { business } = await requireManager();
  if (!business.accountCode || !business.accountCodeLockedAt) redirect("/setup/account-code");
  const qr = createPaymentQr(business.accountCode);
  const current = await requireManager();
  if (current.business.id !== business.id || current.business.accountCode !== business.accountCode) {
    redirect("/manager/dashboard");
  }
  return <main className="rfl-qr-print-page">
    <style>{"@page { size: auto; margin: 0.5in; }"}</style>
    <PrintControls />
    <article className="rfl-qr-sheet" aria-label="Business payment QR code">
      <h1>{business.name}</h1>
      <p className="rfl-qr-code">{qr.accountCode}</p>
      <svg className="rfl-payment-qr" xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-labelledby="payment-qr-title" shapeRendering="crispEdges">
        <title id="payment-qr-title">{`Payment options for account ${qr.accountCode}`}</title>
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.path} fill="#000" />
      </svg>
      <p className="rfl-qr-instruction">Scan QR code to see payment options.</p>
      <a className="rfl-qr-url" href={qr.url}>{qr.url}</a>
    </article>
  </main>;
}
