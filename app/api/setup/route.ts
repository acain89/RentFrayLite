import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { getBusinessDate } from "@/lib/rentDates";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type BillingFrequency = "MONTHLY";
type LateFeeType = "FLAT" | "PERCENT";

type SetupTierInput = {
  name?: string;
  price: number;
  unitCount: number;
  billingFrequency: BillingFrequency;
  dueDay: number | null;
  gracePeriodDays: number;
  lateFeeType: LateFeeType;
  lateFeeInitial: number;
  lateFeeDaily: number;
  maxLateFeeDays: number;
};

type SetupPayload = {
  account?: {
    email?: string;
    username?: string;
    password?: string;
  };
  property?: {
    name?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zip?: string;
    businessType?: string;
  };
  tiers?: SetupTierInput[];
};

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function toMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashPasswordForNow(password: string): string {
  return `plain:${password}`;
}

function normalizePropertyType(value: string): string {
  const normalized = clean(value);

  switch (normalized) {
    case "Apartment":
      return "Apartment";
    case "Mobile Home Park":
      return "Mobile Home Park";
    case "RV Park":
      return "RV Park";
    case "Storage Units":
      return "Storage Units";
    case "BHPH Car Lot":
      return "BHPH Car Lot";
    case "Other":
      return "Other";
    default:
      return "Other";
  }
}

async function generateUniquePropertyCode(
  tx: Prisma.TransactionClient
): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await tx.property.findFirst({
      where: { propertyCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error("Could not generate a unique property code.");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SetupPayload;

    const email = clean(body?.account?.email).toLowerCase();
    const username = clean(body?.account?.username).toLowerCase() || email;
    const password = clean(body?.account?.password);

    const propertyName = clean(body?.property?.name);
    const addressLine1 = clean(body?.property?.addressLine1);
    const addressLine2 = clean(body?.property?.addressLine2);
    const city = clean(body?.property?.city);
    const state = clean(body?.property?.state).toUpperCase().slice(0, 2);
    const zip = onlyDigits(body?.property?.zip).slice(0, 5);
    const propertyType = normalizePropertyType(
      body?.property?.businessType ?? ""
    );

    const tiers = Array.isArray(body?.tiers) ? body.tiers : [];

    const totalUnitCount = tiers.reduce(
      (sum: number, tier: SetupTierInput) => sum + toInt(tier.unitCount),
      0
    );

    if (!isEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Valid email is required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (
      !propertyName ||
      !addressLine1 ||
      !city ||
      state.length < 2 ||
      zip.length < 5
    ) {
      return NextResponse.json(
        { ok: false, error: "Complete property information is required." },
        { status: 400 }
      );
    }

    if (!tiers.length) {
      return NextResponse.json(
        { ok: false, error: "At least one tier is required." },
        { status: 400 }
      );
    }

    if (totalUnitCount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Total unit count must be greater than 0." },
        { status: 400 }
      );
    }

    for (const tier of tiers) {
      if (toMoney(tier.price) <= 0 || toInt(tier.unitCount) <= 0) {
        return NextResponse.json(
          { ok: false, error: "Each tier needs a valid price and unit count." },
          { status: 400 }
        );
      }

      if (toInt(tier.dueDay, 0) < 1 || toInt(tier.dueDay, 0) > 31) {
        return NextResponse.json(
          { ok: false, error: "Monthly tiers need a due day from 1 to 31." },
          { status: 400 }
        );
      }

      if (toInt(tier.gracePeriodDays, 0) < 0) {
        return NextResponse.json(
          { ok: false, error: "Grace period must be 0 or greater." },
          { status: 400 }
        );
      }

      if (toMoney(tier.lateFeeInitial) < 0 || toMoney(tier.lateFeeDaily) < 0) {
        return NextResponse.json(
          { ok: false, error: "Late fees must be 0 or greater." },
          { status: 400 }
        );
      }

      if (toInt(tier.maxLateFeeDays, 0) < 0) {
        return NextResponse.json(
          { ok: false, error: "Max late fee days must be 0 or greater." },
          { status: 400 }
        );
      }
    }

    const duplicateManager = await prisma.managementUser.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
      select: {
        id: true,
      },
    });

    if (duplicateManager) {
      return NextResponse.json(
        {
          ok: false,
          error: "An account with that email or username already exists.",
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const propertyCode = await generateUniquePropertyCode(tx);

        const createdProperty = await tx.property.create({
          data: {
            name: propertyName,
            propertyCode,
            propertyType,
            status: "SETUP",
            unitCount: totalUnitCount,
            isActive: true,
            billingCycleStartDate: getBusinessDate(),
            ownerDisplayName: email,
            contactEmail: email,
            addressLine1,
            addressLine2: addressLine2 || null,
            city,
            state,
            zip,
          },
        });

        const managerRecord = await tx.managementUser.create({
          data: {
            propertyId: createdProperty.id,
            email,
            username,
            passwordHash: hashPasswordForNow(password),
            role: "OWNER",
            isActive: true,
          },
        });

        for (let index = 0; index < tiers.length; index += 1) {
          const tier = tiers[index];
          const tierName = clean(tier.name) || `Tier ${index + 1}`;
          const baseRentCents = Math.round(toMoney(tier.price) * 100);
          const unitCount = toInt(tier.unitCount);
          const gracePeriodDays = toInt(tier.gracePeriodDays, 0);
          const lateFeeInitial = toMoney(tier.lateFeeInitial);
          const lateFeeDaily = toMoney(tier.lateFeeDaily);
          const maxLateFeeDays = toInt(tier.maxLateFeeDays, 0);
          const dueDay = toInt(tier.dueDay, 1);

          await tx.propertyTier.create({
            data: {
              propertyId: createdProperty.id,
              name: tierName,
              baseRentCents,
              unitCount,
              billingFrequency: "MONTHLY",
              rentDueDay: dueDay,
              gracePeriodDays,
              lateFeeType: tier.lateFeeType,
              lateFeeInitialCents: Math.round(lateFeeInitial * 100),
              lateFeeDailyCents: Math.round(lateFeeDaily * 100),
              maxLateFeeDays,
              sortOrder: index,
              isActive: true,
            },
          });
        }

        await tx.propertySettings.upsert({
          where: { propertyId: createdProperty.id },
          update: {
            onboardingComplete: true,
            setupComplete: true,
          },
          create: {
            propertyId: createdProperty.id,
            onboardingComplete: true,
            setupComplete: true,
          },
        });

        await tx.paymentConnectionStatus.upsert({
          where: { propertyId: createdProperty.id },
          update: {},
          create: {
            propertyId: createdProperty.id,
          },
        });

        return {
          propertyId: createdProperty.id,
          propertyCode: createdProperty.propertyCode,
          managementUserId: managerRecord.id,
        };
      }
    );

    const token = createSessionToken({
      role: "OWNER",
      propertyId: result.propertyId,
      managementUserId: result.managementUserId,
    });

    await setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      propertyId: result.propertyId,
      propertyCode: result.propertyCode,
      redirectTo: "/manager/dashboard",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not complete setup.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
