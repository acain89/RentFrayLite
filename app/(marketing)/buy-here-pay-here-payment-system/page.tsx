import type { Metadata } from "next";
import Link from "next/link";

const pageUrl = "https://rentfray.com/buy-here-pay-here-payment-system";

export const metadata: Metadata = {
  title: "Free Payment System for Buy Here Pay Here Car Lots | RentFray",
  description:
    "Free payment tracking system for buy here pay here car lots. Collect recurring payments, track balances, and manage customer accounts with no software cost.",
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Free Payment System for Buy Here Pay Here Car Lots | RentFray",
    description:
      "Track and collect recurring vehicle payments with a simple, structured system built for car lots.",
    url: pageUrl,
    siteName: "RentFray",
    type: "website",
  },
};

export default function CarLotsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">
        Free Payment System for Buy Here Pay Here Car Lots
      </h1>

      {/* INTRO */}
      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">
          A Simple Way to Track and Collect Vehicle Payments
        </h2>
        <p className="text-slate-600">
          Managing recurring payments for financed vehicles can quickly become
          messy. RentFray gives buy here pay here car lots a clear, structured
          system to track balances, collect payments, and see exactly where every
          account stands.
        </p>
      </section>

      {/* PROBLEM */}
      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Stop Guessing Who Has Paid
        </h2>
        <p className="text-slate-600">
          Many car lots rely on spreadsheets, manual tracking, or scattered
          payment records. This creates confusion, missed payments, and wasted
          time.
        </p>
        <p className="text-slate-600">
          RentFray replaces that with a centralized system where every payment,
          balance, and account status is clearly visible in real time.
        </p>
      </section>

      {/* FEATURES */}
      <section className="mt-10 space-y-6">
        <h2 className="text-xl font-semibold">
          Built for Recurring Vehicle Payments
        </h2>

        <div>
          <h3 className="font-semibold">Track Every Account Clearly</h3>
          <p className="text-slate-600">
            See exactly what each customer owes, what has been paid, and what is
            overdue.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Collect Payments Online</h3>
          <p className="text-slate-600">
            Customers can submit payments through a simple, guided process that
            reduces friction and increases completion rates.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Real-Time Payment Status</h3>
          <p className="text-slate-600">
            Instantly know which accounts are current, pending, or behind.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">No Software Cost</h3>
          <p className="text-slate-600">
            RentFray is completely free for car lot operators. Customers pay a
            small processing fee when submitting payments.
          </p>
        </div>
      </section>

      {/* SEO SECTION */}
      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Designed for Buy Here Pay Here Financing
        </h2>
        <p className="text-slate-600">
          RentFray works for car lots that rely on recurring payments and need a
          clear system to manage them. Whether you have a small portfolio or a
          large number of active accounts, the platform scales with your
          operation.
        </p>
      </section>

      {/* FAQ */}
      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">
          Frequently Asked Questions
        </h2>

        <div>
          <h3 className="font-semibold">
            Can I track recurring vehicle payments?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray is designed to track recurring payments clearly across
            all customer accounts.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Is RentFray free for car lots?
          </h3>
          <p className="text-slate-600">
            Yes. There are no software fees. Customers pay a small processing fee
            when making payments.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Can customers pay online?
          </h3>
          <p className="text-slate-600">
            Yes. Payments are made through a simple online flow designed to be
            quick and easy to complete.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-12">
        <p className="text-lg font-semibold">
          Track and collect vehicle payments with clarity using RentFray.
        </p>
      </section>

      {/* INTERNAL LINKS */}
      <section className="mt-8 flex flex-col gap-3 text-sm">
        <Link
          href="/online-rent-payment-system"
          className="text-blue-600 hover:underline"
        >
          Online Payment System Overview
        </Link>

        <Link
          href="/rent-collection-software-landlords"
          className="text-blue-600 hover:underline"
        >
          Rent Collection Software for Landlords
        </Link>

        <Link
          href="/self-storage-payment-system"
          className="text-blue-600 hover:underline"
        >
          Payment System for Storage Facilities
        </Link>
      </section>
    </main>
  );
}