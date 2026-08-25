import { TenantService } from "../../service/tenantService";
import { DocumentService } from "../../service/documentService";
import { StorageResolver } from "../../service/storageResolver";
import { AuthContext, Tenant, TenantStorageConfig } from "../../service/models";
import { ForbiddenError } from "../../utils/errors";
import { FakeStorageProvider } from "../../dao/fake/FakeStorageProvider";
import { storageRegistry } from "../../dao/dao";
import {
  InMemoryDocumentRepository,
  InMemoryFolderRepository,
  InMemoryPermissionRepository,
  InMemoryTenantRepository,
  SilentAudit,
} from "../helpers/inMemory";

const tenantId = "t-forms";

const platformAdmin: AuthContext = {
  userId: "root",
  userName: "Root",
  tenantId: "",
  roles: ["platform_admin"],
};

const tenantAdmin: AuthContext = {
  userId: "jane",
  userName: "Jane",
  tenantId,
  roles: ["tenant_admin"],
};

describe("per-tenant document versioning", () => {
  let tenants: InMemoryTenantRepository;
  let documents: InMemoryDocumentRepository;
  let documentService: DocumentService;

  const seedTenant = async (versioningEnabled: boolean) => {
    const fake = new FakeStorageProvider();
    storageRegistry.register("fake", () => fake);
    storageRegistry.register("s3", () => fake);
    tenants = new InMemoryTenantRepository();
    documents = new InMemoryDocumentRepository();
    const folders = new InMemoryFolderRepository();
    const permissions = new InMemoryPermissionRepository(documents.grants);
    const tenant: Tenant = {
      id: tenantId,
      name: "Sify Forms",
      slug: "sify-forms",
      status: "active",
      ownerName: null,
      ownerEmail: null,
      maxFileSizeBytes: 10_000_000,
      allowedMimeTypes: ["text/plain", "application/pdf"],
      versioningEnabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const config: TenantStorageConfig = {
      id: "cfg-1",
      tenantId,
      provider: "s3",
      container: "documents",
      useSsl: true,
      signedUrlTtlSeconds: 900,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tenants.tenants.set(tenantId, tenant);
    tenants.configs.set(tenantId, config);
    documentService = new DocumentService(
      documents,
      folders,
      tenants,
      permissions,
      new SilentAudit(),
      new StorageResolver()
    );
    return tenants;
  };

  it("defaults to enabled and can be set at creation", async () => {
    const service = new TenantService(new InMemoryTenantRepository(), new StorageResolver());
    const withDefault = await service.create(platformAdmin, { name: "Acme" });
    expect(withDefault.tenant.versioningEnabled).toBe(true);

    const disabled = await service.create(platformAdmin, { name: "Northwind", versioningEnabled: false });
    expect(disabled.tenant.versioningEnabled).toBe(false);
  });

  it("only platform administrators can change the flag", async () => {
    await seedTenant(true);
    const service = new TenantService(tenants, new StorageResolver());

    await expect(
      service.update(tenantAdmin, tenantId, { versioningEnabled: false })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const updated = await service.update(platformAdmin, tenantId, { versioningEnabled: false });
    expect(updated.versioningEnabled).toBe(false);
  });

  it("rejects new versions on a versioning-disabled workspace but keeps v1 working", async () => {
    await seedTenant(false);

    const first = await documentService.uploadDirect(tenantAdmin, {
      filename: "response-1.pdf",
      mimeType: "application/pdf",
      name: "Response 1",
      size: 100,
      body: Buffer.alloc(10),
    });
    expect(first.currentVersion).toBe(1);
    expect(first.status).toBe("active");

    await expect(
      documentService.uploadNewVersion(tenantAdmin, first.id, {
        filename: "response-1.pdf",
        mimeType: "application/pdf",
        size: 120,
        body: Buffer.alloc(12),
      })
    ).rejects.toMatchObject({
      constructor: ForbiddenError,
      code: "VERSIONING_DISABLED",
    });

    // read paths are unaffected
    const versions = await documentService.listVersions(tenantAdmin, first.id);
    expect(versions).toHaveLength(1);

    // enabling again restores versioning
    const tenant = await tenants.findById(tenantId);
    if (!tenant) throw new Error("tenant missing");
    tenant.versioningEnabled = true;
    await tenants.update(tenant);
    const second = await documentService.uploadNewVersion(tenantAdmin, first.id, {
      filename: "response-1.pdf",
      mimeType: "application/pdf",
      size: 120,
      body: Buffer.alloc(12),
    });
    expect(second.currentVersion).toBe(2);
  });

  it("versioning stays available on an enabled workspace", async () => {
    await seedTenant(true);
    const first = await documentService.uploadDirect(tenantAdmin, {
      filename: "notes.txt",
      mimeType: "text/plain",
      name: "Notes",
      size: 10,
      body: Buffer.alloc(5),
    });
    const second = await documentService.uploadNewVersion(tenantAdmin, first.id, {
      filename: "notes.txt",
      mimeType: "text/plain",
      size: 20,
      body: Buffer.alloc(8),
    });
    expect(second.currentVersion).toBe(2);
  });
});
