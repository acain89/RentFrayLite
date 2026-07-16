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
    .min(8, "Password must contain at least 8 characters.")
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
