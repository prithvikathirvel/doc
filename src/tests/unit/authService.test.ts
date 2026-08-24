import jwt from "jsonwebtoken";
import { AuthService, hashKey } from "../../auth/authService";
import { AuthResolver } from "../../auth/resolver";
import { DevIdentityProvider } from "../../auth/identityProviders";
import { HmacTokenVerifier } from "../../auth/tokenVerifier";
import { InMemoryDirectoryRepository, InMemoryLegacyActivityClaimer } from "../helpers/inMemoryDirectory";
import {
  InMemoryDocumentRepository,
  InMemoryFolderRepository,
  InMemoryPermissionRepository,
} from "../helpers/inMemory";
import { ForbiddenError, UnauthorizedError, ConflictError } from "../../utils/errors";
import type { AuthContext } from "../../service/models";

const SECRET = "test-secret";

function setup() {
  const directory = new InMemoryDirectoryRepository();
  const documents = new InMemoryDocumentRepository();
  const folders = new InMemoryFolderRepository(documents);
  const permissions = new InMemoryPermissionRepository(documents.grants);
  const claimer = new InMemoryLegacyActivityClaimer({
    documents,
    versions: documents.versions,
    folders,
    grants: documents.grants,
  });
  const idp = new DevIdentityProvider(SECRET, [
    {
      userId: "11111111-1111-4111-8111-111111111111",
      email: "root@platform.io",
      username: "root",
      displayName: "Root Admin",
      password: "password-1",
      isPlatformAdmin: false, // granted through DMS_PLATFORM_ADMINS below
    },
    {
      userId: "22222222-2222-4222-8222-222222222222",
      email: "jane@acme.com",
      username: "jane",
      displayName: "Jane Doe",
      password: "password-1",
      isPlatformAdmin: false,
    },
  ]);
  const verifier = new HmacTokenVerifier(SECRET);
  const service = new AuthService(directory, idp, verifier, claimer);
  const resolver = new AuthResolver(verifier, directory);
  return { directory, documents, folders, permissions, idp, verifier, service, resolver };
}

const TENANT_A = "aaaaaaaa-0000-4000-8000-000000000001";

async function seedTenant(directory: InMemoryDirectoryRepository): Promise<void> {
  directory.tenants.set(TENANT_A, { name: "Acme", slug: "acme", status: "active" });
}

function cookieHeader(token: string): string {
  return `dms_at=${token}`;
}

function mockReq(headers: Record<string, string>, method = "GET") {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  return {
    method,
    headers: lower,
    header(name: string) {
      return lower[name.toLowerCase()];
    },
    protocol: "http",
  } as unknown as import("express").Request;
}

