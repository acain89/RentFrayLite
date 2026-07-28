import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const managerEmail =
    process.env.SEED_MANAGER_EMAIL ?? "manager@rentfraylite.local";

  const managerPassword =
    process.env.SEED_MANAGER_PASSWORD ?? "ChangeMe123!";

  const adminCode =
    process.env.SEED_ADMIN_CODE ?? "893889";

  const managerPasswordHash = await bcrypt.hash(managerPassword, 12);
  const adminCodeHash = await bcrypt.hash(adminCode, 12);

  const business = await prisma.business.upsert({
    where: {
      accountCode: "RF-0001",
    },
    update: {},
    create: {
      name: "RentFrayLite Demo Business",
      accountCode: "RF-0001",
      accountCodeLockedAt: new Date(),
      ownerName: "Demo Owner",
      contactEmail: managerEmail,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.manager.upsert({
    where: {
      email: managerEmail,
    },
    update: {
      businessId: business.id,
      passwordHash: managerPasswordHash,
      displayName: "Demo Manager",
      isActive: true,
    },
    create: {
      businessId: business.id,
      email: managerEmail,
      passwordHash: managerPasswordHash,
      displayName: "Demo Manager",
    },
  });

  await prisma.adminAccess.deleteMany();

  await prisma.adminAccess.create({
    data: {
      codeHash: adminCodeHash,
    },
  });

  console.log("RentFrayLite authentication seed complete.");
  console.log(`Manager email: ${managerEmail}`);
  console.log(`Manager password: ${managerPassword}`);
  console.log(`Admin code: ${adminCode}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
