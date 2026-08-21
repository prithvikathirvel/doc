import { mapUserServiceRoles } from "../../utils/roles";

describe("User Service role mapping", () => {
  it("maps the unprefixed DMS role names to stable DMS roles", () => {
    expect(mapUserServiceRoles(["Platform Admin", "Tenant Admin", "Member"])).toEqual([
      "platform_admin",
      "tenant_admin",
      "member",
    ]);
  });

  it("accepts normalized Keycloak variants during migration", () => {
    expect(mapUserServiceRoles(["DMS_PLATFORM_ADMIN", "tenant-admin"])).toEqual([
      "platform_admin",
      "tenant_admin",
    ]);
  });
});
