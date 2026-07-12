// app/collect-rent-online/page.tsx

import Link from "next/link";

export const metadata = {
  title: "Collect Rent Online | Free Rent Collection System | RentFray",
  description:
    "Collect rent online with no monthly fees. Simple rent payment system for landlords and property managers. Tenants pay online, you get paid directly.",
};

export default function CollectRentOnlinePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">

      {/* HERO */}
      <section className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Collect Rent Online — Without Software, Fees, or Friction
        </h1>

        <p className="mt-4 text-lg text-slate-600">
          Collect rent payments online with a system built for simplicity. No monthly fees,
          no complicated setup, and no software to learn. Just a direct way to collect rent,
          track payments, and stay in control.
        </p>

        <div className="mt-6">
          <Link href="/" className="inline-block rounded-xl bg-black px-6 py-3 text-white hover:bg-slate-800">
            Start Collecting Rent
          </Link>
        </div>
      </section>

      {/* PROBLEM EXPANDED */}
      <section className="mb-12 space-y-4 text-slate-700">
        <h2 className="text-2xl font-semibold">The Problem with Traditional Rent Collection</h2>

        <p>
          Collecting rent manually creates friction at every step. Checks get delayed,
          cash payments are difficult to track, and spreadsheets quickly become unreliable.
        </p>

        <p>
          For small landlords, this means chasing payments and manually updating records.
          For larger properties, it creates operational inefficiencies and constant uncertainty.
        </p>

        <p>
          Even digital tools like peer-to-peer apps weren’t built for structured rent collection.
          They lack proper tracking, consistency, and visibility.
        </p>

        <p className="font-medium">
          A proper online rent collection system removes all of this.
        </p>
      </section>

      {/* KEYWORD SATURATION */}
      <section className="mb-12 space-y-4 text-slate-700">
        <h2 className="text-2xl font-semibold">A Complete Online Rent Payment System</h2>

        <p>
          RentFray is a focused rent payment platform designed specifically for collecting
          rent payments online. It replaces manual methods and eliminates the need for
          complex property management software.
        </p>

        <p>
          With RentFray, you can:
        </p>

        <ul className="space-y-2">
          <li>• Collect rent online from any tenant</li>
          <li>• Track rent payments in real time</li>
          <li>• Provide a simple tenant payment experience</li>
          <li>• Eliminate spreadsheets and manual tracking</li>
          <li>• Run a clean, structured rent collection system</li>
        </ul>

        <p>
          This is digital rent collection built for clarity and speed.
        </p>
      </section>

      {/* HOW IT WORKS */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">How to Collect Rent Online</h2>

        <div className="space-y-4 text-slate-700">
          <p><strong>1.</strong> Create your property</p>
          <p><strong>2.</strong> Receive your property code</p>
          <p><strong>3.</strong> Share the code with tenants</p>
          <p><strong>4.</strong> Tenants activate and pay rent online</p>
          <p><strong>5.</strong> Payments are processed and sent directly to you</p>
        </div>

        <p className="mt-4 text-slate-600">
          No onboarding calls. No training. No complicated setup process.
        </p>
      </section>

      {/* SWITCH MOMENT */}
      <section className="mb-12 space-y-4 text-slate-700">
        <h2 className="text-2xl font-semibold">When Landlords Switch to Online Rent Collection</h2>

        <p>
          Most landlords switch to collecting rent online after experiencing the same issues:
          late payments, missing records, or time-consuming manual tracking.
        </p>

        <p>
          Once rent collection moves online, everything becomes predictable.
          Payments are recorded automatically, tenants have a consistent way to pay,
          and there’s no guesswork.
        </p>

        <p className="font-medium">
          After switching, very few go back to manual systems.
        </p>
      </section>

      {/* WHO IT’S FOR */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">Who This Rent Collection System Is For</h2>

        <div className="space-y-4 text-slate-700">
          <p>
            RentFray works for any situation where rent payments need to be collected regularly.
          </p>

          <ul className="space-y-2">
            <li>• Small landlords managing a handful of units</li>
            <li>• Apartment complexes</li>
            <li>• Mobile home parks</li>
            <li>• RV parks</li>
            <li>• Self-storage facilities</li>
            <li>• Multi-property operators</li>
          </ul>

          <p>
            Whether you collect rent from 2 tenants or 200, the system stays simple.
          </p>
        </div>
      </section>

      {/* COMPARISON DEEP */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">RentFray vs Other Ways to Collect Rent</h2>

        <div className="space-y-6 text-slate-700">

          <div>
            <p className="font-semibold">RentFray vs Venmo / Cash App</p>
            <p>
              Peer-to-peer apps are not built for rent collection. They lack tracking,
              structure, and consistency. RentFray provides a dedicated system where
              every rent payment is recorded and organized.
            </p>
          </div>

          <div>
            <p className="font-semibold">RentFray vs Spreadsheets</p>
            <p>
              Spreadsheets require manual updates and are prone to errors. RentFray
              automates the entire process and eliminates manual tracking.
            </p>
          </div>

          <div>
            <p className="font-semibold">RentFray vs Property Management Software</p>
            <p>
              Full property management platforms are often expensive and complex.
              RentFray focuses only on rent collection — making it faster, simpler,
              and easier to use.
            </p>
          </div>

        </div>
      </section>

      {/* TRUST */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">How Payments Work</h2>

        <div className="space-y-4 text-slate-700">
          <p>
            Payments are processed securely and sent directly to your connected account.
          </p>

          <p>
            You don’t hold funds manually, and you don’t need to track transactions yourself.
            Every rent payment is automatically recorded in the system.
          </p>

          <p>
            This creates a clear, reliable record of all rent activity — something
            traditional methods cannot match.
          </p>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">Benefits of Online Rent Payments</h2>

        <div className="space-y-4 text-slate-700">
          <p><strong>Real-time visibility:</strong> Always know who has paid</p>
          <p><strong>Faster payments:</strong> Tenants pay instantly</p>
          <p><strong>Automation:</strong> No manual tracking required</p>
          <p><strong>Consistency:</strong> Standardized payment process</p>
          <p><strong>Professional experience:</strong> Clean and simple for tenants</p>
        </div>
      </section>

      {/* FAQ EXPANDED */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">Frequently Asked Questions</h2>

        <div className="space-y-4 text-slate-700">
          <p><strong>How do I collect rent online?</strong><br />Create a property, share your code, and tenants pay.</p>
          <p><strong>Is this free?</strong><br />Yes. No monthly fees for landlords.</p>
          <p><strong>Do tenants need an app?</strong><br />No. Everything works in a browser.</p>
          <p><strong>Can I track rent payments?</strong><br />Yes, automatically.</p>
          <p><strong>Is this secure?</strong><br />Yes, payments are processed securely.</p>
          <p><strong>Can I use this for small properties?</strong><br />Yes.</p>
          <p><strong>Can I use this for large properties?</strong><br />Yes.</p>
          <p><strong>What is the best way to collect rent online?</strong><br />Use a structured system like RentFray.</p>
          <p><strong>Can I replace spreadsheets?</strong><br />Yes, completely.</p>
          <p><strong>How fast can I start?</strong><br />Usually under a minute.</p>
        </div>
      </section>

      {/* INTERNAL LINKS */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold">Explore More</h2>

        <div className="space-y-2 text-blue-600">
          <Link href="/rent-payment-app">Rent Payment App</Link><br />
          <Link href="/online-rent-payment-system">Online Rent Payment System</Link><br />
          <Link href="/tenant-payment-portal">Tenant Payment Portal</Link><br />
          <Link href="/free-rent-collection-software">Free Rent Collection Software</Link><br />
          <Link href="/rent-collection-software-landlords">Rent Collection Software for Landlords</Link>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
        <h3 className="text-xl font-semibold">Start Collecting Rent Online Today</h3>

        <p className="mt-2 text-slate-600">
          No subscriptions. No setup fees. Just a better way to collect rent.
        </p>

        <Link
          href="/"
          className="mt-4 inline-block rounded-xl bg-black px-6 py-3 text-white hover:bg-slate-800"
        >
          Create Free Account
        </Link>
      </section>

    </main>
  );
}