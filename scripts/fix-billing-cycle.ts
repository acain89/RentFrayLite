// scripts/fix-billing-cycle.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const payments = await prisma.payment.findMany({
    where: {
      billingCycle: null,
      status: "PAID",
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  for (const payment of payments) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        billingCycle: payment.createdAt.toISOString().slice(0, 7),
      },
    });
  }

  console.log(`Updated ${payments.length} payments`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });