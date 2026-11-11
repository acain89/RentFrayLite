import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const duplicates = await prisma.$queryRaw<
    Array<{
      businessId: string;
      sourceId: string;
      billingCycle: string;
      referenceLabel: string;
      duplicateCount: bigint;
    }>
  >`
    SELECT
      "businessId",
      "sourceId",
      "billingCycle",
      "referenceLabel",
      COUNT(*) AS "duplicateCount"
    FROM "Payment"
    WHERE
      "sourceType" = 'RECURRING_PLAN'
      AND "sourceId" IS NOT NULL
      AND "billingCycle" IS NOT NULL
      AND "referenceLabel" IS NOT NULL
      AND "status" IN (
        'CREATED',
        'CHECKOUT_STARTED',
        'PENDING',
        'PAID',
        'DISPUTED'
      )
    GROUP BY
      "businessId",
      "sourceId",
      "billingCycle",
      "referenceLabel"
    HAVING COUNT(*) > 1
  `;

  console.table(
    duplicates.map((row) => ({
      ...row,
      duplicateCount: Number(row.duplicateCount),
    }))
  );

  if (duplicates.length > 0) {
    console.error(
      `FAIL: Found ${duplicates.length} duplicate recurring-payment obligation(s).`
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "PASS: No duplicate active recurring-payment obligations found."
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });