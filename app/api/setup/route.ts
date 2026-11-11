import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { publicRequestGuard } from "@/lib/publicRequestBudget";
import { smsPhone, SMS_CONSENT_VERSION } from "@/lib/smsConsent";
import { SetupStep } from "@prisma/client";
import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createManagerSession } from "@/lib/session";
import { setupAccountSchema } from "@/lib/validators";
import { getNewBusinessCalendar } from "@/lib/managementBillingSetup";

export async function POST(request: Request) {
  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }

  let body: unknown;

  try {
    body = await publicJson(request, 4096);
  } catch (error) {
    return publicJsonFailure(error);
  }

  const parsed = setupAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Enter valid account information.",
      },
      { status: 400 }
    );
  }

  if (parsed.data.smsConsent && !smsPhone(parsed.data.contactPhone)) return NextResponse.json({error:"SMS consent requires a valid U.S. phone number."},{status:400});

  const denied = await publicRequestGuard(prisma, "SIGNUP", parsed.data.managerEmail);
  if (denied) return denied;

  const existingManager = await prisma.manager.findUnique({
    where: {
      email: parsed.data.managerEmail,
    },
    select: {
      id: true,
    },
  });

  if (existingManager) {
    return NextResponse.json(
      {
        error: "Unable to create this account. Review your details or sign in.",
      },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(
    parsed.data.password
  );

  const result = await prisma.$transaction(async (tx) => {
    const createdBusiness = await tx.business.create({
      data: {
        name: parsed.data.businessName,
        ownerName: parsed.data.ownerName,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        paymentSmsEnabled: true,
        smsConsentAt: parsed.data.smsConsent ? new Date() : null,
        smsConsentVersion: parsed.data.smsConsent ? SMS_CONSENT_VERSION : null,
        smsConsentPhone: parsed.data.smsConsent ? smsPhone(parsed.data.contactPhone) : null,

        setupStep:
          SetupStep.CONFIGURE_RECURRING_TIERS,
      },
    });

    // Derive from the original database timestamp, never the browser or setup completion.
    // Both writes share the creation transaction; existing accounts are never updated here.
    const business = await tx.business.update({
      where: { id: createdBusiness.id },
      data: getNewBusinessCalendar(createdBusiness.createdAt, parsed.data.propertyTimeZone),
    });

    const manager = await tx.manager.create({
      data: {
        businessId: business.id,
        email: parsed.data.managerEmail,
        passwordHash,
        displayName: parsed.data.ownerName,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorType: "MANAGER",
        actorId: manager.id,
        action: "BUSINESS_CREATED",
        targetType: "BUSINESS",
        targetId: business.id,
        summary:
            "RentFrayLite business account created.",
          metadata: {
            acceptedTerms: true,
            termsVersion: "1.0",
            privacyVersion: "1.0",
            acceptedAt: new Date().toISOString(),
          },
      },
    });

    return {
      business,
      manager,
    };
  });

  await createManagerSession({
    managerId: result.manager.id,
    businessId: result.business.id,
    passwordHash: result.manager.passwordHash,
    email: result.manager.email,
  });

  return NextResponse.json(
    {
      created: true,
      redirectTo: "/setup/recurring/tiers",
    },
    { status: 201 }
  );
}
