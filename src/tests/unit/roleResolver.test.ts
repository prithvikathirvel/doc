import { RoleResolver } from "../../service/roleResolver";
import type { UserManagementClient, UserMgtAppUser } from "../../clients/userManagementClient";
import type { TenantMembershipRepository } from "../../service/ports";
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

describe("RoleResolver", () => {
  it("resolves platform_admin from the User Management Service listing", async () => {
    const um = fakeUserManagement([
      { user: { userId: "u-admin", email: "a@x", username: "a" }, roles: ["Platform Admin"] },
    ]);
    const resolver = new RoleResolver(um, fakeMemberships({}), {
      enabled: true,
      cacheTtlSeconds: 60,
    });

    const result = await resolver.resolveAppRoles("u-admin");
    expect(result.roles).toEqual(["platform_admin"]);
    expect(result.platform).toBe(true);
    expect(result.cached).toBe(false);
  });

  it("caches the listing so a second call does not hit the service twice", async () => {
    const um = fakeUserManagement([
      { user: { userId: "u-admin", email: "a@x", username: "a" }, roles: ["Platform Admin"] },
    ]);
    const resolver = new RoleResolver(um, fakeMemberships({}), { cacheTtlSeconds: 60 });

    await resolver.resolveAppRoles("u-admin");
    const second = await resolver.resolveAppRoles("u-admin");

    expect(um.listUsersWithRoles).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
    expect(second.roles).toEqual(["platform_admin"]);
  });

  it("fails closed (no platform_admin) when the User Service is unavailable", async () => {
    const um = {
      listUsersWithRoles: jest.fn(async () => {
        throw new Error("User Service down");
      }),
    } as unknown as UserManagementClient;
    const resolver = new RoleResolver(um, fakeMemberships({}), { cacheTtlSeconds: 60 });

    const result = await resolver.resolveAppRoles("u-admin");
    expect(result.roles).toEqual([]);
    expect(result.platform).toBe(false);
  });

  it("returns the tenant-scoped role from the membership table", async () => {
    const memberships = fakeMemberships({
      "u-tenant|t-1": activeMembership("tenant_admin"),
    });
    const resolver = new RoleResolver(fakeUserManagement([]), memberships, { cacheTtlSeconds: 60 });

    expect(await resolver.resolveTenantRole("u-tenant", "t-1")).toBe("tenant_admin");
    expect(await resolver.resolveTenantRole("u-tenant", "t-other")).toBeNull();
  });

  it("treats a suspended membership as no access", async () => {
    const suspended: TenantMembership = { ...activeMembership("member"), status: "suspended" };
    const memberships = fakeMemberships({ "u-tenant|t-1": suspended });
    const resolver = new RoleResolver(fakeUserManagement([]), memberships, { cacheTtlSeconds: 60 });

    expect(await resolver.resolveTenantRole("u-tenant", "t-1")).toBeNull();
  });

  it("prime() warms the cache so the User Service is never called", async () => {
    const um = fakeUserManagement([]);
    const resolver = new RoleResolver(um, fakeMemberships({}), { cacheTtlSeconds: 60 });

    resolver.prime("u-admin", ["Platform Admin"]);
    const result = await resolver.resolveAppRoles("u-admin");
    expect(um.listUsersWithRoles).not.toHaveBeenCalled();
    expect(result.roles).toEqual(["platform_admin"]);
    expect(result.cached).toBe(true);
  });

  it("invalidate(userId) drops one entry; invalidate() drops all", async () => {
    const um = fakeUserManagement([
      { user: { userId: "u-admin", email: "a@x", username: "a" }, roles: ["Platform Admin"] },
    ]);
    const resolver = new RoleResolver(um, fakeMemberships({}), { cacheTtlSeconds: 60 });

    resolver.prime("u-admin", ["Member"]);
    resolver.invalidate("u-admin");
    const result = await resolver.resolveAppRoles("u-admin");
    // After invalidation the authoritative listing is consulted again.
    expect(result.roles).toEqual(["platform_admin"]);
    expect(result.cached).toBe(false);
  });
});
