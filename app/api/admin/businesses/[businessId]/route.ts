import { BusinessStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ businessId: string }> };

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (!auth.session?.adminAccess) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = auth.session.adminAccess;
  const sessionId = auth.session.id;
  const { businessId } = await context.params;
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AdminAccess" WHERE "id" = ${admin.id} FOR UPDATE`);
    if (!(await tx.adminAccess.findUnique({ where: { id: admin.id } }))?.isActive) return "unauthorized";
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Session" WHERE "id" = ${sessionId} FOR UPDATE`);
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session || session.adminAccessId !== admin.id || session.expiresAt <= new Date()) return "unauthorized";
    // Checkout creation/reservation takes the same Business lock first.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR NO KEY UPDATE`);
    const business = await tx.business.findUnique({ where: { id: businessId } });
    if (!business) return "missing";
    // A local status never proves an external payment cannot settle.
    const payment = await tx.payment.findFirst({ where: { businessId } });
    const checkout = await tx.checkoutSession.findFirst({ where: { businessId } });
    const action = payment || checkout ? "deactivated" : "deleted";
    if (action === "deactivated") {
      await tx.business.update({ where: { id: businessId }, data: { status: BusinessStatus.DISABLED, isActive: false } });
      await tx.session.deleteMany({ where: { businessId } });
    } else {
      // Existing audits survive through their SetNull relation.
      await tx.business.delete({ where: { id: businessId } });
    }
    await tx.auditLog.create({ data: {
      actorType: "ADMIN", actorId: admin.id, businessId: action === "deactivated" ? businessId : null,
      action: action === "deactivated" ? "BUSINESS_DEACTIVATED" : "BUSINESS_DELETED",
      targetType: "Business", targetId: businessId,
      summary: `${business.name} (${business.accountCode ?? "No account code"}) ${action}`,
    } });
    return action;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000 });
  if (result === "unauthorized") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (result === "missing") return NextResponse.json({ error: "Business not found." }, { status: 404 });
  return NextResponse.json({ success: true, action: result, message: result === "deactivated"
    ? "Business deactivated. Financial history is retained; existing Stripe payments can still settle."
    : "Business deleted. Existing audit history is retained." });
}
