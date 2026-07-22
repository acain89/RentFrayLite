import { PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  calculateCheckoutPricing,
  type CheckoutPricingPlan,
} from "@/lib/checkoutPricing";
import {
  getPublicCheckoutBusiness,
  isRecurringCheckoutBusiness,
} from "@/lib/publicCheckout";

type PreviewRequestBody = {
  accountCode?: unknown;
  planId?: unknown;
  paymentMethod?: unknown;
};

function isPaymentMethod(
  value: unknown
): value is PaymentMethod {
  return value === PaymentMethod.ACH ||
    value === PaymentMethod.CARD;
}

export async function POST(request: Request) {
  let body: PreviewRequestBody;

  try {
    body = (await request.json()) as PreviewRequestBody;
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

  const accountCode =
    typeof body.accountCode === "string"
      ? body.accountCode.trim()
      : "";

  const planId =
    typeof body.planId === "string"
      ? body.planId.trim()
      : "";

  if (!accountCode || !planId) {
    return NextResponse.json(
      {
        error: "Account code and payment option are required.",
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

  return NextResponse.json({
    business: {
      id: business.id,
      name: business.name,
      accountCode: business.accountCode,
    },
    plan: {
      id: plan.id,
      name: plan.name,
    },
    paymentMethod: body.paymentMethod,
    pricing: {
      billingCycle: pricing.billingCycle,
      dueDate: pricing.dueDate.toISOString(),
      graceEndsAt: pricing.graceEndsAt.toISOString(),
      daysLateAfterGrace:
        pricing.daysLateAfterGrace,
      dailyLateFeeDays:
        pricing.dailyLateFeeDays,
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
      totalChargedCents:
        pricing.totalChargedCents,
      lineItems: pricing.lineItems,
    },
  });
}