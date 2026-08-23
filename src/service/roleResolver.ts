import { settings } from "../config/settings";
import type { UserManagementClient } from "../clients/userManagementClient";
import type { TenantMembershipRepository } from "./ports";
import type { TenantMemberRole } from "./models";
import { PLATFORM_ADMIN, mapUserServiceRoles } from "../utils/roles";

/**
 * Authoritative role resolution for protected requests.
 *
 * The DMS access token is treated as **authentication only**. The caller's role
 * is resolved here, server-side, from stores DMS trusts:
 *
 *   1. Application role (incl. `platform_admin`) — the Sify User Management
 *      Service `GET /api/role/{appId}` listing, fetched with the confidential
 *      service-account token.
 *   2. Tenant-scoped role (`tenant_admin` | `member`) — DMS's own
 *      `tenant_members` table, which DMS owns and writes during onboarding.
 *
 * Because roles are never read from the JWT, a tenant integration can forward
 * any validly-signed same-realm access token without embedding role claims, and
 * the DMS still authorizes the call correctly. See
 * docs/SECURE_AUTHORIZATION.md.
 *
 * The application role listing is cached per user for a short TTL so a typical
 * request pays no remote call. `prime()` lets the login flow warm the cache.
 */
export interface ResolvedAppRoles {
  /** Canonical DMS roles, e.g. ["platform_admin"] or ["member"]. May be empty. */
  roles: string[];
  platform: boolean;
  /** True when the value came from the cache rather than a fresh lookup. */
  cached: boolean;
}

interface AppRoleCacheEntry {
  roles: string[];
  expiresAt: number;
}

export class RoleResolver {
  private readonly enabled: boolean;
  private readonly cacheTtlSeconds: number;
  private appRoleCache = new Map<string, AppRoleCacheEntry>();
  private listingInFlight: Promise<Map<string, string[]>> | null = null;
  private listingExpiresAt = 0;

  constructor(
    private readonly userManagement: UserManagementClient,
    private readonly memberships: TenantMembershipRepository,
    options: { enabled?: boolean; cacheTtlSeconds?: number } = {}
  ) {
    this.enabled = options.enabled ?? settings.roleResolver.enabled;
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? settings.roleResolver.cacheTtlSeconds;
  }

  /**
   * Returns the caller's canonical application roles. Fail-closed: if the User
   * Management Service cannot be reached on a cache miss, an empty list is
   * returned (the caller is treated as a plain member). `platform_admin` is
   * therefore only ever granted on a positive confirmation.
   */
  async resolveAppRoles(userId: string): Promise<ResolvedAppRoles> {
    if (!userId) return { roles: [], platform: false, cached: false };

    const cached = this.readAppRoleCache(userId);
    if (cached) return { roles: cached.roles, platform: cached.roles.includes(PLATFORM_ADMIN), cached: true };

    const listing = await this.loadAppRoleListing();
    const rawRoles = listing.get(userId) || [];
    const roles = mapUserServiceRoles(rawRoles);
    this.writeAppRoleCache(userId, roles);
    return { roles, platform: roles.includes(PLATFORM_ADMIN), cached: false };
  }

  /** Warm the cache from the login response so the first protected call is free. */
  prime(userId: string, roles: string[]): void {
    if (!userId) return;
    this.writeAppRoleCache(userId, mapUserServiceRoles(roles));
  }

  /** Drops one user (role change, logout) or the whole cache (rotation). */
  invalidate(userId?: string): void {
    if (userId) this.appRoleCache.delete(userId);
    else {
      this.appRoleCache.clear();
      this.listingExpiresAt = 0;
    }
  }

  /** Tenant-scoped role from DMS's own membership table. */
  async resolveTenantRole(userId: string, tenantId: string): Promise<TenantMemberRole | null> {
    const membership = await this.memberships.findByUserAndTenant(userId, tenantId);
    if (!membership || membership.status !== "active") return null;
    return membership.role;
  }

  private readAppRoleCache(userId: string): AppRoleCacheEntry | null {
    const entry = this.appRoleCache.get(userId);
    if (!entry) return null;
    if (entry.expiresAt <= Math.floor(Date.now() / 1000)) {
      this.appRoleCache.delete(userId);
      return null;
    }
    return entry;
  }

  private writeAppRoleCache(userId: string, roles: string[]): void {
    this.pruneAppRoleCache();
    this.appRoleCache.set(userId, {
      roles: [...roles],
      expiresAt: Math.floor(Date.now() / 1000) + this.cacheTtlSeconds,
    });
  }

  private pruneAppRoleCache(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [userId, entry] of this.appRoleCache) {
      if (entry.expiresAt <= now) this.appRoleCache.delete(userId);
    }
  }

  /**
   * Loads `GET /api/role/{appId}` once per TTL window and indexes it by user id.
   * The whole-app listing is fetched (there is no per-user endpoint) and shared
   * across all users, so a cache miss for any user costs a single remote call.
   */
  private async loadAppRoleListing(): Promise<Map<string, string[]>> {
    if (!this.enabled) return new Map();
    const now = Math.floor(Date.now() / 1000);
    if (this.listingInFlight) return this.listingInFlight;
    if (this.listingExpiresAt > now) {
      // The listing is still fresh; rebuild the index from the cached entries.
      const index = new Map<string, string[]>();
      for (const [userId, entry] of this.appRoleCache) index.set(userId, entry.roles);
      return index;
    }

    this.listingInFlight = (async () => {
      try {
        const users = await this.userManagement.listUsersWithRoles();
        const index = new Map<string, string[]>();
        for (const item of users) {
          if (!item.user.userId) continue;
          index.set(item.user.userId, item.roles);
          this.writeAppRoleCache(item.user.userId, mapUserServiceRoles(item.roles));
        }
        this.listingExpiresAt = Math.floor(Date.now() / 1000) + this.cacheTtlSeconds;
        return index;
      } catch {
        // Fail closed: an empty index yields no platform admins. Tenant-scoped
        // access still works because it relies on the membership table.
        return new Map();
      } finally {
        this.listingInFlight = null;
      }
    })();

    return this.listingInFlight;
  }
}
