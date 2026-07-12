// lib/financialAccess.ts

export function canManageFinancials(role: string | null | undefined) {
  return role === "OWNER" || role === "MANAGER";
}