/**
 * Single source of truth for pulling application role names out of the Sify
 * User Management Service payloads.
 *
 * The User Service is the authoritative RBAC store for the application-level
 * role (Platform Admin / Tenant Admin / Member). Its payloads are deeply nested
 * and have drifted between environments, so this one defensive extractor is
 * used by the login controller, the role resolver and the unit tests. It only
 * collects raw display names; {@link mapUserServiceRoles} converts them to the
 * stable DMS role ids so the mapping lives in exactly one place.
 */

/**
 * Collects every role-name-shaped value found in a User Service payload.
 *
 * Known locations, all handled:
 *   data.user.role.roleName          (login response — the real shape)
 *   data.user.roles[]                (a user with multiple roles)
 *   data.user.role                   (a single role object)
 *   data.role.{roleName|name|role}   (role hoisted to the data envelope)
 *   data.roles[] / data.role[]
 *   data.app / data.application ...  (application envelope, future-proofing)
 *   top-level user / role / roles / application envelopes
 *   a bare array of role objects
 */
export function extractUserServiceRoleNames(raw: unknown): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        names.push(trimmed);
      }
    }
  };

  const visit = (value: unknown): void => {
    if (!value) return;
    if (typeof value === "string") {
      push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;

    // A role object: { roleName, name, role, ... }
    const directName = pickString(record.roleName, record.name, record.role, record.role_id);
    if (directName) push(directName);

    // Recurse into the common envelope keys so nested role objects and role
    // arrays are flattened regardless of which level they appear at.
    for (const key of [
      "user",
      "profile",
      "role",
      "roles",
      "userRoles",
      "application",
      "applicationInformation",
      "applicationInfo",
      "app",
      "data",
    ]) {
      if (record[key] !== undefined) visit(record[key]);
    }
  };

  visit(raw);
  return names;
}

/**
 * Returns the role names carried by a single user record inside a
 * `GET /api/role/{appId}` listing. Each entry may be `{ user, roles }` or the
 * role may be nested under the user object, so this is a focused wrapper around
 * the general extractor.
 */
export function extractUserAppRoleNames(userRecord: unknown): string[] {
  return extractUserServiceRoleNames({ data: { user: userRecord } });
}

function pickString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}
