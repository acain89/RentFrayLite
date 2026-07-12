// app/tenant/layout.tsx

import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function TenantLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== "TENANT" || !session.propertyId) {
    redirect("/tenant");
  }

  const property = await prisma.property.findUnique({
    where: { id: session.propertyId },
    select: {
      id: true,
      status: true,
      isActive: true,
    },
  });

  if (!property || !property.isActive) {
    redirect("/tenant");
  }

  return <>{children}</>;
}