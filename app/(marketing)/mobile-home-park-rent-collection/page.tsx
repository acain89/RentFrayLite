import type { Metadata } from "next";
import Link from "next/link";

const pageUrl = "https://rentfray.com/mobile-home-park-rent-collection";

export const metadata: Metadata = {
  title: "Free Rent Collection System for Mobile Home Parks | RentFray",
  description:
    "Free rent collection system for mobile home parks. Collect lot rent online, track recurring payments, and manage billing with no software cost.",
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Free Rent Collection System for Mobile Home Parks | RentFray",
    description:
      "Collect and track mobile home park lot rent with a simple, structured system built for park operators.",
    url: pageUrl,
    siteName: "RentFray",
    type: "website",
  },
};

export default function MobileHomeParksPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">
        Free Rent Collection System for Mobile Home Parks
      </h1>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">
          A Clear Way to Collect and Track Lot Rent
        </h2>
        <p className="text-slate-600">
          Mobile home park operators need a simple way to manage recurring lot
          rent without relying on spreadsheets, manual records, or scattered
          payment notes. RentFray gives parks a structured system to collect lot
          rent online, track balances clearly, and see exactly which lots are
          paid, pending, or overdue.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Stop Chasing Payments Across the Park
        </h2>
        <p className="text-slate-600">
          When lot rent is tracked manually, it becomes harder to know who is
          current, who is late, and what still needs attention. That creates
          confusion and slows down daily operations.
        </p>
        <p className="text-slate-600">
          RentFray replaces that confusion with one centralized system designed
          for recurring payment visibility and easier rent collection across the
          entire park.
        </p>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-xl font-semibold">
          Built for Mobile Home Park Operators
        </h2>

        <div>
          <h3 className="font-semibold">Track Every Lot Clearly</h3>
          <p className="text-slate-600">
            See exactly what each lot owes, what has been paid, and what is
            still due.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Collect Lot Rent Online</h3>
          <p className="text-slate-600">
            Residents can submit payments through a simple online flow that is
            easy to follow and easy to complete.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Real-Time Payment Visibility</h3>
          <p className="text-slate-600">
            Instantly know which lots are current, pending, or behind.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">No Software Cost</h3>
          <p className="text-slate-600">
            RentFray is free for mobile home park businesses. Residents pay a
            small processing fee when they make payments.
          </p>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Designed for Recurring Park Rent
        </h2>
        <p className="text-slate-600">
          Whether you operate a smaller park or manage a larger number of lots,
          RentFray helps organize recurring rent into one clear system. It is
          built to improve visibility, reduce confusion, and make day-to-day
          payment tracking easier.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>

        <div>
          <h3 className="font-semibold">
            Can mobile home parks collect lot rent online?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray gives mobile home parks a simple online payment system
            for recurring lot rent.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Can I track rent by lot?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray is built to show what each lot owes, what has been
            paid, and what remains due.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Is RentFray free for mobile home park operators?
          </h3>
          <p className="text-slate-600">
            Yes. There are no software fees for the business. Residents pay a
            small processing fee when they submit payments.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <p className="text-lg font-semibold">
          Collect and track lot rent with clarity using RentFray.
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
          href="/rv-park-rent-collection"
          className="text-blue-600 hover:underline"
        >
          RV Park Rent Collection
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