// lib/permissions.ts

export function isAdminRole(role: string | null | undefined) {
  return role === "ADMIN";
}

export function isManagementRole(role: string | null | undefined) {
  return role === "OWNER" || role === "MANAGER" || role === "STAFF";
}

export function canManageFinancials(role: string | null | undefined) {
  return role === "OWNER" || role === "MANAGER";
}

export function canManageOperations(role: string | null | undefined) {
  return role === "OWNER" || role === "MANAGER" || role === "STAFF";
}

export function canManageMaintenancePins(role: string | null | undefined) {
  return role === "OWNER" || role === "MANAGER";
}

export function canAccessMaintenancePortal(role: string | null | undefined) {
  return role === "MAINTENANCE";
}

export function canAccessTenantPortal(role: string | null | undefined) {
  return role === "TENANT";
}