describe("AuthService login", () => {
  it("issues a session with memberships resolved from the local directory", async () => {
    const { directory, service } = setup();
    await seedTenant(directory);
    const login = await service.login("root@platform.io", "password-1");
    expect(login.session.user.email).toBe("root@platform.io");
    expect(login.session.memberships).toEqual([]);
    expect(login.tokens.expiresIn).toBeGreaterThan(0);

    await directory.upsertUser({
      userId: "22222222-2222-4222-8222-222222222222",
      email: "jane@acme.com",
      username: "jane",
      displayName: "Jane Doe",
    });
    await directory.addMembership({
      tenantId: TENANT_A,
      userId: "22222222-2222-4222-8222-222222222222",
      role: "tenant_admin",
      createdBy: "root",
    });
    const janeLogin = await service.login("jane@acme.com", "password-1");
    expect(janeLogin.session.memberships).toHaveLength(1);
    expect(janeLogin.session.memberships[0]).toMatchObject({ slug: "acme", role: "tenant_admin" });
  });

  it("rejects wrong credentials", async () => {
    const { service } = setup();
    await expect(service.login("root@platform.io", "wrong")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("maps 'already registered' from the identity provider to a clean conflict", async () => {
    const { service } = setup();
    // The account exists in the provider (seeded in setup).
    const error = await service
      .signup({ email: "root@platform.io", password: "password-1", username: "root" })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as { code?: string }).code).toBe("EMAIL_TAKEN");
  });

  it("reports identity-provider outages as 502, not as an internal error", async () => {
    const { HmacTokenVerifier: V } = await import("../../auth/tokenVerifier");
    const failing = {
      name: "failing",
      login: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED 1.6.37.35:80"), { statusCode: 502 });
      },
      signup: async () => {
        throw Object.assign(new Error("upstream exploded"), { statusCode: 500 });
      },
      refresh: async () => {
        throw new Error("not used");
      },
      logout: async () => undefined,
    } as unknown as import("../../auth/ports").IdentityProvider;
    const { AuthService: S } = await import("../../auth/authService");
    const { InMemoryDirectoryRepository: D } = await import("../helpers/inMemoryDirectory");
    const service = new S(new D(), failing, new V(SECRET), {
      claim: async () => ({ documents: 0, versions: 0, folders: 0, permissions: 0 }),
    });
    const signupError = await service.signup({ email: "x@y.io", password: "password-1" }).catch((e: unknown) => e);
    expect((signupError as { statusCode?: number }).statusCode).toBe(502);
    expect((signupError as { code?: string }).code).toBe("IDP_UNAVAILABLE");
    const loginError = await service.login("x@y.io", "password-1").catch((e: unknown) => e);
    expect((loginError as { statusCode?: number }).statusCode).toBe(502);
  });

  it("persists the platform admin flag from DMS_PLATFORM_ADMINS on first login", async () => {
    const original = process.env.DMS_PLATFORM_ADMINS;
    process.env.DMS_PLATFORM_ADMINS = "root@platform.io";
    jest.resetModules();
    // settings is read at module load; re-import the whole stack to pick it up.
    const { AuthService: FreshAuthService } = await import("../../auth/authService");
    const { DevIdentityProvider: FreshIdp } = await import("../../auth/identityProviders");
    const { HmacTokenVerifier: FreshVerifier } = await import("../../auth/tokenVerifier");
    const { InMemoryDirectoryRepository: FreshDirectory } = await import("../helpers/inMemoryDirectory");
    const { InMemoryLegacyActivityClaimer: FreshClaimer } = await import("../helpers/inMemoryDirectory");
    const freshDocuments = new (await import("../helpers/inMemory")).InMemoryDocumentRepository();
    const freshFolders = new (await import("../helpers/inMemory")).InMemoryFolderRepository(freshDocuments);
    const freshDirectory = new FreshDirectory();
    const freshIdp = new FreshIdp(SECRET, [
      {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "root@platform.io",
        username: "root",
        displayName: "Root Admin",
        password: "password-1",
        isPlatformAdmin: false,
      },
    ]);
    const service = new FreshAuthService(
      freshDirectory,
      freshIdp,
      new FreshVerifier(SECRET),
      new FreshClaimer({
        documents: freshDocuments,
        versions: freshDocuments.versions,
        folders: freshFolders,
        grants: freshDocuments.grants,
      })
    );
    const login = await service.login("root@platform.io", "password-1");
    expect(login.session.isPlatformAdmin).toBe(true);
    expect((await freshDirectory.findUserByEmail("root@platform.io"))?.isPlatformAdmin).toBe(true);
    if (original === undefined) delete process.env.DMS_PLATFORM_ADMINS;
    else process.env.DMS_PLATFORM_ADMINS = original;
  });
});

