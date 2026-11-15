import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "New here? Meet RentFrayLite",
  description: "See how managers set up payment amounts and customers pay by account code. A simple, mobile-first payment portal.",
  robots: { index: false, follow: true },
};

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
      <div className="rfl-welcome-actions"><Link className="rfl-primary-button" href="/setup">Create your free account</Link><a href="#how-it-works">Take a quick look ↓</a></div>
      <div className="rfl-welcome-facts"><span>Free for managers</span><span>No customer account needed</span><span>Secure Stripe checkout</span></div>
    </header>
    <div id="how-it-works" className="rfl-welcome-steps">
      <section className="rfl-welcome-step" aria-labelledby="welcome-setup"><div className="rfl-welcome-copy"><span className="rfl-welcome-number">01 / FOR MANAGERS</span><h2 id="welcome-setup">Your prices.<br/>Your payment portal.</h2><p>Create your business account, connect your payout bank securely through Stripe, and set your tiers, recurring charges and late-fee rules. Then choose your permanent account code.</p><p>RFL is free for managers, with no subscription or card required to sign up. Stripe collects the business and banking details needed to send you payouts.</p></div>
        <figure className="rfl-welcome-demo"><DemoLabel>Your setup</DemoLabel><div className="rfl-demo-screen"><div className="rfl-demo-screen-head"><div><small>EXAMPLE BUSINESS</small><strong>Willow Creek Spaces</strong></div><span className="rfl-demo-code">WC-1234</span></div><h3>Payment tiers</h3><div className="rfl-demo-tier-grid">{tiers.map(t=><div className="rfl-demo-tier" key={t.name}><span>{t.name}</span><strong>{t.amount}<small> / month</small></strong><span className="rfl-demo-tier-note">Preset payment amount</span></div>)}</div><div className="rfl-demo-rule"><span>Late-fee rules</span><strong>Configured by you</strong></div><p className="rfl-demo-footnote">Example prices only. Your account uses your own amounts and rules.</p></div></figure>
      </section>
      <section className="rfl-welcome-step rfl-welcome-step-wide" aria-labelledby="welcome-dashboard"><div className="rfl-welcome-copy"><span className="rfl-welcome-number">02 / YOUR DAILY VIEW</span><h2 id="welcome-dashboard">Know where every<br/>payment stands.</h2><p>Your dashboard keeps paid, pending and failed payments easy to spot. See who paid, the amount, their tier and unit—all at a glance.</p><p>Use payment history to find past transactions, review recorded outcomes, and export or print reports. Manage your banking and payout details securely in Stripe.</p></div>
        <figure className="rfl-welcome-demo"><DemoLabel>Manager dashboard</DemoLabel><div className="rfl-demo-screen"><div className="rfl-demo-screen-head"><div><small>MONTHLY ACTIVITY</small><strong>Willow Creek Spaces</strong></div><span className="rfl-demo-code">WC-1234</span></div><div className="rfl-demo-stats"><div className="is-paid"><span>● Paid</span><strong>1</strong></div><div className="is-pending"><span>● Pending</span><strong>1</strong></div><div className="is-failed"><span>● Needs attention</span><strong>1</strong></div></div>
          <h3>Payments</h3><div className="rfl-demo-payment-labels" aria-hidden="true"><span>Status</span><span>Name / unit</span><span>Amount</span></div><ul className="rfl-demo-payments">{payments.map(p=><li key={p.name}><span className={"rfl-demo-status is-"+p.tone}><i aria-hidden="true"/>{p.status}</span><div><strong>{p.name}</strong><small>{p.tier} · Unit {p.unit}</small></div><strong>{p.amount}</strong></li>)}</ul><p className="rfl-demo-footnote">All names, codes and transactions shown here are fictional.</p></div></figure>
      </section>
      <section className="rfl-welcome-step" aria-labelledby="welcome-customer"><div className="rfl-welcome-copy"><span className="rfl-welcome-number">03 / FOR YOUR CUSTOMERS</span><h2 id="welcome-customer">Enter a code.<br/>Choose. Pay.</h2><p>Share your account code or payment link. Customers enter your code, choose the appropriate tier, add their name and unit or reference, and review their payment.</p><p>They pay securely through Stripe by bank account (ACH) or card. The processing fee and full total are shown before they continue. Custom payments are available too.</p><p>Managers and customers can separately opt into SMS payment-status alerts. Consent is optional; message and data rates may apply.</p></div>
        <figure className="rfl-welcome-demo rfl-welcome-phone"><DemoLabel>Customer view</DemoLabel><div className="rfl-demo-screen"><div className="rfl-demo-phone-brand">RFL <span>WC-1234</span></div><h3>Willow Creek Spaces</h3><p className="rfl-demo-intro">Select your payment option</p>{tiers.map((t,i)=><div key={t.name} className={"rfl-demo-choice"+(i===0?" is-selected":"")}><span className="rfl-demo-radio" aria-hidden="true"/><div><strong>{t.name}</strong><small>Standard payment</small></div><strong>{t.amount}</strong></div>)}<div className="rfl-demo-customer-fields"><div><small>Name</small><span>Jordan Ellis</span></div><div><small>Unit / space</small><span>12</span></div></div><div className="rfl-demo-faux-button">Review payment →</div><p className="rfl-demo-footnote">Illustration only. No payment can be made from this demo.</p></div></figure>
      </section>
    </div>
    <section className="rfl-welcome-close"><p className="rfl-eyebrow">That’s it.</p><h2>Simple to set up.<br/>Simple to use.</h2><p>A payment portal with your preset amounts and late-fee rules—without customer logins or a complicated daily workflow.</p><p className="rfl-welcome-pricing">Free for managers. Customers pay a processing fee disclosed before checkout. Payments are one-time; choosing a monthly tier does not enroll anyone in autopay.</p><div className="rfl-welcome-actions"><Link className="rfl-primary-button" href="/setup">Create your free account</Link><Link href="/">Have an account code? Make a payment →</Link></div></section>
  </main>;
}
