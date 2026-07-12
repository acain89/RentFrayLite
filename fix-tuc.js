const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const property = await prisma.property.findFirst();

  if (!property) {
    console.log("No property found");
    return;
  }

  const updated = await prisma.property.update({
    where: { id: property.id },
    data: { unitCount: 76 },
  });

  console.log("Updated:", updated);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });