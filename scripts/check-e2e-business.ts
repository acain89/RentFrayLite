import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.findUnique({
    where: {
      accountCode: "AC-1234",
    },
    include: {
      recurringPlans: {
        include: {
          charges: true,
        },
      },
    },
  });

  if (!business) {
    console.log("Business not found.");
    return;
  }

  console.dir(
    {
      name: business.name,
      accountCode: business.accountCode,
      plans: business.recurringPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        baseAmountCents: plan.baseAmountCents,
        dueDay: plan.dueDay,
        charges: plan.charges.map((charge) => ({
          label: charge.label,
          amountCents: charge.amountCents,
        })),
      })),
    },
    { depth: null }
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
