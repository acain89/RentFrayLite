import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const indexes = await prisma.$queryRaw<
    Array<{
      indexname: string;
      indexdef: string;
    }>
  >`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'Payment'
    ORDER BY indexname
  `;

  console.table(indexes);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });