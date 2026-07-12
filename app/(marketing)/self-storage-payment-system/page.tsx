import type { Metadata } from "next";
import Link from "next/link";

const pageUrl = "https://rentfray.com/self-storage-payment-system";

export const metadata: Metadata = {
  title: "Free Payment System for Self Storage Facilities | RentFray",
  description:
    "Free payment system for self storage facilities. Track unit balances, collect recurring payments online, and manage billing with no software cost.",
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Free Payment System for Self Storage Facilities | RentFray",
    description:
      "Collect and track storage unit payments with a simple, structured system built for self storage facilities.",
    url: pageUrl,
    siteName: "RentFray",
    type: "website",
  },
};

export default function SelfStoragePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">
        Free Payment System for Self Storage Facilities
      </h1>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">
          A Clear Way to Track and Collect Storage Payments
        </h2>
        <p className="text-slate-600">
          Self storage operators need a simple way to manage recurring payments
          across many units. RentFray gives storage businesses a structured
          system to collect payments online, track balances clearly, and see
          exactly which units are paid, pending, or overdue.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Stop Relying on Manual Payment Tracking
        </h2>
        <p className="text-slate-600">
          Many storage facilities still rely on spreadsheets, handwritten notes,
          or disconnected tools to manage customer payments. That makes it
          harder to see what is current, what is late, and what needs attention.
        </p>
        <p className="text-slate-600">
          RentFray replaces that confusion with a centralized payment system
          designed for recurring billing visibility and operational clarity.
        </p>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-xl font-semibold">
          Built for Self Storage Operators
        </h2>

        <div>
          <h3 className="font-semibold">Track Every Unit Clearly</h3>
          <p className="text-slate-600">
            See exactly what each storage unit owes, what has been paid, and
            what remains due.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Collect Payments Online</h3>
          <p className="text-slate-600">
            Customers can submit payments through a simple online flow that is
            easy to follow and easy to complete.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Real-Time Payment Visibility</h3>
          <p className="text-slate-600">
            Instantly know which accounts are current, pending, or behind.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">No Software Cost</h3>
          <p className="text-slate-600">
            RentFray is free for self storage businesses. Customers pay a small
            processing fee when they make payments.
          </p>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Designed for Recurring Storage Billing
        </h2>
        <p className="text-slate-600">
          Whether you manage a small facility or a large number of storage
          units, RentFray helps organize recurring payments into one clear
          system. It is built to reduce confusion, improve visibility, and make
          day-to-day payment tracking easier.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>

        <div>
          <h3 className="font-semibold">
            Can self storage facilities collect payments online?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray gives self storage businesses a simple online payment
            system for recurring customer payments.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Can I track balances by storage unit?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray is built to provide clear visibility into what each
            unit owes and what has already been paid.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Is RentFray free for storage operators?
          </h3>
          <p className="text-slate-600">
            Yes. There are no software fees for the business. Customers pay a
            small processing fee when they submit a payment.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <p className="text-lg font-semibold">
          Simplify storage payment tracking with RentFray.
        </p>
      </section>

      <section className="mt-8 flex flex-col gap-3 text-sm">
        <Link
          href="/online-rent-payment-system"
          className="text-blue-600 hover:underline"
        >
          Online Payment System Overview
        </Link>
        <Link
          href="/buy-here-pay-here-payment-system"
          className="text-blue-600 hover:underline"
        >
          Payment System for Car Lots
        </Link>
        <Link
          href="/rent-collection-software-landlords"
          className="text-blue-600 hover:underline"
        >
          Rent Collection Software for Landlords
        </Link>
      </section>
    </main>
  );
}