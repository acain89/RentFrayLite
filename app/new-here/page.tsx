import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "New here? Meet RentFrayLite",
  description: "See how managers set up payment amounts and customers pay by account code. A simple, mobile-first payment portal.",
  robots: { index: false, follow: true },
};

const perks = [
  "Free for managers",
  "No paid upgrades",
  "No contracts",
  "No trial periods",
  "No demos to schedule",
  "No sales calls or emails",
  "Completely self-serve software",
  "No customer accounts needed",
  "Built for phones",
];

const tiers = [{ name: "Standard space", amount: "$650" }, { name: "Premium space", amount: "$850" }];
const payments = [
  { name: "Jordan Ellis", unit: "12", tier: "Standard space", amount: "$650.00", status: "Paid", tone: "paid" },
  { name: "Morgan Lee", unit: "24", tier: "Premium space", amount: "$850.00", status: "Pending", tone: "pending" },
  { name: "Alex Rivera", unit: "08", tier: "Standard space", amount: "$650.00", status: "Failed", tone: "failed" },
];
function DemoLabel({ children }: { children: React.ReactNode }) {
  return <figcaption className="rfl-demo-caption"><span>{children}</span><span>Demo · fictional data</span></figcaption>;
}
export default function NewHerePage() {
  return <main className="rfl-welcome">
    <nav className="rfl-welcome-nav" aria-label="Welcome navigation"><Link href="/" className="rfl-welcome-logo">RFL<span>RentFrayLite</span></Link><Link href="/login/manager">Manager login ↗</Link></nav>
    <header className="rfl-welcome-hero"><p className="rfl-eyebrow">Less setup. Easier payments.</p><h1>Welcome to<br/><span>RentFrayLite.</span></h1>
      <p>A simple, mobile-first payment app for landlords, merchants, tenants and customers. Set your payment amounts. Share your account code. Keep track of payments in one place.</p>
      <div className="rfl-welcome-actions"><a href="#payment-start">Take a quick look ↓</a></div>
    </header>
    <section id="payment-start" className="rfl-welcome-timing" aria-labelledby="payment-start-title">
      <div className="rfl-welcome-timing-heading"><span className="rfl-welcome-calendar" aria-hidden="true"><small>MONTH</small><strong>01</strong></span><div><p className="rfl-eyebrow">Important · before you sign up</p><h2 id="payment-start-title">Monthly payments start<br/>on the next 1st.</h2></div></div>
      <p>For simplicity, RFL starts standard tier payments on the <strong>1st of the month after your business account is created</strong>—not on the day you sign up. You can complete your setup and share your code beforehand.</p>
      <div className="rfl-welcome-timing-example" aria-label="Example start date"><div><span>Example: account created</span><strong>November 24</strong></div><span className="rfl-welcome-timing-arrow" aria-hidden="true">→</span><div><span>First monthly payments open</span><strong>December 1</strong></div></div>
      <dl className="rfl-welcome-timing-rules"><div><dt>Always due on the 1st</dt><dd>Every account uses the same monthly due date.</dd></div><div><dt>Grace ends on the 3rd, 4th or 5th</dt><dd>You choose 3, 4 or 5 calendar days, including the 1st. Configured late fees begin after your selected grace period.</dd></div></dl>
      <p className="rfl-welcome-timing-note"><strong>Need to accept a payment sooner?</strong> Once your account setup and Stripe payment verification are complete, Custom payments are available before the first monthly cycle. Custom payments do not have late fees.</p>
      <p className="rfl-welcome-timing-fine">Creating an account on the 1st still means a start on the following month’s 1st. All payments require completed setup and Stripe approval; reaching the date alone does not activate an unfinished account.</p>
    </section>
    <div id="how-it-works" className="rfl-welcome-steps">
      <section className="rfl-welcome-step" aria-labelledby="welcome-setup"><div className="rfl-welcome-copy"><span className="rfl-welcome-number">01 / FOR MANAGERS</span><h2 id="welcome-setup">Your prices.<br/>Your payment portal.</h2><p>Create your business account, connect your payout bank securely through Stripe, and set your tiers, recurring charges and late-fee rules. Then choose your permanent account code.</p><div className="rfl-welcome-perks"><p className="rfl-welcome-perks-heading">Simple from day one.</p><ul aria-label="RentFrayLite benefits">{perks.map(perk=><li key={perk}><span aria-hidden="true">✓</span><span>{perk}</span></li>)}</ul></div><p className="rfl-welcome-banking-note">Stripe collects the business and banking details needed to send you payouts. RFL does not collect your bank login credentials.</p></div>
        <figure className="rfl-welcome-demo"><DemoLabel>Your setup</DemoLabel><div className="rfl-demo-screen"><div className="rfl-demo-screen-head"><div><small>EXAMPLE BUSINESS</small><strong>Willow Creek Spaces</strong></div><span className="rfl-demo-code">WC-1234</span></div><h3>Payment tiers</h3><div className="rfl-demo-tier-grid">{tiers.map(t=><div className="rfl-demo-tier" key={t.name}><span>{t.name}</span><strong>{t.amount}<small> / month</small></strong><span className="rfl-demo-tier-note">Preset payment amount</span></div>)}</div><div className="rfl-demo-rule"><span>Late-fee rules</span><strong>Configured by you</strong></div><p className="rfl-demo-footnote">Example prices only. Your account uses your own amounts and rules.</p></div></figure>
      </section>
      <section className="rfl-welcome-step rfl-welcome-step-wide" aria-labelledby="welcome-dashboard"><div className="rfl-welcome-copy"><span className="rfl-welcome-number">02 / YOUR DAILY VIEW</span><h2 id="welcome-dashboard">Know where every<br/>payment stands.</h2><p>Your dashboard keeps paid, pending and failed payments easy to spot. See who paid, the amount, their tier and unit—all at a glance.</p><p>Use payment history to find past transactions, review recorded outcomes, and export or print reports. Manage your banking and payout details securely in Stripe.</p></div>
        <figure className="rfl-welcome-demo"><DemoLabel>Manager dashboard</DemoLabel><div className="rfl-demo-screen"><div className="rfl-demo-screen-head"><div><small>MONTHLY ACTIVITY</small><strong>Willow Creek Spaces</strong></div><span className="rfl-demo-code">WC-1234</span></div><div className="rfl-demo-stats"><div className="is-paid"><span>● Paid</span><strong>1</strong></div><div className="is-pending"><span>● Pending</span><strong>1</strong></div><div className="is-failed"><span>● Needs attention</span><strong>1</strong></div></div>
          <h3>Payments</h3><div className="rfl-demo-payment-labels" aria-hidden="true"><span>Status</span><span>Name / unit</span><span>Amount</span></div><ul className="rfl-demo-payments">{payments.map(p=><li key={p.name}><span className={"rfl-demo-status is-"+p.tone}><i aria-hidden="true"/>{p.status}</span><div><strong>{p.name}</strong><small>{p.tier} · Unit {p.unit}</small></div><strong>{p.amount}</strong></li>)}</ul><p className="rfl-demo-footnote">All names, codes and transactions shown here are fictional.</p></div></figure>
      </section>
      <section className="rfl-welcome-step" aria-labelledby="welcome-customer"><div className="rfl-welcome-copy"><span className="rfl-welcome-number">03 / FOR YOUR CUSTOMERS</span><h2 id="welcome-customer">Enter a code.<br/>Choose. Pay.</h2><p>Share your account code or payment link. Customers enter your code, choose the appropriate tier, add their name and unit or reference, and review their payment.</p><p>They pay securely through Stripe by bank account (ACH). The processing fee and full total are shown before they continue. Custom payments are available too.</p><p>Managers can enable optional browser payment-status notifications on supported devices. Customers do not need a tenant account.</p></div>
        <figure className="rfl-welcome-demo rfl-welcome-phone"><DemoLabel>Customer view</DemoLabel><div className="rfl-demo-screen"><div className="rfl-demo-phone-brand">RFL <span>WC-1234</span></div><h3>Willow Creek Spaces</h3><p className="rfl-demo-intro">Select your payment option</p>{tiers.map((t,i)=><div key={t.name} className={"rfl-demo-choice"+(i===0?" is-selected":"")}><span className="rfl-demo-radio" aria-hidden="true"/><div><strong>{t.name}</strong><small>Standard payment</small></div><strong>{t.amount}</strong></div>)}<div className="rfl-demo-customer-fields"><div><small>Name</small><span>Jordan Ellis</span></div><div><small>Unit / space</small><span>12</span></div></div><div className="rfl-demo-faux-button">Review payment →</div><p className="rfl-demo-footnote">Illustration only. No payment can be made from this demo.</p></div></figure>
      </section>
    </div>
    <section className="rfl-welcome-close"><p className="rfl-eyebrow">That’s it.</p><h2>Simple to set up.<br/>Simple to use.</h2><p>A payment portal with your preset amounts and late-fee rules—without customer logins or a complicated daily workflow.</p><p className="rfl-welcome-pricing">Free for managers. Customers pay a processing fee disclosed before checkout. Payments are one-time; choosing a monthly tier does not enroll anyone in autopay.</p><div className="rfl-welcome-actions"><Link href="/">Have an account code? Make a payment →</Link></div></section>
  </main>;
}
