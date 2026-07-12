const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

async function run() {
  await db.property.updateMany({
    data: { stripeAccountId: null },
  });

  console.log('Cleared stripeAccountId');
}

run()
  .catch(console.error)
  .finally(() => db.$disconnect());