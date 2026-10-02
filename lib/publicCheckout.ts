import { getBusinessPaymentReadiness, readinessBusinessInclude } from "@/lib/businessPaymentReadiness";
import {
  ACCOUNT_CODE_PATTERN,
  normalizeAccountCode,
} from "@/lib/accountCode";
import { prisma } from "@/lib/prisma";

export async function getPublicCheckoutBusiness(
  rawAccountCode: string
) {
  let input: string;
  try { input = decodeURIComponent(rawAccountCode).trim().toUpperCase(); } catch { return null; }
  if (!/^[A-Z]{2}-?\d{4}$/.test(input)) return null;
  const accountCode = normalizeAccountCode(input);

  if (!ACCOUNT_CODE_PATTERN.test(accountCode)) {
    return null;
  }

  const business = await prisma.business.findUnique({
    where: {
      accountCode,
    },
    include: readinessBusinessInclude,
  });

  if (!business || !(await getBusinessPaymentReadiness(business)).ready) return null;
  return business;
}

export function isRecurringCheckoutBusiness(
  business: NonNullable<
    Awaited<ReturnType<typeof getPublicCheckoutBusiness>>
  >
): boolean {
  return Boolean(business);
}