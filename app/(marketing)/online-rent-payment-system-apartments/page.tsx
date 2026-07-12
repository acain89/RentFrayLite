import type { Metadata } from "next";
import Link from "next/link";

const pageUrl = "https://rentfray.com/online-rent-payment-system-apartments";

export const metadata: Metadata = {
  title: "Free Online Rent Payment System for Apartment Complexes | RentFray",
  description:
    "Free online rent payment system for apartment complexes. Collect rent online, track tenant payments, and manage balances with no software cost.",
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Free Online Rent Payment System for Apartment Complexes | RentFray",
    description:
      "Collect rent online and track tenant payments with a simple, structured system built for apartment complexes.",
    url: pageUrl,
    siteName: "RentFray",
    type: "website",
  },
};

export default function ApartmentsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">
        Free Online Rent Payment System for Apartment Complexes
      </h1>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">
          A Clear Way to Collect and Track Apartment Rent
        </h2>
        <p className="text-slate-600">
          Apartment owners and managers need a simple way to collect rent across
          multiple units without relying on spreadsheets, manual records, or
          overly complicated software. RentFray gives apartment operations a
          structured system to collect rent online, track balances clearly, and
          see exactly which units are paid, pending, or overdue.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Stop Chasing Rent Across Multiple Units
        </h2>
        <p className="text-slate-600">
          Managing rent across an apartment complex becomes harder when payment
          records are scattered across notes, spreadsheets, texts, or separate
          tools. That creates confusion, slows down operations, and makes it
          harder to see what still needs attention.
        </p>
        <p className="text-slate-600">
          RentFray replaces that confusion with one centralized rent payment
          system designed for visibility, simplicity, and day-to-day control.
        </p>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-xl font-semibold">
          Built for Apartment Operations
        </h2>

        <div>
          <h3 className="font-semibold">Collect Rent Online</h3>
          <p className="text-slate-600">
            Residents can submit payments through a simple online flow that is
            easy to understand and easy to complete.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Track Every Unit Clearly</h3>
          <p className="text-slate-600">
            See exactly what each unit owes, what has been paid, and what
            remains due across the property.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Real-Time Payment Visibility</h3>
          <p className="text-slate-600">
            Instantly know which units are current, pending, or behind.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">No Software Cost</h3>
          <p className="text-slate-600">
            RentFray is free for apartment businesses. Residents pay a small
            processing fee when they make payments.
          </p>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Designed for Small and Large Properties
        </h2>
        <p className="text-slate-600">
          Whether you manage a smaller apartment building or a larger complex,
          RentFray helps organize recurring rent into one clear system. It is
          designed to improve visibility, reduce confusion, and make rent
          collection easier to manage at scale.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>

        <div>
          <h3 className="font-semibold">
            How do apartment complexes collect rent online?
          </h3>
          <p className="text-slate-600">
            RentFray gives apartment owners and managers a simple online payment
            system for collecting recurring rent from residents.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Can I track rent by unit?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray is built to show what each unit owes, what has been
            paid, and what remains due.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Is RentFray free for apartment managers?
          </h3>
          <p className="text-slate-600">
            Yes. There are no software fees for the business. Residents pay a
            small processing fee when they submit payments.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <p className="text-lg font-semibold">
          Collect apartment rent with clarity and full visibility using RentFray.
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
          href="/rent-collection-software-landlords"
          className="text-blue-600 hover:underline"
        >
          Rent Collection Software for Landlords
        </Link>
        <Link
          href="/mobile-home-park-rent-collection"
          className="text-blue-600 hover:underline"
        >
          Mobile Home Park Rent Collection
        </Link>
      </section>
    </main>
  );
}