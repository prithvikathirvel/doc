import { TenantService } from "../../service/tenantService";
import { StorageResolver } from "../../service/storageResolver";
import { AuthContext } from "../../service/models";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { InMemoryTenantRepository } from "../helpers/inMemory";
import { AnalyticsRepository } from "../../service/ports";

const stubAnalytics: AnalyticsRepository = {
  tenantAnalytics: jest.fn(),
  tenantUsers: jest.fn(async () => [
    {
      userId: "jane@acme.com",
      isOwner: true,
      documents: 2,
      activeDocuments: 2,
      trashedDocuments: 0,
      bytes: 2048,
      versions: 3,
      sharedWithThem: 0,
      firstActivityAt: null,
      lastActivityAt: null,
    },
  ]),
};

const platformAdmin: AuthContext = {
  userId: "root",
  userName: "Root",
  tenantId: "",
  roles: ["platform_admin"],
};

describe("TenantService", () => {
  let tenants: InMemoryTenantRepository;
  let service: TenantService;

  beforeEach(() => {
    tenants = new InMemoryTenantRepository();
    service = new TenantService(tenants, new StorageResolver(), stubAnalytics);
  });

  const baseInput = {
    name: "Acme Corporation",
    ownerName: "Jane Doe",
    ownerEmail: "Jane@Acme.com",
  };

  it("onboards a tenant with a derived slug and normalised owner email", async () => {
    const { tenant, storage } = await service.create(platformAdmin, baseInput);
    expect(tenant.slug).toBe("acme-corporation");
    expect(tenant.ownerEmail).toBe("jane@acme.com");
    expect(tenant.maxFileSizeBytes).toBe(50 * 1024 * 1024);
    expect(storage).toBeNull();
  });

  it("attaches storage in the same call and validates it first", async () => {
    const { tenant, storage } = await service.create(platformAdmin, {
      ...baseInput,
      slug: "acme",
      storage: {
        provider: "minio",
        container: "documents",
        endpoint: "https://minio.internal:9000",
        accessKeyRef: "MINIO_ACCESS_KEY",
        secretKeyRef: "MINIO_SECRET_KEY",
      },
    });
    expect(storage?.provider).toBe("minio");
    expect(storage?.tenantId).toBe(tenant.id);

    await expect(
      service.create(platformAdmin, {
        name: "Broken Co",
        ownerEmail: "ops@broken.co",
        storage: { provider: "s3", container: "broken-documents" },
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await tenants.findBySlug("broken-co")).toBeNull();
  });

  it("rejects duplicate slugs and non platform admins", async () => {
    await service.create(platformAdmin, { ...baseInput, slug: "acme" });
    await expect(service.create(platformAdmin, { name: "Acme", slug: "acme" })).rejects.toBeInstanceOf(
      ConflictError
    );
    const tenantAdmin: AuthContext = {
      userId: "jane",
      userName: "Jane",
      tenantId: "t1",
      roles: ["tenant_admin"],
    };
    await expect(service.create(tenantAdmin, { name: "Other" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("validates limits and MIME types", async () => {
    await expect(
      service.create(platformAdmin, { ...baseInput, maxFileSizeBytes: 10 })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.create(platformAdmin, { ...baseInput, allowedMimeTypes: ["not-a-mime"] })
    ).rejects.toBeInstanceOf(ValidationError);
    const { tenant } = await service.create(platformAdmin, {
      ...baseInput,
      allowedMimeTypes: ["application/PDF", "application/pdf", "image/png"],
    });
    expect(tenant.allowedMimeTypes).toEqual(["application/pdf", "image/png"]);
  });

  it("keeps tenants isolated from each other", async () => {
    const { tenant } = await service.create(platformAdmin, { ...baseInput, slug: "acme" });
    const outsider: AuthContext = {
      userId: "sam",
      userName: "Sam",
      tenantId: "another-tenant",
      roles: ["tenant_admin"],
    };
    await expect(service.getForAuth(outsider, tenant.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getForAuth(platformAdmin, tenant.id)).resolves.toMatchObject({ id: tenant.id });
  });

  it("restricts analytics to administrators", async () => {
    const { tenant } = await service.create(platformAdmin, { ...baseInput, slug: "acme" });
    const member: AuthContext = {
      userId: "carlos",
      userName: "Carlos",
      tenantId: tenant.id,
      roles: ["member"],
    };
    await expect(service.getAnalytics(member, tenant.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists workspace users for administrators only", async () => {
    const { tenant } = await service.create(platformAdmin, { ...baseInput, slug: "acme" });
    const admin: AuthContext = {
      userId: "jane@acme.com",
      userName: "Jane",
      tenantId: tenant.id,
      roles: ["tenant_admin"],
    };
    const member: AuthContext = { ...admin, userId: "carlos@acme.com", roles: ["member"] };

    await expect(service.listUsers(admin, tenant.id)).resolves.toHaveLength(1);
    await expect(service.listUsers(member, tenant.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("resolves a workspace by slug or id and grants the owner administrator rights", async () => {
    const { tenant } = await service.create(platformAdmin, { ...baseInput, slug: "acme" });

    const bySlug = await service.resolveWorkspace("Acme", "jane@acme.com");
    expect(bySlug.workspace.id).toBe(tenant.id);
    expect(bySlug.roles).toEqual(["tenant_admin"]);

    const byId = await service.resolveWorkspace(tenant.id, "carlos@acme.com");
    expect(byId.roles).toEqual(["member"]);

    await expect(service.resolveWorkspace("unknown-workspace")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates profile fields and restricts status changes to platform admins", async () => {
    const { tenant } = await service.create(platformAdmin, { ...baseInput, slug: "acme" });
    const tenantAdmin: AuthContext = {
      userId: "jane",
      userName: "Jane",
      tenantId: tenant.id,
      roles: ["tenant_admin"],
    };

    const updated = await service.update(tenantAdmin, tenant.id, { name: "Acme Group" });
    expect(updated.name).toBe("Acme Group");

    await expect(
      service.update(tenantAdmin, tenant.id, { status: "suspended" })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const suspended = await service.update(platformAdmin, tenant.id, { status: "suspended" });
    expect(suspended.status).toBe("suspended");
  });
});
