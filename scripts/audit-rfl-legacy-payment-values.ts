import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const refundedPayments =
    await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Payment"
      WHERE "status"::text = 'REFUNDED'
    `;

  const catalogPayments =
    await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Payment"
      WHERE "sourceType"::text = 'CATALOG_ITEM'
    `;

  const customPayments =
    await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Payment"
      WHERE "sourceType"::text = 'CUSTOM_POSTING'
    `;

  const refundedCount =
    Number(refundedPayments[0]?.count ?? 0);

  const catalogCount =
    Number(catalogPayments[0]?.count ?? 0);

  const customCount =
    Number(customPayments[0]?.count ?? 0);

  console.table({
    REFUNDED: refundedCount,
    CATALOG_ITEM: catalogCount,
    CUSTOM_POSTING: customCount,
  });

  if (
    refundedCount > 0 ||
    catalogCount > 0 ||
    customCount > 0
  ) {
    throw new Error(
      "Legacy payment values still exist in the database."
    );
  }

  console.log(
    "PASS: No legacy refund, product/service, or custom payment rows found."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });