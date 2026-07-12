import type { Metadata } from "next";
import Link from "next/link";

const pageUrl = "https://rentfray.com/rent-collection-software-landlords";

export const metadata: Metadata = {
  title: "Free Rent Collection Software for Landlords | RentFray",
  description:
    "Free rent collection software for landlords. Collect rent online, track tenant payments, and manage balances with no software cost.",
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    title: "Free Rent Collection Software for Landlords | RentFray",
    description:
      "Collect rent online and track tenant payments with a simple, structured system built for landlords.",
    url: pageUrl,
    siteName: "RentFray",
    type: "website",
  },
};

export default function LandlordsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight">
        Free Rent Collection Software for Landlords
      </h1>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold">
          A Simpler Way to Collect and Track Rent
        </h2>
        <p className="text-slate-600">
          Landlords need a clear way to collect rent, track tenant payments, and
          see exactly what is due without relying on spreadsheets, handwritten
          notes, or overly complicated software. RentFray gives landlords a
          structured system to collect rent online, track balances clearly, and
          manage recurring payments in one place.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Stop Chasing Rent and Manual Records
        </h2>
        <p className="text-slate-600">
          When rent tracking is handled manually, it becomes harder to know who
          has paid, who is late, and what still needs attention. That creates
          confusion, delays, and unnecessary follow-up work.
        </p>
        <p className="text-slate-600">
          RentFray replaces that confusion with one centralized rent collection
          system designed for visibility, simplicity, and day-to-day control.
        </p>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-xl font-semibold">Built for Landlords</h2>

        <div>
          <h3 className="font-semibold">Collect Rent Online</h3>
          <p className="text-slate-600">
            Tenants can submit payments through a simple online flow that is
            easy to understand and easy to complete.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Track Every Payment Clearly</h3>
          <p className="text-slate-600">
            See exactly what has been paid, what remains due, and which tenants
            still need attention.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Clear Balance Visibility</h3>
          <p className="text-slate-600">
            Keep balances, payment status, and recurring rent information in one
            structured system.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">No Software Cost</h3>
          <p className="text-slate-600">
            RentFray is free for landlords. Tenants pay a small processing fee
            when they make payments.
          </p>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">
          Designed for Small and Growing Portfolios
        </h2>
        <p className="text-slate-600">
          Whether you manage a few units or a larger group of properties,
          RentFray helps organize recurring rent into one clear system. It is
          designed to reduce confusion, improve visibility, and make rent
          collection easier to manage.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>

        <div>
          <h3 className="font-semibold">How can landlords collect rent online?</h3>
          <p className="text-slate-600">
            RentFray gives landlords a simple online payment system for
            collecting recurring rent from tenants.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">
            Can I track tenant balances and payments?
          </h3>
          <p className="text-slate-600">
            Yes. RentFray is built to show what each tenant owes, what has been
            paid, and what remains due.
          </p>
        </div>

        <div>
          <h3 className="font-semibold">Is RentFray free for landlords?</h3>
          <p className="text-slate-600">
            Yes. There are no software fees for the landlord. Tenants pay a
            small processing fee when they submit payments.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <p className="text-lg font-semibold">
          Collect rent and track tenant payments with clarity using RentFray.
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
          href="/online-rent-payment-system-apartments"
          className="text-blue-600 hover:underline"
        >
          Apartment Rent Payment System
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