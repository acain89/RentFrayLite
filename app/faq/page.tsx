export default function FAQPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">
        Frequently Asked Questions
      </h1>

      <div className="space-y-6 text-sm text-slate-700">

        <div>
          <p className="font-semibold">1. How do I get started?</p>
          <p>
            Create your account, enter your property details, and generate your
            property code. No banking info required upfront.
          </p>
        </div>

        <div>
          <p className="font-semibold">2. Do I need to connect my bank account first?</p>
          <p>
            No. You can fully set up your property before connecting payouts.
          </p>
        </div>

        <div>
          <p className="font-semibold">3. How do tenants sign up?</p>
          <p>
            Tenants enter your property code, their unit number, and a PIN. No
            invites or manual setup needed.
          </p>
        </div>

        <div>
          <p className="font-semibold">4. Do I need to add tenants manually?</p>
          <p>
            No. Tenants self-register. Your dashboard builds automatically as
            they join and pay.
          </p>
        </div>

        <div>
          <p className="font-semibold">5. How do payments get to me?</p>
          <p>
            Payments are processed through Stripe and deposited directly into
            your connected bank account.
          </p>
        </div>

        <div>
          <p className="font-semibold">6. How long do payouts take?</p>
          <p>
            Typically 2–3 business days depending on Stripe and your bank.
          </p>
        </div>

        <div>
          <p className="font-semibold">7. Are there any monthly fees?</p>
          <p>
            No. Businesses never pay. Tenants pay a small, single-digit processing fee per transaction.
          </p>
        </div>

        <div>
          <p className="font-semibold">8. Can I still accept cash or other payments?</p>
          <p>
            Yes. You can record manual payments to keep your ledger accurate.
          </p>
        </div>

        <div>
          <p className="font-semibold">9. What happens if a tenant pays late?</p>
          <p>
            The system automatically tracks delinquency and applies late fees
            based on your settings.
          </p>
        </div>

        <div>
          <p className="font-semibold">10. Can I customize late fees and grace periods?</p>
          <p>
            Yes. You can define due dates, grace periods, and late fees at the
            property or tier level.
          </p>
        </div>

        <div>
          <p className="font-semibold">11. Can I turn late fees off?</p>
          <p>
            Yes. You have full control over whether late fees are enabled.
          </p>
        </div>

        <div>
          <p className="font-semibold">12. How do I know who has paid?</p>
          <p>
            Your dashboard shows real-time status: Green = paid, Yellow =
            pending, Red = past due.
          </p>
        </div>

        <div>
          <p className="font-semibold">13. What does “Payment Pending” mean?</p>
          <p>
            It means the payment is processing and will update automatically
            once completed.
          </p>
        </div>

        <div>
          <p className="font-semibold">14. Can tenants see their balance?</p>
          <p>
            Yes. Tenants always see their current balance and payment status in
            their portal.
          </p>
        </div>

        <div>
          <p className="font-semibold">15. Is there a limit to how many units I can have?</p>
          <p>
            You set your total unit count, and the system enforces it
            automatically.
          </p>
        </div>

        <div>
          <p className="font-semibold">16. Can I deactivate units?</p>
          <p>
            Yes. You can mark units inactive so they don’t count toward your
            active total.
          </p>
        </div>

        <div>
          <p className="font-semibold">17. What happens if a tenant moves out?</p>
          <p>
            You can remove or vacate tenants while keeping all historical data
            intact.
          </p>
        </div>

        <div>
          <p className="font-semibold">18. Can I export my data?</p>
          <p>
            Yes. Export balances, ledger entries, and payment history anytime.
          </p>
        </div>

        <div>
          <p className="font-semibold">19. Is this secure?</p>
          <p>
            Yes. Payments are handled by Stripe with bank-level security
            standards.
          </p>
        </div>

        <div>
          <p className="font-semibold">20. What if I need help?</p>
          <p>
            Email{" "}
            <a
              href="mailto:HelpDesk@Rentfray.com"
              className="text-blue-600 underline"
            >
              HelpDesk@Rentfray.com
            </a>
          </p>
        </div>

        <div className="pt-6 border-t border-slate-200">
          <p className="text-sm text-slate-800 font-medium">
            RentFray represents a new standard for managing recurring payments.
          </p>
          <p className="mt-2">
            It’s built to be simple for businesses, secure for financial data,
            and fully self-serve from day one. Once your core settings are in
            place, the system is designed to build itself as tenants onboard and
            pay — with minimal oversight required.
          </p>
          <p className="mt-3 font-semibold">
            It’s free. It’s simple. It’s secure. Try it. If it’s not a perfect
            fit, there’s nothing to lose.
          </p>
        </div>

      </div>
    </main>
  );
}