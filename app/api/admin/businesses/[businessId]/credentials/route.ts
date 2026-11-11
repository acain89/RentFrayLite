import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { isNewManagementPassword, MANAGEMENT_PASSWORD_REQUIREMENT } from "@/lib/managementCredential";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { withAdminMutation, AdminMutationUnauthorized } from "@/lib/adminMutation";

type RouteContext = {
  params: Promise<{
    businessId: string;
  }>;
};

type CredentialPayload = {
  email?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try { return await updateCredentials(request, context); }
  catch (error) {
    if (error instanceof AdminMutationUnauthorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    throw error;
  }
}

async function updateCredentials(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApi();

  if (auth.response) {
    return auth.response;
  }

  if (!auth.session?.adminAccess) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try{requireCredentialOrigin(request);}catch{return NextResponse.json({error:"Invalid request origin."},{status:403});}
  const adminAccess = auth.session.adminAccess;
  const { businessId } = await context.params;
  let body: CredentialPayload;
  try { body = await publicJson(request, 4096) as CredentialPayload; } catch (error) { return publicJsonFailure(error); }

  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  const confirmPassword =
    typeof body.confirmPassword === "string"
      ? body.confirmPassword
      : "";

  if (!email && !password) {
    return NextResponse.json(
      { error: "Enter a new email or password." },
      { status: 400 }
    );
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if(password&&!isNewManagementPassword(password))return NextResponse.json({error:MANAGEMENT_PASSWORD_REQUIREMENT},{status:400});

  if (password && password !== confirmPassword) {
    return NextResponse.json(
      { error: "The new passwords do not match." },
      { status: 400 }
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { manager: true },
  });

  if (!business?.manager) {
    return NextResponse.json(
      { error: "Manager account not found." },
      { status: 404 }
    );
  }

  const managerId = business.manager.id;
  if (email && email !== business.manager.email) {
    const duplicate = await prisma.manager.findUnique({
      where: { email },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== managerId) {
      return NextResponse.json(
        { error: "That email is already used by another manager." },
        { status: 409 }
      );
    }
  }

  const passwordHash = password
    ? await bcrypt.hash(password, 12)
    : undefined;

  const updated = await withAdminMutation(auth.session, businessId, async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Manager" WHERE "id" = ${managerId} FOR NO KEY UPDATE`);
    const manager = await tx.manager.findUnique({ where: { id: managerId } });
    if (!manager || manager.businessId !== businessId) return false;
    await tx.manager.update({
      where: { id: managerId },
      data: {
        ...(email ? { email } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
    await tx.verificationToken.updateMany({where:{businessId,type:"PASSWORD_RESET",usedAt:null},data:{usedAt:new Date()}});
    await tx.session.deleteMany({ where: { managerId: managerId } });
    await tx.auditLog.create({
      data: {
        businessId,
        actorType: "ADMIN",
        actorId: adminAccess.id,
        action: "MANAGER_CREDENTIALS_UPDATED",
        targetType: "Manager",
        targetId: managerId,
        summary: [
          email ? "Manager email changed" : null,
          password ? "Manager password reset" : null,
        ]
          .filter(Boolean)
          .join("; "),
      },
    });
    return true;
  });
  if (!updated) return NextResponse.json({ error: "Manager account not found." }, { status: 404 });

  return NextResponse.json({
    success: true,
    email: email || business.manager.email,
  });
}