describe("AuthService membership + legacy claiming", () => {
  const platformAuth: AuthContext = {
    userId: "root@platform.io",
    userName: "Root Admin",
    tenantId: "",
    roles: ["platform_admin"],
  };

  it("claims documents uploaded earlier under a legacy x-user-id", async () => {
    const { directory, documents, service } = setup();
    await seedTenant(directory);

    // Machine client uploaded documents under a raw email x-user-id.
    await documents.create({
      id: "d1",
      tenantId: TENANT_A,
      folderId: null,
      name: "imported.pdf",
      originalFilename: "imported.pdf",
      mimeType: "application/pdf",
      size: 10,
      checksum: null,
      storageProvider: "minio",
      storageContainer: "docs",
      storageKey: "k1",
      currentVersion: 1,
      status: "active",
      createdBy: "legacy.worker@acme.com",
      updatedBy: "legacy.worker@acme.com",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      idempotencyKey: null,
      metadata: {},
    });

    // The person behind that legacy id signs up, then is attached with claimAliases.
    await service.signup({ email: "worker@acme.com", password: "password-1", username: "worker" });
    const workerLogin = await service.login("worker@acme.com", "password-1");
    const workerId = workerLogin.session.user.userId;

    const result = await service.addMember(platformAuth, TENANT_A, {
      userId: workerId,
      role: "member",
      claimAliases: ["legacy.worker@acme.com"],
    });
    expect(result.claimed.documents).toBe(1);

    const stored = await documents.findById(TENANT_A, "d1");
    expect(stored?.createdBy).toBe(workerId);

    // The member now sees the document in their member view.
    const memberAuth: AuthContext = { userId: workerId, userName: "Worker", tenantId: TENANT_A, roles: ["member"] };
    const visible = await documents.list({
      tenantId: TENANT_A,
      visibleTo: { userId: memberAuth.userId, roles: memberAuth.roles },
    });
    expect(visible.items).toHaveLength(1);
  });

  it("refuses membership management for plain members", async () => {
    const { directory, service } = setup();
    await seedTenant(directory);
    await directory.upsertUser({
      userId: "33333333-3333-4333-8333-333333333333",
      email: "carlos@acme.com",
      username: "carlos",
      displayName: "Carlos",
    });
    const memberAuth: AuthContext = {
      userId: "33333333-3333-4333-8333-333333333333",
      userName: "Carlos",
      tenantId: TENANT_A,
      roles: ["member"],
    };
    await expect(
      service.addMember(memberAuth, TENANT_A, { email: "jane@acme.com", role: "member" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates a user, links it and attaches it to a workspace in one step", async () => {
    const { directory, service } = setup();
    await seedTenant(directory);
    const result = await service.createUser(platformAuth, {
      email: "new.person@acme.com",
      password: "password-1",
      firstName: "New",
      lastName: "Person",
      tenantId: TENANT_A,
      role: "member",
    });
    expect(result.member?.membership.tenantId).toBe(TENANT_A);
    expect(result.member?.user.email).toBe("new.person@acme.com");
    expect(directory.findUserByEmail("new.person@acme.com")).resolves.toMatchObject({
      email: "new.person@acme.com",
    });
  });
});

describe("AuthResolver", () => {
  it("resolves a cookie session to the directory role and enforces tenant membership", async () => {
    const { directory, service, resolver } = setup();
    await seedTenant(directory);
    const login = await service.login("jane@acme.com", "password-1");
    const token = login.tokens.accessToken;

    // Before any membership: requests that need a tenant context are rejected
    // with a code the UI can answer with the workspace picker.
    await expect(resolver.resolve(mockReq({ cookie: cookieHeader(token) }))).rejects.toMatchObject({
      code: "TENANT_REQUIRED",
    });

    // With a membership: single-tenant users get it automatically.
    await directory.addMembership({
      tenantId: TENANT_A,
      userId: "22222222-2222-4222-8222-222222222222",
      role: "tenant_admin",
      createdBy: "root",
    });
    const resolved = await resolver.resolve(mockReq({ cookie: cookieHeader(token) }));
    expect(resolved.userId).toBe("22222222-2222-4222-8222-222222222222");
    expect(resolved.scheme).toBe("ui_session");
    expect(resolved.tenantId).toBe(TENANT_A);
    expect(resolved.roles).toEqual(["tenant_admin"]);

    // Requesting a tenant the user does not belong to is rejected.
    directory.tenants.set("bbbbbbbb-0000-4000-8000-000000000002", {
      name: "Other",
      slug: "other",
      status: "active",
    });
    await expect(
      resolver.resolve(
        mockReq({ cookie: cookieHeader(token), "x-tenant-id": "bbbbbbbb-0000-4000-8000-000000000002" })
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects garbage tokens instead of decoding them", async () => {
    const { resolver } = setup();
    const forged = jwt.sign({ sub: "nobody", roles: ["platform_admin"] }, "not-the-secret", {
      algorithm: "HS256",
    });
    await expect(resolver.resolve(mockReq({ idtoken: forged }))).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(resolver.resolve(mockReq({ idtoken: "garbage" }))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("authenticates API keys with their own scope and roles", async () => {
    const { directory, resolver, service } = setup();
    await seedTenant(directory);
    // Bootstrap a platform admin via login + env-style flag.
    await service.login("root@platform.io", "password-1");
    const admin = await directory.findUserByEmail("root@platform.io");
    if (admin) await directory.setPlatformAdmin(admin.userId, true);

    const adminAuth: AuthContext = {
      userId: "root@platform.io",
      userName: "Root",
      tenantId: "",
      roles: ["platform_admin"],
    };
    const created = await service.createApiKey(adminAuth, {
      displayName: "acme importer",
      tenantId: TENANT_A,
      roles: ["tenant_admin"],
    });
    const auth = await resolver.resolve(mockReq({ "x-api-key": created.key }, "POST"));
    expect(auth.scheme).toBe("api_key");
    expect(auth.tenantId).toBe(TENANT_A);
    expect(auth.roles).toEqual(["tenant_admin"]);

    // The key cannot be used against another tenant.
    await expect(
      resolver.resolve(
        mockReq(
          { "x-api-key": created.key, "x-tenant-id": "bbbbbbbb-0000-4000-8000-000000000002" },
          "POST"
        )
      )
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Only the hash is stored.
    expect(created.apiKey).not.toHaveProperty("keyHash");
    expect(hashKey(created.key)).toHaveLength(64);
  });
});
