type CheckoutPageProps = {
  searchParams: Promise<{
    code?: string;
  }>;
};

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const { code } = await searchParams;

  return (
    <main className="rfl-placeholder-page">
      <section className="rfl-placeholder-card">
        <p className="rfl-eyebrow">Customer checkout</p>
        <h1>{code ? `Account ${code}` : "Enter an account code"}</h1>
        <p>The payment-option selection screen will be implemented here.</p>
      </section>
    </main>
  );
}
