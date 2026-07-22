import {
  CheckoutSessionStatus,
  PaymentMethod,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  calculateCheckoutPricing,
  type CheckoutPricingPlan,
} from "@/lib/checkoutPricing";
import {
  getPublicCheckoutBusiness,
  isRecurringCheckoutBusiness,
} from "@/lib/publicCheckout";

type CreateCheckoutSessionRequest = {
  accountCode?: unknown;
  planId?: unknown;
  unitNumber?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  paymentMethod?: unknown;
};

function getTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPaymentMethod(
  value: unknown
): value is PaymentMethod {
  return (
    value === PaymentMethod.ACH ||
    value === PaymentMethod.CARD
  );
}

function normalizeUnitNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidPhone(phone: string): boolean {
  return phone.length === 10;
}

export async function POST(request: Request) {
  let body: CreateCheckoutSessionRequest;

  try {
    body =
      (await request.json()) as CreateCheckoutSessionRequest;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      {
        status: 400,
      }
    );
  }

  const accountCode = getTrimmedString(body.accountCode);
  const planId = getTrimmedString(body.planId);

  const unitNumber = normalizeUnitNumber(
    getTrimmedString(body.unitNumber)
  );

  const firstName = normalizeName(
    getTrimmedString(body.firstName)
  );

  const lastName = normalizeName(
    getTrimmedString(body.lastName)
  );

  const phone = normalizePhone(
    getTrimmedString(body.phone)
  );

  if (!accountCode) {
    return NextResponse.json(
      {
        error: "Account code is required.",
        field: "accountCode",
      },
      {
        status: 400,
      }
    );
  }

  if (!planId) {
    return NextResponse.json(
      {
        error: "Select a payment option.",
        field: "planId",
      },
      {
        status: 400,
      }
    );
  }

  if (!unitNumber) {
    return NextResponse.json(
      {
        error: "Unit or space number is required.",
        field: "unitNumber",
      },
      {
        status: 400,
      }
    );
  }

  if (!firstName) {
    return NextResponse.json(
      {
        error: "First name is required.",
        field: "firstName",
      },
      {
        status: 400,
      }
    );
  }

  if (!lastName) {
    return NextResponse.json(
      {
        error: "Last name is required.",
        field: "lastName",
      },
      {
        status: 400,
      }
    );
  }

  if (!isValidPhone(phone)) {
    return NextResponse.json(
      {
        error:
          "Enter a valid 10-digit mobile phone number.",
        field: "phone",
      },
      {
        status: 400,
      }
    );
  }

  if (!isPaymentMethod(body.paymentMethod)) {
    return NextResponse.json(
      {
        error: "Select a valid payment method.",
        field: "paymentMethod",
      },
      {
        status: 400,
      }
    );
  }

  const business =
    await getPublicCheckoutBusiness(accountCode);

  if (
    !business ||
    !isRecurringCheckoutBusiness(business)
  ) {
    return NextResponse.json(
      {
        error: "Payment account not found.",
      },
      {
        status: 404,
      }
    );
  }

  if (!business.stripeConnection?.readyForLive) {
    return NextResponse.json(
      {
        error:
          "This business is not currently ready to accept payments.",
      },
      {
        status: 409,
      }
    );
  }

if (!business.accountCode) {
  return NextResponse.json(
    {
      error: "This business does not have a valid account code.",
    },
    {
      status: 409,
    }
  );
}

  const plan = business.recurringPlans.find(
    (candidate) => candidate.id === planId
  );

  if (!plan) {
    return NextResponse.json(
      {
        error: "Payment option not found.",
      },
      {
        status: 404,
      }
    );
  }

  const pricingPlan: CheckoutPricingPlan = {
    id: plan.id,
    name: plan.name,
    baseAmountCents: plan.baseAmountCents,
    dueDay: plan.dueDay,
    gracePeriodDays: plan.gracePeriodDays,
    initialLateFeeCents: plan.initialLateFeeCents,
    dailyLateFeeCents: plan.dailyLateFeeCents,
    dailyLateFeeMaxDays: plan.dailyLateFeeMaxDays,
    charges: plan.charges.map((charge) => ({
      id: charge.id,
      label: charge.label,
      amountCents: charge.amountCents,
      effectiveBillingCycle:
        charge.effectiveBillingCycle,
      endsAfterBillingCycle:
        charge.endsAfterBillingCycle,
    })),
  };

  const pricing = calculateCheckoutPricing({
    plan: pricingPlan,
    paymentMethod: body.paymentMethod,
  });

  const expiresAt = new Date(
    Date.now() + 30 * 60 * 1000
  );

  const checkoutSession =
    await prisma.checkoutSession.create({
      data: {
        businessId: business.id,
        accountCode: business.accountCode,
        planId: plan.id,

        billingCycle: pricing.billingCycle,
        unitNumber,
        firstName,
        lastName,
        phone,

        paymentMethod: body.paymentMethod,

        baseAmountCents:
          pricing.baseAmountCents,
        recurringChargesCents:
          pricing.recurringChargesCents,
        initialLateFeeCents:
          pricing.initialLateFeeCents,
        dailyLateFeesCents:
          pricing.dailyLateFeesCents,
        subtotalCents:
          pricing.subtotalCents,
        platformFeeCents:
          pricing.platformFeeCents,
        totalCents:
          pricing.totalChargedCents,

        lineItems: pricing.lineItems,

        dueDate: pricing.dueDate,
        graceEndsAt: pricing.graceEndsAt,

        status: CheckoutSessionStatus.CREATED,
        expiresAt,
      },
      select: {
        id: true,
        accountCode: true,
        status: true,
        expiresAt: true,
      },
    });

  return NextResponse.json(
    {
      checkoutSession: {
        id: checkoutSession.id,
        accountCode:
          checkoutSession.accountCode,
        status: checkoutSession.status,
        expiresAt:
          checkoutSession.expiresAt.toISOString(),
      },
      reviewUrl: `/${encodeURIComponent(
        checkoutSession.accountCode
      )}/review?session=${encodeURIComponent(
        checkoutSession.id
      )}`,
    },
    {
      status: 201,
    }
  );
}