import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const ACCOUNT_CODE_PATTERN = /^[A-Z]{2}-\d{4}$/;

export function normalizeAccountCode(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (cleaned.length <= 2) {
    return cleaned;
  }

  return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}`;
}

function randomLetters(): string {
  return String.fromCharCode(
    randomInt(65, 91),
    randomInt(65, 91)
  );
}

function randomDigits(): string {
  return randomInt(0, 10000).toString().padStart(4, "0");
}

export async function generateAvailableAccountCode(): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const accountCode = `${randomLetters()}-${randomDigits()}`;

    const existing = await prisma.business.findUnique({
      where: {
        accountCode,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return accountCode;
    }
  }

  throw new Error("Unable to generate an available account code.");
}
