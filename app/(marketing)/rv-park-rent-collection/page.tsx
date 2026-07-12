import type { Metadata } from "next";
import Link from "next/link";

const pageUrl = "https://rentfray.com/rv-park-rent-collection";

export const metadata: Metadata = {
  title: "Free Rent Payment System for RV Parks | RentFray",
  description:
    "Free rent payment system for RV parks. Collect space rent online, track recurring payments, and manage billing with no software cost.",
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Free Rent Payment System for RV Parks | RentFray",
    description:
      "Collect and track RV park rent payments with a simple, structured system built for park operators.",
    url: pageUrl,
    siteName: "RentFray",
    type: "website",
  },
};

export default function RVParksPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">
        Free Rent Payment System for RV Parks
      </h1>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">
          A Clear Way to Collect and Track RV Park Rent
        </h2>
        <p className="text-slate-600">
          RV park operators need a simple way to manage recurring space rent
          without relying on spreadsheets, scattered notes, or manual payment
          tracking. RentFray gives RV parks a structured system to collect rent
          online, track balances clearly, and see exactly which spaces are paid,
          pending, or overdue.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Stop Chasing Payments Across Multiple Spaces
        </h2>
        <p className="text-slate-600">
          Managing rent across an RV park can become messy when payment records
          live in different places. That slows down operations and makes it
          harder to know who is current and who still owes.
        </p>
        <p className="text-slate-600">
          RentFray replaces that confusion with one centralized system built for
          recurring rent visibility and day-to-day operational clarity.
        </p>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-xl font-semibold">Built for RV Park Operators</h2>

        <div>
          <h3 className="font-semibold">Track Every Space Clearly</h3>
          <p className="text-slate-600">
            See exactly what each space owes, what has been paid, and what is
            still due.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Collect Rent Online</h3>
          <p className="text-slate-600">
            Residents can submit payments through a simple online flow designed
            to be easy to understand and complete.
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
            RentFray is free for RV park businesses. Residents pay a small
            processing fee when they submit payments.
          </p>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Designed for Recurring Space Rent
        </h2>
        <p className="text-slate-600">
          Whether your park has a small number of spaces or a much larger
          operation, RentFray helps organize recurring rent into one clear
          system. It is built to improve visibility, reduce confusion, and make
          payment tracking easier for park operators.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>

        <div>
          <h3 className="font-semibold">Can RV parks collect rent online?</h3>
          <p className="text-slate-600">
            Yes. RentFray gives RV parks a simple online payment system for
            recurring space rent.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Can I track rent by RV space?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray is built to show what each space owes, what has been
            paid, and what remains due.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Is RentFray free for RV park operators?
          </h3>
          <p className="text-slate-600">
            Yes. There are no software fees for the business. Residents pay a
            small processing fee when they make payments.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <p className="text-lg font-semibold">
          Collect and track RV park rent with clarity using RentFray.
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
          href="/mobile-home-park-rent-collection"
          className="text-blue-600 hover:underline"
        >
          Mobile Home Park Rent Collection
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