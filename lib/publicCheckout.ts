import {
  BusinessStatus,
  OneTimeChargeStatus,
  SetupStep,
} from "@prisma/client";
import {
  ACCOUNT_CODE_PATTERN,
  normalizeAccountCode,
} from "@/lib/accountCode";
import { prisma } from "@/lib/prisma";


export async function getPublicCheckoutBusiness(
  rawAccountCode: string,
  normalizedUnitNumber?: string
) {
  const accountCode = normalizeAccountCode(
    decodeURIComponent(rawAccountCode)
  );

  if (!ACCOUNT_CODE_PATTERN.test(accountCode)) {
    return null;
  }

  const business = await prisma.business.findUnique({
    where: {
      accountCode,
    },
    select: {
      id: true,
      name: true,
      accountCode: true,
      status: true,
      setupStep: true,
      setupCompletedAt: true,
      isActive: true,

      stripeConnection: {
        select: {
          readyForLive: true,
          chargesEnabled: true,
          payoutsEnabled: true,
        },
      },

       oneTimeCharges: {
  where: {
   status: OneTimeChargeStatus.PENDING,
    ...(normalizedUnitNumber
      ? {
          normalizedUnitNumber,
        }
      : {}),
  },
  orderBy: {
    createdAt: "asc",
  },
  select: {
    id: true,
    label: true,
    amountCents: true,
  },
},

      recurringPlans: {
        where: {
          isActive: true,
        },
        orderBy: {
          sortOrder: "asc",
        },
        select: {
          id: true,
          name: true,
          baseAmountCents: true,
          dueDay: true,
          gracePeriodDays: true,
          initialLateFeeCents: true,
          dailyLateFeeCents: true,
          dailyLateFeeMaxDays: true,

          charges: {
            where: {
              isActive: true,
            },
            orderBy: {
              sortOrder: "asc",
            },
            select: {
              id: true,
              label: true,
              amountCents: true,
              effectiveBillingCycle: true,
              endsAfterBillingCycle: true,
            },
          },
        },
      },
    },
  });

  if (
    !business ||
    !business.isActive ||
    business.status !== BusinessStatus.ACTIVE ||
    business.setupStep !== SetupStep.COMPLETE ||
    !business.setupCompletedAt
  ) {
    return null;
  }

  return business;
}

export function isRecurringCheckoutBusiness(
  business: NonNullable<
    Awaited<ReturnType<typeof getPublicCheckoutBusiness>>
  >
): boolean {
  return Boolean(business);
}