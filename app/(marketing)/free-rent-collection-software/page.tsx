import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = "https://rentfray.com";
const pagePath = "/free-rent-collection-software";
const pageUrl = `${siteUrl}${pagePath}`;
const pageTitle = "Free Rent Collection Software | RentFray";
const pageDescription =
  "Free rent collection software for landlords and property managers. Collect rent online, track tenant payments, and manage balances with no software cost.";

const faqItems = [
  {
    question: "Is RentFray really free for landlords and property managers?",
    answer:
      "Yes. RentFray is free for businesses. Tenants pay a small processing fee when they submit payments.",
  },
  {
    question: "Can I collect rent online with RentFray?",
    answer:
      "Yes. RentFray gives landlords and property managers a simple online payment system for collecting recurring rent.",
  },
  {
    question: "Can I track balances and payment status?",
    answer:
      "Yes. RentFray is built to show what each tenant or unit owes, what has been paid, and what remains due.",
  },
  {
    question: "What types of properties can use RentFray?",
    answer:
      "RentFray works for apartment complexes, rental housing, mobile home parks, RV parks, and other recurring-payment property businesses.",
  },
] as const;

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RentFray",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: pageUrl,
  description: pageDescription,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: pagePath,
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: pageUrl,
    siteName: "RentFray",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
      {children}
    </h2>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
    </div>
  );
}

export default function FreeRentCollectionSoftwarePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              RentFray
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Free Rent Collection Software
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              Collect rent online, track every payment clearly, and manage
              recurring balances without software fees.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/setup"
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Start Free Setup
              </Link>
              <Link
                href="/online-rent-payment-system"
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                See Overview
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <SectionHeading>
            A Clear Way to Collect and Track Rent
          </SectionHeading>
          <p className="mt-5 text-base leading-8 text-slate-600">
            RentFray is free rent collection software for landlords and property
            managers who want a simple, structured way to collect rent online.
            Instead of relying on spreadsheets, manual notes, or confusing
            tools, you get one clear system for tracking tenant payments,
            balances, and recurring billing.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <SectionHeading>
              Stop Chasing Rent and Manual Records
            </SectionHeading>
            <p className="mt-5 text-base leading-8 text-slate-600">
              When rent collection is handled manually, it becomes harder to
              know who has paid, who is behind, and what still needs attention.
              That creates confusion, delays, and extra follow-up work.
            </p>
            <p className="mt-4 text-base leading-8 text-slate-600">
              RentFray replaces that confusion with one centralized rent
              collection system designed for visibility, simplicity, and
              day-to-day control.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading>
          Everything Needed to Manage Rent Clearly
        </SectionHeading>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <FeatureCard
            title="Collect Rent Online"
            description="Tenants submit payments through a simple guided flow designed to be easy to understand and complete."
          />
          <FeatureCard
            title="Track Payments in Real Time"
            description="See exactly what has been paid, what remains due, and which tenants or units still need attention."
          />
          <FeatureCard
            title="Clear Balance Visibility"
            description="Payment amounts, balances, and recurring rent stay visible and easy to understand."
          />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <SectionHeading>No Software Cost for Businesses</SectionHeading>
            <p className="mt-5 text-base leading-8 text-slate-600">
              RentFray is free for landlords and property managers. There are
              no monthly platform fees or software subscriptions. Tenants pay a
              small processing fee when they submit payments.
            </p>
            <p className="mt-4 text-base leading-8 text-slate-600">
              That makes RentFray a strong fit for businesses that want a clear
              payment system without adding another recurring software bill.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <SectionHeading>Built for Property-Based Businesses</SectionHeading>
          <p className="mt-5 text-base leading-8 text-slate-600">
            RentFray works for apartment complexes, rental housing, mobile home
            parks, RV parks, and other recurring-payment property businesses. It
            is built for operators who need obvious setup, clear balances, and a
            direct way to collect rent online.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-800">
            Apartment complexes
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-800">
            Rental housing
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-800">
            Mobile home parks
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-slate-800">
            RV parks
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <SectionHeading>
              Know Exactly What Is Paid and What Is Not
            </SectionHeading>

            <ul className="mt-6 space-y-3 text-base leading-8 text-slate-600">
              <li>Real-time payment status</li>
              <li>Clear due amounts</li>
              <li>Consistent balance tracking</li>
              <li>Simple setup for landlords and managers</li>
            </ul>

            <p className="mt-6 text-base leading-8 text-slate-600">
              No guessing, no messy spreadsheets, and no buried totals.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading>Frequently Asked Questions</SectionHeading>

        <div className="mt-8 space-y-4">
          {faqItems.map((item) => (
            <div
              key={item.question}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-slate-900">
                {item.question}
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-slate-950 px-6 py-10 text-white shadow-xl sm:px-10">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Collect rent with clarity and full visibility using RentFray.
            </h2>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/setup"
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Start Setup
              </Link>
              <Link
                href="/online-rent-payment-system"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Online Payment System
              </Link>
              <Link
                href="/rent-collection-software-landlords"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Landlord Page
              </Link>
              <Link
                href="/online-rent-payment-system-apartments"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Apartment Page
              </Link>
              <Link
                href="/mobile-home-park-rent-collection"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Mobile Home Parks
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}