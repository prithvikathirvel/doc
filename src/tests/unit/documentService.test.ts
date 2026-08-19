import { DocumentService } from "../../service/documentService";
import { StorageResolver } from "../../service/storageResolver";
import { AuthContext, Tenant, TenantStorageConfig } from "../../service/models";
import { ForbiddenError, NotFoundError } from "../../utils/errors";
import { FakeStorageProvider } from "../../dao/fake/FakeStorageProvider";
import { storageRegistry } from "../../dao/dao";
import {
  InMemoryDocumentRepository,
  InMemoryFolderRepository,
  InMemoryPermissionRepository,
  InMemoryTenantRepository,
  SilentAudit,
} from "../helpers/inMemory";

describe("DocumentService with FakeStorageProvider", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const auth: AuthContext = {
    userId: "user-1",
    userName: "alice",
    tenantId,
    roles: ["tenant_admin"],
  };
  const otherAuth: AuthContext = {
    userId: "user-2",
    userName: "bob",
    tenantId,
    roles: [],
  };
  const otherTenantAuth: AuthContext = {
    userId: "user-3",
    userName: "eve",
    tenantId: "22222222-2222-2222-2222-222222222222",
    roles: ["tenant_admin"],
  };

  let service: DocumentService;
  let documents: InMemoryDocumentRepository;
  let tenants: InMemoryTenantRepository;
  let fake: FakeStorageProvider;

  beforeEach(() => {
    documents = new InMemoryDocumentRepository();
    const folders = new InMemoryFolderRepository();
    tenants = new InMemoryTenantRepository();
    const permissions = new InMemoryPermissionRepository();
    fake = new FakeStorageProvider();
    storageRegistry.register("fake", () => fake);
    const tenant: Tenant = {
      id: tenantId,
      name: "Acme",
      slug: "acme",
      status: "active",
      ownerName: "Alice Kumar",
      ownerEmail: "alice@acme.test",
      maxFileSizeBytes: 10_000_000,
      allowedMimeTypes: ["text/plain", "application/pdf"],
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
    // Force the resolver to use the fake adapter regardless of configured vendor name.
    storageRegistry.register("s3", () => fake);
    tenants.tenants.set(tenant.id, tenant);
    tenants.configs.set(tenant.id, config);
    service = new DocumentService(documents, folders, tenants, permissions, new SilentAudit(), new StorageResolver());
  });

  it("creates a document, proxy-uploads bytes, and downloads the same bytes", async () => {
    const document = await service.uploadDirect(auth, {
      filename: "notes.txt",
      mimeType: "text/plain",
      body: Buffer.from("hello world"),
    });
    expect(document.status).toBe("active");
    expect(document.tenantId).toBe(tenantId);
    expect(document.storageKey).toContain(tenantId);
    expect(document.currentVersion).toBe(1);

    const streamed = await service.streamDownload(auth, document.id);
    const chunks: Buffer[] = [];
    for await (const chunk of streamed.download.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe("hello world");
  });

  it("replays an idempotent create instead of inserting a duplicate", async () => {
    const first = await service.createUploadSession(auth, {
      filename: "a.txt",
      mimeType: "text/plain",
      idempotencyKey: "job-99",
    });
    const second = await service.createUploadSession(auth, {
      filename: "a.txt",
      mimeType: "text/plain",
      idempotencyKey: "job-99",
    });
    expect(second.replayed).toBe(true);
    expect(second.document.id).toBe(first.document.id);
  });

  it("soft-deletes, hides from default get, and restores", async () => {
    const document = await service.uploadDirect(auth, {
      filename: "gone.txt",
      mimeType: "text/plain",
      body: Buffer.from("x"),
    });
    await service.softDelete(auth, document.id);
    await expect(service.get(auth, document.id)).rejects.toBeInstanceOf(NotFoundError);
    const restored = await service.restore(auth, document.id);
    expect(restored.status).toBe("active");
  });

  it("creates a new DMS version with a new storage key", async () => {
    const document = await service.uploadDirect(auth, {
      filename: "v.txt",
      mimeType: "text/plain",
      body: Buffer.from("v1"),
    });
    const v2 = await service.uploadNewVersion(auth, document.id, {
      filename: "v.txt",
      mimeType: "text/plain",
      body: Buffer.from("v2"),
    });
    expect(v2.currentVersion).toBe(2);
    expect(v2.storageKey).not.toBe(document.storageKey);
    const versions = await service.listVersions(auth, document.id);
    expect(versions).toHaveLength(2);
  });

  it("isolates tenants — another tenant cannot read the document", async () => {
    const document = await service.uploadDirect(auth, {
      filename: "secret.txt",
      mimeType: "text/plain",
      body: Buffer.from("nope"),
    });
    await expect(service.get(otherTenantAuth, document.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces document permissions for non-owners", async () => {
    const document = await service.uploadDirect(auth, {
      filename: "locked.txt",
      mimeType: "text/plain",
      body: Buffer.from("private"),
    });
    await expect(service.get(otherAuth, document.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects disallowed MIME types", async () => {
    await expect(
      service.createUploadSession(auth, { filename: "x.exe", mimeType: "application/x-msdownload", size: 10 })
    ).rejects.toThrow(/MIME type/);
  });
});
