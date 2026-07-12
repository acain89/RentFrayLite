// scripts/debug-prisma.ts

import { prisma } from "../lib/prisma";

async function main() {
  const unit = await prisma.unit.findFirst({
    include: {
      property: {
        include: {
          settings: true,
        },
      },
    },
  });

  console.log("=== UNIT WITH PROPERTY SETTINGS ===");
  console.dir(unit, { depth: 6 });

  const ledgerEntry = await prisma.ledgerEntry.findFirst();

  console.log("=== FIRST LEDGER ENTRY ===");
  console.dir(ledgerEntry, { depth: 6 });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });