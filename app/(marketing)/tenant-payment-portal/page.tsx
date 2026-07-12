import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = "https://rentfray.com";
const pagePath = "/tenant-payment-portal";
const pageUrl = `${siteUrl}${pagePath}`;
const pageTitle = "Tenant Payment Portal | RentFray";
const pageDescription =
  "Simple tenant payment portal for landlords and property managers. Let tenants pay online, track balances clearly, and manage recurring rent with no software cost.";

const faqItems = [
  {
    question: "What is a tenant payment portal?",
    answer:
      "A tenant payment portal is an online system that lets tenants submit rent payments and lets landlords or property managers track balances and payment activity in one place.",
  },
  {
    question: "Can tenants pay online with RentFray?",
    answer:
      "Yes. RentFray gives tenants a simple, guided online payment flow that is easy to use and easy to complete.",
  },
  {
    question: "Can landlords track balances and payment status?",
    answer:
      "Yes. RentFray is built to show what each tenant or unit owes, what has been paid, and what remains due.",
  },
  {
    question: "Is RentFray free for businesses?",
    answer:
      "Yes. RentFray is free for landlords and property managers. Tenants pay a small processing fee when they submit payments.",
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

export default function TenantPaymentPortalPage() {
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
              Tenant Payment Portal
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              Give tenants a simple way to pay online while keeping balances,
              payment status, and recurring rent easy to track.
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
            A Clear Online Payment Experience for Tenants
          </SectionHeading>
          <p className="mt-5 text-base leading-8 text-slate-600">
            RentFray gives landlords and property managers a tenant payment
            portal that is simple to understand and easy to use. Tenants can
            submit payments online through a guided flow, while managers keep a
            clear view of balances, payment activity, and what is still due.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <SectionHeading>
              Stop Relying on Texts, Notes, and Manual Follow-Up
            </SectionHeading>
            <p className="mt-5 text-base leading-8 text-slate-600">
              When tenants do not have a clear payment portal, rent collection
              often turns into reminders, back-and-forth messages, and scattered
              records. That slows down operations and makes payment tracking
              harder than it needs to be.
            </p>
            <p className="mt-4 text-base leading-8 text-slate-600">
              RentFray replaces that confusion with one centralized system where
              tenants know where to pay and managers know exactly what has been
              submitted.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading>
          What a Good Tenant Payment Portal Should Do
        </SectionHeading>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <FeatureCard
            title="Make Online Payments Simple"
            description="Tenants move through a clear payment flow designed to reduce confusion and improve completion."
          />
          <FeatureCard
            title="Show Clear Balances"
            description="Managers can see what each tenant or unit owes, what has been paid, and what still remains due."
          />
          <FeatureCard
            title="Keep Payment Tracking Centralized"
            description="Payment activity stays visible in one place instead of being spread across notes, spreadsheets, or separate tools."
          />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <SectionHeading>Built for Simplicity and Visibility</SectionHeading>
            <p className="mt-5 text-base leading-8 text-slate-600">
              RentFray is designed to make the tenant side simple without
              sacrificing manager visibility. The payment path stays direct,
              balances stay clear, and rent collection stays organized.
            </p>
            <p className="mt-4 text-base leading-8 text-slate-600">
              That makes it a strong fit for landlords and property managers who
              want a payment portal that is obvious for tenants and practical
              for day-to-day operations.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <SectionHeading>No Software Cost for Businesses</SectionHeading>
          <p className="mt-5 text-base leading-8 text-slate-600">
            RentFray is free for landlords and property managers. There are no
            monthly software fees. Tenants pay a small processing fee when they
            submit payments through the portal.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <SectionHeading>
              Works Across Multiple Property Types
            </SectionHeading>
            <p className="mt-5 text-base leading-8 text-slate-600">
              RentFray works for apartment complexes, rental housing, mobile
              home parks, RV parks, and other recurring-payment property
              businesses that need a simple tenant payment portal with clear
              balance tracking.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-800">
              Apartment complexes
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-800">
              Rental housing
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-800">
              Mobile home parks
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-800">
              RV parks
            </div>
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
              Give tenants a clear way to pay and keep rent tracking simple with
              RentFray.
            </h2>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/setup"
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Start Setup
              </Link>
              <Link
                href="/free-rent-collection-software"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Free Rent Collection Software
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
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}