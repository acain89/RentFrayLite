// lib/propertyCode.ts

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function randomFourDigitCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function randomFiveDigitCode() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * Supports both:
 * - global prisma
 * - transaction client (tx)
 */
type PrismaClientLike =
  | typeof prisma
  | Prisma.TransactionClient;

export async function generateUniquePropertyCode(
  db: PrismaClientLike,
  maxAttempts = 200
): Promise<string> {
  // Step 1: try 4-digit codes
  for (let i = 0; i < maxAttempts; i++) {
    const code = randomFourDigitCode();

    const existing = await db.property.findFirst({
      where: { propertyCode: code },
      select: { id: true },
    });

    if (!existing) {
      return code;
    }
  }

  // Step 2: fallback to 5-digit
  for (let i = 0; i < 500; i++) {
    const code = randomFiveDigitCode();

    const existing = await db.property.findFirst({
      where: { propertyCode: code },
      select: { id: true },
    });

    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to generate unique property code");
}