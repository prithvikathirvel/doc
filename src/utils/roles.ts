/**
 * Role model used across the API.
 *
 * platform_admin  cross-tenant operator. Can onboard tenants, read any tenant,
 *                 and acts as a tenant administrator inside any tenant it targets.
 * tenant_admin    administrator of a single tenant. Full control over that tenant's
 *                 documents, folders and permission grants.
 * member          regular user. Access is decided by document permission grants.
 *
 * "admin" is accepted as a legacy alias of tenant_admin.
 */
export const PLATFORM_ADMIN = "platform_admin";
export const TENANT_ADMIN = "tenant_admin";
export const MEMBER = "member";

const TENANT_ADMIN_ALIASES = [TENANT_ADMIN, "admin"];

export function normalizeRoles(roles: readonly string[] | undefined): string[] {
  if (!roles) return [];
  return roles.map((role) => role.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformAdmin(roles: readonly string[] | undefined): boolean {
  return normalizeRoles(roles).includes(PLATFORM_ADMIN);
}

/** Platform admins are tenant administrators of the tenant they are operating on. */
export function isTenantAdmin(roles: readonly string[] | undefined): boolean {
  const normalized = normalizeRoles(roles);
  return normalized.includes(PLATFORM_ADMIN) || normalized.some((role) => TENANT_ADMIN_ALIASES.includes(role));
}
