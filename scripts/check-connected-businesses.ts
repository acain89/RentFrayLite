import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const businesses = await prisma.business.findMany({
    where: {
      setupCompletedAt: { not: null },
      isActive: true,
      stripeConnection: {
        is: {
          readyForLive: true,
        },
      },
    },
    select: {
      name: true,
      accountCode: true,
      contactEmail: true,
      createdAt: true,
      stripeConnection: {
        select: {
          stripeAccountId: true,
          readyForLive: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  console.table(
    businesses.map((business) => ({
      name: business.name,
      accountCode: business.accountCode,
      email: business.contactEmail,
      createdAt: business.createdAt.toLocaleString(),
      stripeAccountId: business.stripeConnection?.stripeAccountId,
      readyForLive: business.stripeConnection?.readyForLive,
    }))
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
