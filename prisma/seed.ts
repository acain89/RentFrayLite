import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminCode = process.env.SEED_ADMIN_CODE?.trim();

  if (!adminCode) {
    throw new Error(
      "SEED_ADMIN_CODE is required. Refusing to seed production without an explicit admin code."
    );
  }

  if (!/^\d{6}$/.test(adminCode)) {
    throw new Error("SEED_ADMIN_CODE must be exactly six digits.");
  }

  const adminCodeHash = await bcrypt.hash(adminCode, 12);

  await prisma.$transaction([
    prisma.adminAccess.deleteMany(),
    prisma.adminAccess.create({
      data: {
        codeHash: adminCodeHash,
      },
    }),
  ]);

  console.log("RentFrayLite production admin access created.");
}

main()
  .catch((error: unknown) => {
    console.error("Production seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });