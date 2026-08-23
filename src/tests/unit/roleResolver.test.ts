import { RoleResolver } from "../../service/roleResolver";
import type { UserManagementClient, UserMgtAppUser } from "../../clients/userManagementClient";
import type { TenantMembershipRepository, UserAppRoleRepository } from "../../service/ports";
import type { TenantMembership } from "../../service/models";

function fakeUserManagement(users: UserMgtAppUser[]): UserManagementClient {
  return {
    listUsersWithRoles: jest.fn(async () => users),
  } as unknown as UserManagementClient;
}

function fakeMemberships(byKey: Record<string, TenantMembership | null>): TenantMembershipRepository {
  return {
    findByUserAndTenant: jest.fn(async (userId: string, tenantId: string) =>
      byKey[`${userId}|${tenantId}`] || null
    ),
  } as unknown as TenantMembershipRepository;
}

function fakeAppRoles(byUser: Record<string, string[] | null>): UserAppRoleRepository {
  return {
    find: jest.fn(async (userId: string) => byUser[userId] ?? null),
    upsert: jest.fn(async () => undefined),
  } as unknown as UserAppRoleRepository;
}

const activeMembership = (role: "tenant_admin" | "member"): TenantMembership => ({
  id: "m1",
  tenantId: "t-1",
  userId: "u-admin",
  email: null,
  role,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
});

const opts = { enabled: true, cacheTtlSeconds: 60 };

describe("RoleResolver", () => {
  it("resolves platform_admin from the User Management Service listing", async () => {
    const um = fakeUserManagement([
      { user: { userId: "u-admin", email: "a@x", username: "a" }, roles: ["Platform Admin"] },
    ]);
    const resolver = new RoleResolver(um, fakeMemberships({}), fakeAppRoles({}), opts);

    const result = await resolver.resolveAppRoles("u-admin");
    expect(result.roles).toEqual(["platform_admin"]);
    expect(result.platform).toBe(true);
    expect(result.cached).toBe(false);
  });

  it("caches the listing so a second call does not hit the service twice", async () => {
    const um = fakeUserManagement([
      { user: { userId: "u-admin", email: "a@x", username: "a" }, roles: ["Platform Admin"] },
    ]);
    const resolver = new RoleResolver(um, fakeMemberships({}), fakeAppRoles({}), opts);

    await resolver.resolveAppRoles("u-admin");
    const second = await resolver.resolveAppRoles("u-admin");

    expect(um.listUsersWithRoles).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
    expect(second.roles).toEqual(["platform_admin"]);
  });

  it("fails closed (no platform_admin) when the User Service is unavailable and the store is empty", async () => {
    const um = {
      listUsersWithRoles: jest.fn(async () => {
        throw new Error("User Service down");
      }),
    } as unknown as UserManagementClient;
    const resolver = new RoleResolver(um, fakeMemberships({}), fakeAppRoles({}), opts);

    const result = await resolver.resolveAppRoles("u-admin");
    expect(result.roles).toEqual([]);
    expect(result.platform).toBe(false);
  });

  it("returns the tenant-scoped role from the membership table", async () => {
    const memberships = fakeMemberships({
      "u-tenant|t-1": activeMembership("tenant_admin"),
    });
    const resolver = new RoleResolver(fakeUserManagement([]), memberships, fakeAppRoles({}), opts);

    expect(await resolver.resolveTenantRole("u-tenant", "t-1")).toBe("tenant_admin");
    expect(await resolver.resolveTenantRole("u-tenant", "t-other")).toBeNull();
  });

  it("treats a suspended membership as no access", async () => {
    const suspended: TenantMembership = { ...activeMembership("member"), status: "suspended" };
    const memberships = fakeMemberships({ "u-tenant|t-1": suspended });
    const resolver = new RoleResolver(fakeUserManagement([]), memberships, fakeAppRoles({}), opts);

    expect(await resolver.resolveTenantRole("u-tenant", "t-1")).toBeNull();
  });

  it("prime() warms the cache and persists to the store so the User Service is never called", async () => {
    const um = fakeUserManagement([]);
    const appRoles = fakeAppRoles({});
    const resolver = new RoleResolver(um, fakeMemberships({}), appRoles, opts);

    await resolver.prime("u-admin", ["Platform Admin"]);
    const result = await resolver.resolveAppRoles("u-admin");
    expect(um.listUsersWithRoles).not.toHaveBeenCalled();
    expect(appRoles.upsert).toHaveBeenCalledWith("u-admin", ["platform_admin"]);
    expect(result.roles).toEqual(["platform_admin"]);
    expect(result.cached).toBe(true);
  });

  it("reads platform_admin from the persistent store on a cache miss (survives restart)", async () => {
    const um = fakeUserManagement([]); // listing returns nothing
    const appRoles = fakeAppRoles({ "u-admin": ["platform_admin"] });
    const resolver = new RoleResolver(um, fakeMemberships({}), appRoles, opts);

    const result = await resolver.resolveAppRoles("u-admin");
    expect(result.roles).toEqual(["platform_admin"]);
    expect(result.platform).toBe(true);
    expect(um.listUsersWithRoles).not.toHaveBeenCalled();
  });

  it("falls back to the User Service listing when neither cache nor store has the user", async () => {
    const um = fakeUserManagement([
      { user: { userId: "u-admin", email: "a@x", username: "a" }, roles: ["Platform Admin"] },
    ]);
    const appRoles = fakeAppRoles({}); // empty store
    const resolver = new RoleResolver(um, fakeMemberships({}), appRoles, opts);

    const result = await resolver.resolveAppRoles("u-admin");
    expect(result.roles).toEqual(["platform_admin"]);
    expect(appRoles.upsert).toHaveBeenCalledWith("u-admin", ["platform_admin"]);
  });

  it("invalidate(userId) drops one entry; invalidate() drops all", async () => {
    const um = fakeUserManagement([
      { user: { userId: "u-admin", email: "a@x", username: "a" }, roles: ["Platform Admin"] },
    ]);
    const resolver = new RoleResolver(um, fakeMemberships({}), fakeAppRoles({}), opts);

    await resolver.prime("u-admin", ["Member"]);
    resolver.invalidate("u-admin");
    const result = await resolver.resolveAppRoles("u-admin");
    // After invalidation the authoritative listing is consulted again.
    expect(result.roles).toEqual(["platform_admin"]);
    expect(result.cached).toBe(false);
  });
});
