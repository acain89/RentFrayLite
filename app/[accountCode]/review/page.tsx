import { CheckoutSessionStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ReviewPaymentClient, {
  type ReviewLineItem,
} from "./ReviewPaymentClient";

type ReviewPageProps = {
  params: Promise<{
    accountCode: string;
  }>;
  searchParams: Promise<{
    session?: string | string[];
  }>;
};

function normalizeAccountCode(value: string): string {
  return decodeURIComponent(value)
    .trim()
    .toUpperCase();
}

function getSessionId(
  value: string | string[] | undefined
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function parseLineItems(
  value: unknown
): ReviewLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null
    ) {
      return [];
    }

    const candidate = item as Record<
      string,
      unknown
    >;

    if (
      typeof candidate.type !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.amountCents !== "number"
    ) {
      return [];
    }

    return [
      {
        type: candidate.type,
        label: candidate.label,
        amountCents:
          candidate.amountCents,
      },
    ];
  });
}

export default async function ReviewPage({
  params,
  searchParams,
}: ReviewPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams =
    await searchParams;

  const accountCode = normalizeAccountCode(
    resolvedParams.accountCode
  );

  const checkoutSessionId = getSessionId(
    resolvedSearchParams.session
  );

  if (!checkoutSessionId) {
    notFound();
  }

  const checkoutSession =
    await prisma.checkoutSession.findUnique({
      where: {
        id: checkoutSessionId,
      },
    });

  if (!checkoutSession) {
    notFound();
  }

  if (
    checkoutSession.accountCode.toUpperCase() !==
    accountCode
  ) {
    notFound();
  }

  const now = new Date();

  if (
    checkoutSession.expiresAt.getTime() <=
    now.getTime()
  ) {
    if (
      checkoutSession.status ===
      CheckoutSessionStatus.CREATED
    ) {
      await prisma.checkoutSession.update({
        where: {
          id: checkoutSession.id,
        },
        data: {
          status:
            CheckoutSessionStatus.EXPIRED,
        },
      });
    }

    return (
      <main className="rfl-public-checkout-page">
        <section className="rfl-checkout-shell">
          <div className="rfl-review-state-card">
            <h1>Payment session expired</h1>

            <p>
              This payment session has expired.
              Please return to the payment page
              and begin again.
            </p>

            <a
              className="rfl-checkout-primary-button"
              href={`/${encodeURIComponent(
                accountCode
              )}`}
            >
              Start Again
            </a>
          </div>
        </section>
      </main>
    );
  }

  const allowedStatuses: CheckoutSessionStatus[] =
    [
      CheckoutSessionStatus.CREATED,
      CheckoutSessionStatus.REVIEWED,
    ];

  if (
    !allowedStatuses.includes(
      checkoutSession.status
    )
  ) {
    return (
      <main className="rfl-public-checkout-page">
        <section className="rfl-checkout-shell">
          <div className="rfl-review-state-card">
            <h1>Payment session unavailable</h1>

            <p>
              This payment session can no longer
              be reviewed. Please begin a new
              payment.
            </p>

            <a
              className="rfl-checkout-primary-button"
              href={`/${encodeURIComponent(
                accountCode
              )}`}
            >
              Start New Payment
            </a>
          </div>
        </section>
      </main>
    );
  }

  const business =
    await prisma.business.findUnique({
      where: {
        id: checkoutSession.businessId,
      },
      select: {
        name: true,
      },
    });

  if (!business) {
    notFound();
  }

  if (
    checkoutSession.status ===
    CheckoutSessionStatus.CREATED
  ) {
    await prisma.checkoutSession.update({
      where: {
        id: checkoutSession.id,
      },
      data: {
        status:
          CheckoutSessionStatus.REVIEWED,
      },
    });
  }

  const lineItems = parseLineItems(
    checkoutSession.lineItems
  );

  if (lineItems.length === 0) {
    throw new Error(
      "Checkout session contains no valid line items."
    );
  }

  return (
    <ReviewPaymentClient
      checkoutSessionId={checkoutSession.id}
      businessName={business.name}
      accountCode={
        checkoutSession.accountCode
      }
      unitNumber={
        checkoutSession.unitNumber
      }
      firstName={checkoutSession.firstName}
      lastName={checkoutSession.lastName}
      phone={checkoutSession.phone}
      paymentMethod={
        checkoutSession.paymentMethod
      }
      billingCycle={
        checkoutSession.billingCycle
      }
      dueDate={
        checkoutSession.dueDate.toISOString()
      }
      graceEndsAt={
        checkoutSession.graceEndsAt.toISOString()
      }
      lineItems={lineItems}
      subtotalCents={
        checkoutSession.subtotalCents
      }
      platformFeeCents={
        checkoutSession.platformFeeCents
      }
      totalCents={
        checkoutSession.totalCents
      }
    />
  );
}