import { z } from "zod";

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
    .max(128, "Password is too long."),
});

export const adminLoginSchema = z.object({
  type: z.literal("ADMIN"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit admin code."),
});

export const loginSchema = z.discriminatedUnion("type", [
  managerLoginSchema,
  adminLoginSchema,
]);

export const setupAccountSchema = z
  .object({
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
    contactEmail: z
      .string()
      .trim()
      .email("Enter a valid contact email.")
      .transform((value) => value.toLowerCase()),
    contactPhone: z
      .string()
      .trim()
      .max(30, "Phone number is too long.")
      .optional()
      .transform((value) => value || undefined),
    managerEmail: z
      .string()
      .trim()
      .email("Enter a valid manager email.")
      .transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(6, "Password must contain at least 6 characters.")
      .max(128, "Password is too long."),
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, {
      message:
        "You must agree to the Terms of Service and Privacy Policy.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
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
