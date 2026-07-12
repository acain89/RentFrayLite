"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

function parseDateInput(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return new Date();
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function postManualPaymentForUnit(
  unitId: string,
  formData: FormData
) {
  const tenantIdRaw = String(formData.get("tenantId") || "");
  const amount = Number(formData.get("amount") || 0);
  const memo = String(formData.get("memo") || "");
  const effectiveDate = parseDateInput(formData.get("effectiveDate"));

  if (!unitId || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      id: true,
      propertyId: true,
    },
  });

  if (!unit) {
    redirect("/manager/units");
  }

  await prisma.ledgerEntry.create({
    data: {
      propertyId: unit.propertyId,
      unitId: unit.id,
      tenantId: tenantIdRaw || null,
      type: "MANUAL_PAYMENT",
      amount: -Math.abs(amount),
      effectiveDate,
      memo,
      source: "MANUAL",
    },
  });

  redirect(`/manager/units/${unit.id}`);
}

export async function postChargeForUnit(unitId: string, formData: FormData) {
  const tenantIdRaw = String(formData.get("tenantId") || "");
  const type = String(formData.get("type") || "");
  const amount = Number(formData.get("amount") || 0);
  const memo = String(formData.get("memo") || "");
  const effectiveDate = parseDateInput(formData.get("effectiveDate"));

  const allowedTypes = new Set(["RENT_CHARGE", "LATE_FEE", "OTHER_FEE"]);

  if (!unitId || !allowedTypes.has(type) || !Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      id: true,
      propertyId: true,
    },
  });

  if (!unit) {
    redirect("/manager/units");
  }

  await prisma.ledgerEntry.create({
    data: {
      propertyId: unit.propertyId,
      unitId: unit.id,
      tenantId: tenantIdRaw || null,
      type,
      amount: Math.abs(amount),
      effectiveDate,
      memo,
      source: "MANUAL",
    },
  });

  redirect(`/manager/units/${unit.id}`);
}