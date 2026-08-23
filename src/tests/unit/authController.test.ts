import { Request, Response } from "express";
import { login } from "../../controller/express/authController";
import { container } from "../../config/container";
import { verifyAccessToken } from "../../config/keycloak";

jest.mock("../../config/keycloak", () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock("../../config/container", () => ({
  container: {
    userManagementClient: { login: jest.fn() },
    roleResolver: { prime: jest.fn(), resolveAppRoles: jest.fn(), invalidate: jest.fn() },
    tenantMemberships: { listByUser: jest.fn(), findByUserAndTenant: jest.fn() },
    tenantRepository: { list: jest.fn(), findById: jest.fn() },
    tenantService: { provisionOwnerMemberships: jest.fn() },
  },
}));

const verify = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;
const userLogin = container.userManagementClient.login as jest.MockedFunction<
  typeof container.userManagementClient.login
>;
const prime = container.roleResolver.prime as jest.MockedFunction<typeof container.roleResolver.prime>;
const tenantRepositoryList = container.tenantRepository.list as jest.MockedFunction<
  typeof container.tenantRepository.list
>;
const tenantRepositoryFindById = container.tenantRepository.findById as jest.MockedFunction<
  typeof container.tenantRepository.findById
>;
const listByUser = container.tenantMemberships.listByUser as jest.MockedFunction<
  typeof container.tenantMemberships.listByUser
>;
const provisionOwnerMemberships = container.tenantService.provisionOwnerMemberships as jest.MockedFunction<
  typeof container.tenantService.provisionOwnerMemberships
>;

/**
 * Regression test for the login role bug: the User Service returns the role at
 * data.user.role.roleName. The old extractors missed it and returned `member`
 * for everyone. Login must now surface the real role and warm the resolver.
 */
const realLoginPayload = {
  data: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    idToken: "id-token",
    expiresIn: 300,
    user: {
      id: "d9a9113f-dc51-429e-96c6-413ee4ffd2c8",
      email: "prithvi.kathirvel@sifycorp.com",
      firstName: "Prithvi",
      lastName: "P K",
      username: "prithvi",
      role: { roleName: "Platform Admin", appId: "DMS", isActive: true },
    },
    app: { appId: "DMS", appName: "DMS", provider: "keycloak" },
  },
};

function buildRequest(body: unknown): Request {
  return { body } as Request;
}

beforeEach(() => {
  userLogin.mockReset();
  verify.mockReset();
  prime.mockReset();
  tenantRepositoryList.mockReset();
  listByUser.mockReset();
  provisionOwnerMemberships.mockReset();
  provisionOwnerMemberships.mockResolvedValue([]);
});

test("login resolves a Platform Admin from data.user.role and warms the resolver", async () => {
  userLogin.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    idToken: "id-token",
    expiresIn: 300,
    user: {
      userId: "d9a9113f-dc51-429e-96c6-413ee4ffd2c8",
      email: "prithvi.kathirvel@sifycorp.com",
      username: "prithvi",
    },
    raw: realLoginPayload,
  });
  verify.mockResolvedValue({
    sub: "d9a9113f-dc51-429e-96c6-413ee4ffd2c8",
    email: "prithvi.kathirvel@sifycorp.com",
    preferred_username: "prithvi",
    given_name: "Prithvi",
    family_name: "P K",
    exp: Math.floor(Date.now() / 1000) + 300,
    realm_access: { roles: ["default-roles-dms"] },
  } as never);
  tenantRepositoryList.mockResolvedValue([]);

  const res = {
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn();

  await login(buildRequest({ email: "x@y", password: "pw" }), res, next);

  expect(next).not.toHaveBeenCalled();
  const payload = (res.json as jest.Mock).mock.calls[0][0];
  expect(payload.role).toBe("platform_admin");
  expect(payload.roles).toEqual(["platform_admin"]);
  expect(prime).toHaveBeenCalledWith("d9a9113f-dc51-429e-96c6-413ee4ffd2c8", ["platform_admin"]);
});

test("login resolves a Member when that is the assigned role", async () => {
  userLogin.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 300,
    user: { userId: "u-member", email: "m@y", username: "m" },
    raw: { data: { user: { id: "u-member", role: { roleName: "Member" } } } },
  });
  verify.mockResolvedValue({
    sub: "u-member",
    preferred_username: "m",
    exp: Math.floor(Date.now() / 1000) + 300,
  } as never);
  listByUser.mockResolvedValue([]);

  const res = { json: jest.fn() } as unknown as Response;
  await login(buildRequest({ email: "m@y", password: "pw" }), res, jest.fn());

  const payload = (res.json as jest.Mock).mock.calls[0][0];
  expect(payload.role).toBe("member");
});

test("login auto-provisions the user as owner of a tenant whose owner_email matches", async () => {
  const tenantId = "t-owned";
  userLogin.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 300,
    user: { userId: "u-owner", email: "owner@acme.com", username: "owner" },
    raw: { data: { user: { id: "u-owner", role: { roleName: "Member" } } } },
  });
  verify.mockResolvedValue({
    sub: "u-owner",
    email: "owner@acme.com",
    preferred_username: "owner",
    exp: Math.floor(Date.now() / 1000) + 300,
  } as never);
  provisionOwnerMemberships.mockResolvedValue([
    {
      id: "m1",
      tenantId,
      userId: "u-owner",
      email: "owner@acme.com",
      role: "tenant_admin",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  listByUser.mockResolvedValue([
    {
      id: "m1",
      tenantId,
      userId: "u-owner",
      email: "owner@acme.com",
      role: "tenant_admin",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  tenantRepositoryFindById.mockResolvedValue({
    id: tenantId,
    name: "Acme",
    slug: "acme",
    status: "active",
    ownerName: null,
    ownerEmail: "owner@acme.com",
    maxFileSizeBytes: 52428800,
    allowedMimeTypes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = { json: jest.fn() } as unknown as Response;
  await login(buildRequest({ email: "owner@acme.com", password: "pw" }), res, jest.fn());

  expect(provisionOwnerMemberships).toHaveBeenCalledWith("u-owner", "owner@acme.com");
  const payload = (res.json as jest.Mock).mock.calls[0][0];
  expect(payload.tenants).toEqual([expect.objectContaining({ id: tenantId, role: "tenant_admin" })]);
});
