import { extractUserServiceRoleNames } from "../../utils/userServiceRoles";
import { mapUserServiceRoles } from "../../utils/roles";

/**
 * The exact login payload shape returned by the Sify User Management Service
 * (https://apidev.sifymodernization.digital/user-mgt/api/user/login). The role
 * lives at `data.user.role.roleName` and the application envelope is `data.app`.
 * This is the shape that the previous extractors missed, silently turning every
 * Platform Admin into a member.
 */
const realLoginPayload = {
  data: {
    accessToken: "exxxx",
    refreshToken: "xxx",
    idToken: "xxxxx",
    expiresIn: 300,
    user: {
      id: "d9a9113f-dc51-429e-96c6-413ee4ffd2c8",
      email: "prithvi.kathirvel@sifycorp.com",
      firstName: "Prithvi",
      lastName: "P K",
      username: "prithvi",
      role: {
        id: "6bad45c2-9e50-4aa7-9942-f38652774396",
        userId: "d9a9113f-dc51-429e-96c6-413ee4ffd2c8",
        appId: "DMS",
        roleId: "32f387f1-5d2d-4314-b062-b86fe6ec5022",
        roleName: "Platform Admin",
        description: "Onboard tenants and administer every DMS workspace",
        template: "High Privileges",
        permission: {
          appId: "DMS",
          privilege: [{ actions: ["DOCUMENT_READ"], feature: "Documents" }],
        },
        isActive: true,
      },
      template: "",
    },
    app: {
      appId: "DMS",
      appName: "DMS",
      appUrl: "http://1.6.37.35",
      provider: "keycloak",
    },
  },
};

describe("extractUserServiceRoleNames", () => {
  it("finds the role nested under data.user.role.roleName in the real payload", () => {
    expect(extractUserServiceRoleNames(realLoginPayload)).toEqual(["Platform Admin"]);
  });

  it("maps the real payload's role to the canonical platform_admin id", () => {
    const roles = mapUserServiceRoles(extractUserServiceRoleNames(realLoginPayload));
    expect(roles).toEqual(["platform_admin"]);
  });

  it("reads a tenant admin and a member from the same nested shape", () => {
    const tenantAdmin = {
      data: { user: { id: "u1", role: { roleName: "Tenant Admin" } } },
    };
    const member = { data: { user: { id: "u2", role: { roleName: "Member" } } } };
    expect(mapUserServiceRoles(extractUserServiceRoleNames(tenantAdmin))).toEqual(["tenant_admin"]);
    expect(mapUserServiceRoles(extractUserServiceRoleNames(member))).toEqual(["member"]);
  });

  it("handles a user with an array of roles and legacy aliases", () => {
    const payload = { data: { user: { id: "u", roles: ["DMS_PLATFORM_ADMIN", "tenant-admin"] } } };
    expect(mapUserServiceRoles(extractUserServiceRoleNames(payload))).toEqual([
      "platform_admin",
      "tenant_admin",
    ]);
  });

  it("returns an empty list for a payload with no role information", () => {
    expect(extractUserServiceRoleNames({ data: { user: { id: "u" } } })).toEqual([]);
    expect(extractUserServiceRoleNames({})).toEqual([]);
  });

  it("does not invent roles from permission action names", () => {
    // The privilege.actions array (DOCUMENT_READ, TENANT_CREATE, ...) must not be
    // mistaken for role names.
    expect(extractUserServiceRoleNames(realLoginPayload)).toEqual(["Platform Admin"]);
  });
});
