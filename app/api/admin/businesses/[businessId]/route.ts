import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { BusinessStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { withAdminMutation, AdminMutationUnauthorized } from "@/lib/adminMutation";

type RouteContext = { params: Promise<{ businessId: string }> };

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  if (request.body) return NextResponse.json({ error: "This action does not accept a request body." }, { status: 400 });

  try { return await deleteBusiness(context); }
  catch (error) {
    if (error instanceof AdminMutationUnauthorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    throw error;
  }
}

async function deleteBusiness(context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (!auth.session?.adminAccess) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = auth.session.adminAccess;
  const { businessId } = await context.params;
  const result = await withAdminMutation(auth.session, businessId, async tx => {
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
  });
  if (result === "missing") return NextResponse.json({ error: "Business not found." }, { status: 404 });
  return NextResponse.json({ success: true, action: result, message: result === "deactivated"
    ? "Business deactivated. Financial history is retained; existing Stripe payments can still settle."
    : "Business deleted. Existing audit history is retained." });
}
