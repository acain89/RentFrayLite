import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { requireStrongAdminCredential } from "../lib/adminCredential";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminCode = requireStrongAdminCredential(process.env.SEED_ADMIN_CODE);

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