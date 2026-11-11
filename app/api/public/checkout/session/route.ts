import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { publicRequestGuard } from "@/lib/publicRequestBudget";
import { checkoutSmsConsent } from "@/lib/smsConsent";
import { CheckoutConsentInvalid, grantCheckoutConsentAccess, retainedCheckoutConsent } from "@/lib/checkoutConsent";
import {
  CheckoutSessionStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lockActiveCheckoutBusiness } from "@/lib/checkoutBusinessLock";
import { prepareVersionedCheckoutQuote, publicQuoteArchitecture } from "@/lib/versionedCheckoutQuote";
import { parseCustomPaymentAmount, quoteCustomPayment } from "@/lib/customPayment";
import { CheckoutCalendarError, getCheckoutCalendar, loadCurrentCheckoutPlan, quoteStandardCheckout } from "@/lib/checkoutCalendar";
import {
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
  smsConsent?: unknown;
  previousCheckoutSessionId?: unknown;
  paymentMethod?: unknown;
  sourceType?: unknown;
  amount?: unknown;
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
  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }

  try { return await createSession(request); }
  catch (error) {
    if (error instanceof CheckoutConsentInvalid) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}

async function createSession(request: Request) {
  let body: CreateCheckoutSessionRequest;

  try {
    body =
      (await publicJson(request, 4096)) as CreateCheckoutSessionRequest;
  } catch (error) {
    return publicJsonFailure(error);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const previousCheckoutSessionId = getTrimmedString(body.previousCheckoutSessionId);
  if (body.previousCheckoutSessionId !== undefined && (!previousCheckoutSessionId || previousCheckoutSessionId.length > 128 || body.smsConsent !== undefined)) {
    return NextResponse.json({ error: "Invalid checkout consent transfer." }, { status: 400 });
  }
  const sourceType = body.sourceType === undefined ? "RECURRING_PLAN" : body.sourceType;
  if (sourceType !== "RECURRING_PLAN" && sourceType !== "CUSTOM_PAYMENT") return NextResponse.json({ error: "Select a valid payment type." }, { status: 400 });
  let customAmountCents: number | null = null;
  if (sourceType === "CUSTOM_PAYMENT") {
    const allowed = new Set(["sourceType", "accountCode", "amount", "unitNumber", "firstName", "lastName", "phone", "paymentMethod", "smsConsent", "previousCheckoutSessionId"]);
    if (Object.keys(body).some(key => !allowed.has(key))) return NextResponse.json({ error: "Custom Payments cannot include tier, calendar, fee or total fields." }, { status: 400 });
    try { customAmountCents = parseCustomPaymentAmount(body.amount); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Custom Payment amount.", field: "amount" }, { status: 400 }); }
  } else if (body.amount !== undefined) return NextResponse.json({ error: "Standard tier amounts cannot be edited." }, { status: 400 });

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

  let consent;
  try { consent = checkoutSmsConsent(body.smsConsent); } catch { return NextResponse.json({error:"Invalid SMS consent."},{status:400}); }
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

  if (sourceType === "RECURRING_PLAN" && !planId) {
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

  const denied = await publicRequestGuard(prisma, "SESSION", JSON.stringify([accountCode.toLowerCase(), phone]));
  if (denied) return denied;

const business =
  await getPublicCheckoutBusiness(
    accountCode,
    sourceType,
  );

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

  if (sourceType === "CUSTOM_PAYMENT") {
    const paymentMethod = body.paymentMethod;
    const { pricing, architecture } = prepareVersionedCheckoutQuote({
      ...publicQuoteArchitecture(business.stripeConnection!.stripeAccountId),
      quote: () => quoteCustomPayment(customAmountCents!, paymentMethod),
    });
    const code = business.accountCode;
    const checkout = await prisma.$transaction(async tx => {
      const current = await lockActiveCheckoutBusiness(tx, business.id);
      if (!current || current.status !== "ACTIVE" || current.accountCode !== code) return null;
      const savedConsent = previousCheckoutSessionId ? await retainedCheckoutConsent(tx, previousCheckoutSessionId, {
        businessId: business.id, accountCode: code, sourceType, planId: null, billingCycle: null,
        unitNumber, firstName, lastName, phone, subtotalCents: pricing.subtotalCents,
      }) : consent;
      return tx.checkoutSession.create({ data: {
        ...architecture,
        businessId: business.id, accountCode: code, sourceType: "CUSTOM_PAYMENT", planId: null, billingCycle: null,
        dueDate: null, graceEndsAt: null, unitNumber, firstName, lastName, phone, ...savedConsent, paymentMethod, ...pricing,
        status: CheckoutSessionStatus.CREATED, expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }, select: { id: true, accountCode: true, status: true, expiresAt: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
    if (!checkout) return NextResponse.json({ error: "This business is no longer accepting payments." }, { status: 409 });
    await grantCheckoutConsentAccess(checkout.id);
    return NextResponse.json({ checkoutSession: checkout, reviewUrl: `/${encodeURIComponent(code)}/review?session=${encodeURIComponent(checkout.id)}` }, { status: 201 });
  }

  const plan = business.recurringPlans.find(
    (candidate) => candidate.isActive && candidate.id === planId
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

  const expiresAt = new Date(
    Date.now() + 30 * 60 * 1000
  );

  const validatedAccountCode = business.accountCode;
  const paymentMethod = body.paymentMethod;
  let checkoutSession;
  try {
    checkoutSession = await prisma.$transaction(async tx => {
      const lockedBusiness = await lockActiveCheckoutBusiness(tx, business.id);
      if (!lockedBusiness) return null;
      const calendar = getCheckoutCalendar(lockedBusiness, new Date());
      const currentPlan = calendar.kind === "LOCAL"
        ? await loadCurrentCheckoutPlan(tx, business.id, plan.id) : pricingPlan;
      const { pricing, architecture } = prepareVersionedCheckoutQuote({
        ...publicQuoteArchitecture(business.stripeConnection!.stripeAccountId),
        quote: () => quoteStandardCheckout(lockedBusiness, currentPlan, paymentMethod, new Date()),
      });
      const savedConsent = previousCheckoutSessionId ? await retainedCheckoutConsent(tx, previousCheckoutSessionId, {
        businessId: business.id, accountCode: validatedAccountCode, sourceType: "RECURRING_PLAN", planId: plan.id, billingCycle: pricing.billingCycle,
        unitNumber, firstName, lastName, phone, subtotalCents: pricing.subtotalCents,
      }) : consent;
    return tx.checkoutSession.create({
      data: {
        ...architecture,
        businessId: business.id,
        sourceType: "RECURRING_PLAN",
        accountCode: validatedAccountCode,
        planId: plan.id,

        billingCycle: pricing.billingCycle,
        unitNumber,
        firstName,
        lastName,
        phone,
        ...savedConsent,

        paymentMethod,

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
    // Large itemized snapshots remain authoritative even when Stripe transport
    // is compact. Match checkout-start's bounded transaction budget for JSON.
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
  } catch (error) {
    if (error instanceof CheckoutCalendarError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    throw error;
  }

  if (!checkoutSession) return NextResponse.json({ error: "This business is no longer accepting payments." }, { status: 409 });
  await grantCheckoutConsentAccess(checkoutSession.id);

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
