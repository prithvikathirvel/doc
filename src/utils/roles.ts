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

/**
 * Converts the display names used by the User Management Service into the
 * stable role ids understood by DMS. The platform deliberately does not need a
 * "DMS " prefix: appId already scopes the role names.
 *
 * A few underscore/hyphen variants are accepted so an existing Keycloak realm
 * can be migrated without changing DMS's authorization rules.
 */
export function mapUserServiceRoles(roles: readonly string[] | undefined): string[] {
  const mapped = new Set<string>();
  for (const role of roles || []) {
    const normalized = role
      .trim()
      .toLowerCase()
      .replace(/^dms[\s_-]+/, "")
      .replace(/^role[\s_-]+/, "")
      .replace(/[\s-]+/g, "_");
    if ([PLATFORM_ADMIN, "platformadmin"].includes(normalized)) mapped.add(PLATFORM_ADMIN);
    else if ([TENANT_ADMIN, "tenantadmin", "admin"].includes(normalized)) mapped.add(TENANT_ADMIN);
    else if (normalized === MEMBER) mapped.add(MEMBER);
  }
  return [...mapped];
}
