import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { verifyManagementPassword } from "@/lib/managementAuth";
import bcrypt from "bcryptjs";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Body = {
  currentLogin?: unknown;
  currentPassword?: unknown;
  newEmail?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  const session = await getSession();

  if (!session || !session.managementUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;

  const currentLogin = clean(body.currentLogin).toLowerCase();
  const currentPassword = clean(body.currentPassword);
  const newEmail = clean(body.newEmail).toLowerCase();
  const newPassword = clean(body.newPassword);
  const confirmPassword = clean(body.confirmPassword);

  if (
    !currentLogin ||
    !currentPassword ||
    !newEmail ||
    !newPassword ||
    !confirmPassword
  ) {
    return NextResponse.json(
      { error: "All fields are required." },
      { status: 400 }
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { error: "New passwords do not match." },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // 🔐 SINGLE SOURCE OF TRUTH USER LOAD
  const user = await prisma.managementUser.findUnique({
    where: { id: session.managementUserId },
    select: {
      id: true,
      email: true,
      username: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const storedEmail = clean(user.email).toLowerCase();
  const storedUsername = clean(user.username).toLowerCase();

  // 🔐 LOGIN MATCH (email OR username)
  if (currentLogin !== storedEmail && currentLogin !== storedUsername) {
    return NextResponse.json(
      { error: "Current login is incorrect." },
      { status: 400 }
    );
  }

  const passwordMatch = await verifyManagementPassword(
  currentPassword,
  user.passwordHash
);

if (!passwordMatch) {
  return NextResponse.json(
    { error: "Current password is incorrect." },
    { status: 400 }
  );
}

  // 🚫 DUPLICATE EMAIL CHECK
  const existing = await prisma.managementUser.findFirst({
    where: {
      email: newEmail,
      NOT: { id: user.id },
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Email already in use." },
      { status: 409 }
    );
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  // ✅ UPDATE IN PLACE (NO ROLE DRIFT)
  const updated = await prisma.managementUser.update({
    where: { id: user.id },
    data: {
      email: newEmail,
      username: newEmail, // enforce single authority
      passwordHash: newHash,
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}
