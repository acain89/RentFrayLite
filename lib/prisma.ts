import { PrismaClient } from "@prisma/client";
import { logOperationalError } from "@/lib/operationalLogging";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const client = new PrismaClient({ log: [{ emit: "event", level: "error" }] });
  // Prisma error messages can include query arguments. Never forward the event.
  client.$on("error", () => logOperationalError("database_failed"));
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
