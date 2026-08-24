import { Request } from "express";
import { authMiddleware } from "../../middleware/authorization";
import { settings } from "../../config/settings";
import { verifyAccessToken } from "../../config/keycloak";
import { container } from "../../config/container";

jest.mock("../../config/keycloak", () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock("../../config/container", () => ({
  container: {
    roleResolver: {
      resolveAppRoles: jest.fn(),
      prime: jest.fn(),
      invalidate: jest.fn(),
    },
    tenantMemberships: {
      findByUserAndTenant: jest.fn(),
      findByEmailAndTenant: jest.fn(),
    },
  },
}));

const verify = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;
const resolveAppRoles = container.roleResolver.resolveAppRoles as jest.MockedFunction<
  typeof container.roleResolver.resolveAppRoles
>;
const findByUserAndTenant = container.tenantMemberships.findByUserAndTenant as jest.MockedFunction<
  typeof container.tenantMemberships.findByUserAndTenant
>;
const findByEmailAndTenant = container.tenantMemberships.findByEmailAndTenant as jest.MockedFunction<
  typeof container.tenantMemberships.findByEmailAndTenant
>;

const originalMode = settings.authMode;
const originalDisabled = settings.authDisabled;
const originalAllowHeaders = settings.authAllowDevHeaders;

beforeEach(() => {
  settings.authMode = "keycloak";
  settings.authDisabled = false;
  settings.authAllowDevHeaders = false;
  verify.mockResolvedValue({
    sub: "user-1",
    email: "user@example.com",
    preferred_username: "user",
    // The real Keycloak token carries no DMS role claims.
    realm_access: { roles: ["default-roles-dms", "offline_access", "uma_authorization"] },
  });
  resolveAppRoles.mockReset();
  findByUserAndTenant.mockReset();
  findByEmailAndTenant.mockReset();
});

afterAll(() => {
  settings.authMode = originalMode;
  settings.authDisabled = originalDisabled;
  settings.authAllowDevHeaders = originalAllowHeaders;
});

function request(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

async function runMiddleware(req: Request) {
  const next = jest.fn();
  authMiddleware(req, {} as never, next);
  // verifyAndAttach + resolver/membership are awaited across microtasks.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { next, req };
}

test("requires the DMS app id after token verification", async () => {
  resolveAppRoles.mockResolvedValue({ roles: ["member"], platform: false, cached: false });
  const { next } = await runMiddleware(
    request({ authorization: "Bearer signed-token", "x-app-id": "OTHER_APP" })
  );
  expect(verify).toHaveBeenCalledWith("signed-token");
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
});

test("attaches the verified identity without trusting user headers", async () => {
  resolveAppRoles.mockResolvedValue({ roles: ["member"], platform: false, cached: false });
  const { next, req } = await runMiddleware(
    request({
      authorization: "Bearer signed-token",
      "x-app-id": "DMS",
      "x-user-id": "attacker", // must be ignored in keycloak mode
      "x-roles": "platform_admin", // must be ignored in keycloak mode
    })
  );
  expect(next).toHaveBeenCalledWith();
  expect(req.auth.userId).toBe("user-1");
  expect(req.auth.roles).toEqual(["member"]);
});

test("resolves platform_admin authoritatively even when the JWT carries no role", async () => {
  // The resolver is the source of truth; the token's realm roles are irrelevant.
  resolveAppRoles.mockResolvedValue({ roles: ["platform_admin"], platform: true, cached: false });
  const { next, req } = await runMiddleware(
    request({ authorization: "Bearer signed-token", "x-app-id": "DMS" })
  );
  expect(next).toHaveBeenCalledWith();
  expect(req.auth.roles).toEqual(["platform_admin"]);
  // Platform admins may reach tenant-independent endpoints without a tenant.
  expect(req.auth.tenantId).toBe("");
});

test("rejects a non-platform caller who selects a tenant they do not belong to", async () => {
  resolveAppRoles.mockResolvedValue({ roles: ["member"], platform: false, cached: false });
  findByUserAndTenant.mockResolvedValue(null);
  const { next } = await runMiddleware(
    request({
      authorization: "Bearer signed-token",
      "x-app-id": "DMS",
      "x-tenant-id": "tenant-b",
    })
  );
  expect(findByUserAndTenant).toHaveBeenCalledWith("user-1", "tenant-b");
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
});

test("uses the active membership role for a tenant-scoped caller", async () => {
  resolveAppRoles.mockResolvedValue({ roles: ["member"], platform: false, cached: false });
  findByUserAndTenant.mockResolvedValue({
    id: "m",
    tenantId: "tenant-a",
    userId: "user-1",
    email: null,
    role: "tenant_admin",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const { next, req } = await runMiddleware(
    request({
      authorization: "Bearer signed-token",
      "x-app-id": "DMS",
      "x-tenant-id": "tenant-a",
    })
  );
  expect(next).toHaveBeenCalledWith();
  expect(req.auth.roles).toEqual(["tenant_admin"]);
});

test("fails closed to member when the User Service is unreachable", async () => {
  resolveAppRoles.mockResolvedValue({ roles: [], platform: false, cached: false });
  const { next, req } = await runMiddleware(
    request({ authorization: "Bearer signed-token", "x-app-id": "DMS" })
  );
  expect(next).toHaveBeenCalledWith();
  expect(req.auth.roles).toEqual(["member"]);
});

test("links a federated user to a membership by email when their sub is unknown", async () => {
  // A partner user from another issuer has a different `sub`, so the
  // user-id lookup misses; DMS falls back to matching them by email.
  resolveAppRoles.mockResolvedValue({ roles: [], platform: false, cached: false });
  findByUserAndTenant.mockResolvedValue(null);
  findByEmailAndTenant.mockResolvedValue({
    id: "m",
    tenantId: "tenant-a",
    userId: "different-sub",
    email: "user@example.com",
    role: "tenant_admin",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const { next, req } = await runMiddleware(
    request({
      authorization: "Bearer signed-token",
      "x-app-id": "DMS",
      "x-tenant-id": "tenant-a",
    })
  );
  expect(findByEmailAndTenant).toHaveBeenCalledWith("user@example.com", "tenant-a");
  expect(next).toHaveBeenCalledWith();
  expect(req.auth.roles).toEqual(["tenant_admin"]);
});
