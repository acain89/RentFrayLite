import { normalizeRegistrationPhone, REGISTRATION_PHONE_INVALID, REGISTRATION_SMS_PHONE_REQUIRED } from "@/lib/registrationPhone";
import { isNewManagementPassword, isManagementLoginPassword, MANAGEMENT_PASSWORD_REQUIREMENT } from "@/lib/managementCredential";
import { z } from "zod";
import { isStrongAdminCredential } from "@/lib/adminCredential";
import { isSupportedPropertyTimeZone } from "@/lib/managementBillingSetup";
import { validatePropertyTimeZone } from "@/lib/propertyBillingCalendar";

export const managerLoginSchema = z.object({
  type: z.literal("MANAGER"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(6, "Password must contain at least 6 characters.")
    .max(128, "Password is too long.")
    .refine(isManagementLoginPassword,"Unable to sign in."),
});

export const adminLoginSchema = z.object({
  type: z.literal("ADMIN"),
  code: z.string().refine(isStrongAdminCredential, "Unable to sign in."),
});

export const loginSchema = z.discriminatedUnion("type", [
  managerLoginSchema,
  adminLoginSchema,
]);

const registrationEmailSchema = z.string().trim().email("Enter a valid email address.")
  .transform(value => value.toLowerCase());

export const setupAccountSchema = z
  .object({
    smsConsent: z.boolean().optional().default(false),
    propertyTimeZone: z.string()
      .refine(isSupportedPropertyTimeZone, "Choose a supported U.S. property timezone.")
      .transform(validatePropertyTimeZone),
    businessName: z
      .string()
      .trim()
      .min(2, "Enter the business name.")
      .max(120, "Business name is too long."),
    ownerName: z
      .string()
      .trim()
      .min(2, "Enter the owner or manager name.")
      .max(100, "Name is too long."),
    email: registrationEmailSchema.optional(),
    // Accept legacy signup clients only when all submitted addresses agree.
    contactEmail: registrationEmailSchema.optional(),
    contactPhone: z
      .string()
      .trim()
      .max(30, "Phone number is too long.")
      .optional()
      .transform((value) => value || undefined),
    managerEmail: registrationEmailSchema.optional(),
    password: z
      .string()
      .refine(isNewManagementPassword,MANAGEMENT_PASSWORD_REQUIREMENT),
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, {
      message:
        "You must agree to the Terms of Service and Privacy Policy.",
    }),
  })
  .refine(data => data.email !== undefined ||
    (data.contactEmail !== undefined && data.managerEmail !== undefined), {
    message: "Enter an email address.", path: ["email"],
  })
  .refine(data => [data.email, data.contactEmail, data.managerEmail]
    .every(address => address === undefined || address === (data.email ?? data.managerEmail)), {
    message: "Use the same email address for business contact and manager login.", path: ["email"],
  })
  .refine(data => !data.smsConsent || !!normalizeRegistrationPhone(data.contactPhone), {
    message: REGISTRATION_SMS_PHONE_REQUIRED, path: ["contactPhone"],
  })
  .refine(data => !data.contactPhone || data.smsConsent || !!normalizeRegistrationPhone(data.contactPhone), {
    message: REGISTRATION_PHONE_INVALID, path: ["contactPhone"],
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .transform(data => {
    const email = data.email ?? data.managerEmail ?? "";
    return { ...data, contactEmail: email, managerEmail: email, contactPhone: normalizeRegistrationPhone(data.contactPhone) ?? undefined };
  });

export const accountCodeSchema = z.object({
  accountCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z]{2}-\d{4}$/,
      "Account code must use the format AB-1234."
    ),
});
