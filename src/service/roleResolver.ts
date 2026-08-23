import { settings } from "../config/settings";
import type { UserManagementClient } from "../clients/userManagementClient";
import type { TenantMembershipRepository, UserAppRoleRepository } from "./ports";
import type { TenantMemberRole } from "./models";
import { PLATFORM_ADMIN, mapUserServiceRoles } from "../utils/roles";
import logger from "../utils/logger";

/**
 * Authoritative role resolution for protected requests.
 *
 * The DMS access token is treated as **authentication only**. The caller's role
 * is resolved here, server-side, in this order:
 *
 *   1. In-process cache (per user, short TTL) — warmed at login.
 *   2. Persistent `user_app_roles` table — written at login, survives restarts
 *      and load balancers. This is the reliable source because the Keycloak
 *      token carries no role claims and the browser logs in through the DMS
 *      backend, which learns the role from the User Service login response.
 *   3. The User Management Service `GET /api/role/{appId}` listing (live) — a
 *      secondary source for users who have not logged in since this table was
 *      introduced, and for picking up role changes.
 *
 * Tenant-scoped roles (tenant_admin / member) come from `tenant_members`, which
 * DMS owns. Because roles are never read from the JWT, a tenant integration can
 * forward any validly-signed same-realm token without embedding role claims and
 * DMS still authorizes the call. See docs/SECURE_AUTHORIZATION.md.
 *
 * `platform_admin` is fail-closed: it is granted only on a positive
 * confirmation from one of the sources above.
 */
export interface ResolvedAppRoles {
  /** Canonical DMS roles, e.g. ["platform_admin"] or ["member"]. May be empty. */
  roles: string[];
  platform: boolean;
  /** True when the value came from a cache rather than a fresh lookup. */
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
    private readonly appRoles?: UserAppRoleRepository,
    options: { enabled?: boolean; cacheTtlSeconds?: number } = {}
  ) {
    this.enabled = options.enabled ?? settings.roleResolver.enabled;
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? settings.roleResolver.cacheTtlSeconds;
  }

  /**
   * Returns the caller's canonical application roles. Fail-closed: if no source
   * can confirm a role, an empty list is returned (the caller is treated as a
   * plain member). `platform_admin` is therefore only ever granted on a
   * positive confirmation.
   */
  async resolveAppRoles(userId: string): Promise<ResolvedAppRoles> {
    if (!userId) return { roles: [], platform: false, cached: false };

    const cached = this.readAppRoleCache(userId);
    if (cached) return { roles: cached.roles, platform: cached.roles.includes(PLATFORM_ADMIN), cached: true };

    const fromStore = this.appRoles ? await this.readAppRolesFromStore(userId) : null;
    if (fromStore && fromStore.length) {
      this.writeAppRoleCache(userId, fromStore);
      return { roles: fromStore, platform: fromStore.includes(PLATFORM_ADMIN), cached: false };
    }

    const listing = await this.loadAppRoleListing();
    const rawRoles = listing.get(userId) || [];
    const roles = mapUserServiceRoles(rawRoles);
    this.writeAppRoleCache(userId, roles);
    if (roles.length) await this.persistAppRoles(userId, roles);
    return { roles, platform: roles.includes(PLATFORM_ADMIN), cached: false };
  }

  /** Warm both caches from the login response so the first protected call is free. */
  async prime(userId: string, roles: string[]): Promise<void> {
    if (!userId) return;
    const canonical = mapUserServiceRoles(roles);
    this.writeAppRoleCache(userId, canonical);
    await this.persistAppRoles(userId, canonical);
  }

  /** Drops the in-process cache for one user (role change, logout) or all. */
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

  private async readAppRolesFromStore(userId: string): Promise<string[] | null> {
    if (!this.appRoles) return null;
    try {
      return await this.appRoles.find(userId);
    } catch (error) {
      logger.warn("role_resolver_store_read_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async persistAppRoles(userId: string, roles: string[]): Promise<void> {
    if (!this.appRoles) return;
    try {
      await this.appRoles.upsert(userId, roles);
    } catch (error) {
      // A failed write does not break the current request: the in-process cache
      // still holds the value for this token's lifetime.
      logger.warn("role_resolver_store_write_failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
        }
        this.listingExpiresAt = Math.floor(Date.now() / 1000) + this.cacheTtlSeconds;
        return index;
      } catch (error) {
        // Fail closed: an empty index yields no platform admins. Tenant-scoped
        // access still works because it relies on the membership table.
        logger.warn("role_resolver_listing_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return new Map();
      } finally {
        this.listingInFlight = null;
      }
    })();

    return this.listingInFlight;
  }
}
