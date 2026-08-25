import { DocumentService } from "../../service/documentService";
import { FolderService } from "../../service/folderService";
import { StorageResolver } from "../../service/storageResolver";
import { AuthContext, Tenant, TenantStorageConfig } from "../../service/models";
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

const auth: AuthContext = {
  userId: "app-backend",
  userName: "App",
  tenantId,
  roles: ["tenant_admin"],
};

/**
 * Reproduces the reported flow: a document uploaded first WITHOUT a folder
 * (idempotencyKey reused from an earlier attempt), then re-requested with
 * folderPath. The replay must re-file the document into the requested folder.
 */
describe("idempotent replay re-files into the requested folder", () => {
  let documents: InMemoryDocumentRepository;
  let folders: InMemoryFolderRepository;
  let service: DocumentService;

  beforeEach(() => {
    const fake = new FakeStorageProvider();
    storageRegistry.register("fake", () => fake);
    storageRegistry.register("s3", () => fake);
    const tenants = new InMemoryTenantRepository();
    documents = new InMemoryDocumentRepository();
    folders = new InMemoryFolderRepository();
    tenants.tenants.set(tenantId, {
      id: tenantId,
      name: "Sify Forms",
      slug: "sify-forms",
      status: "active",
      ownerName: null,
      ownerEmail: null,
      maxFileSizeBytes: 10_000_000,
      allowedMimeTypes: null,
      versioningEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Tenant);
    tenants.configs.set(tenantId, {
      id: "cfg-1",
      tenantId,
      provider: "s3",
      container: "documents",
      useSsl: true,
      signedUrlTtlSeconds: 900,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TenantStorageConfig);
    service = new DocumentService(
      documents,
      folders,
      tenants,
      new InMemoryPermissionRepository(documents.grants),
      new SilentAudit(),
      new StorageResolver()
    );
  });

  it("moves the replayed document when the retry names a folder", async () => {
    // Step 1 (the earlier attempt): created at the root with a key.
    const first = await service.uploadDirect(auth, {
      filename: "Quiz.json",
      mimeType: "application/json",
      name: "Quiz",
      size: 10,
      idempotencyKey: "xxxx",
      body: Buffer.alloc(10),
    });
    expect(first.folderId).toBeNull();

    // Step 2 (the reported request): same key, but now filed via a path.
    const { folder } = await new FolderService(folders, new SilentAudit()).ensurePath(
      auth,
      "submissions/org-123/form-456"
    );
    const replay = await service.createUploadSession(auth, {
      filename: "Quiz.json",
      mimeType: "application/json",
      name: "Quiz",
      size: 10,
      idempotencyKey: "xxxx",
      folderId: folder.id,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.document.id).toBe(first.id);
    expect(replay.document.folderId).toBe(folder.id);

    // The persisted document itself is re-filed, not just the response.
    const stored = await documents.findById(tenantId, first.id, true);
    expect(stored?.folderId).toBe(folder.id);

    // Listing by path now finds it.
    const inFolder = await service.list(auth, { folderId: folder.id });
    expect(inFolder.items.map((d) => d.name)).toEqual(["Quiz"]);
  });

  it("applies the retry's metadata tags to the replayed document", async () => {
    const first = await service.uploadDirect(auth, {
      filename: "c.json",
      mimeType: "application/json",
      name: "C",
      size: 5,
      idempotencyKey: "meta-key",
      body: Buffer.alloc(5),
    });
    expect(first.metadata).toEqual({});

    const replay = await service.createUploadSession(auth, {
      filename: "c.json",
      mimeType: "application/json",
      name: "C",
      size: 5,
      idempotencyKey: "meta-key",
      metadata: { orgId: "org-123", formId: "form-456" },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.document.metadata).toEqual({ orgId: "org-123", formId: "form-456" });

    const stored = await documents.findById(tenantId, first.id, true);
    expect(stored?.metadata).toEqual({ orgId: "org-123", formId: "form-456" });
  });

  it("re-filing on replay is a no-op when the folder is unchanged", async () => {
    const { folder } = await new FolderService(folders, new SilentAudit()).ensurePath(
      auth,
      "submissions/org-1"
    );
    const first = await service.uploadDirect(auth, {
      filename: "a.txt",
      mimeType: "text/plain",
      name: "A",
      size: 5,
      idempotencyKey: "same-folder",
      folderId: folder.id,
      body: Buffer.alloc(5),
    });
    const replay = await service.createUploadSession(auth, {
      filename: "a.txt",
      mimeType: "text/plain",
      name: "A",
      size: 5,
      idempotencyKey: "same-folder",
      folderId: folder.id,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.document.updatedAt.getTime()).toBe(first.updatedAt.getTime());
  });

  it("completing the upload of a trashed document yields a consistent active record", async () => {
    const doc = await service.uploadDirect(auth, {
      filename: "b.txt",
      mimeType: "text/plain",
      name: "B",
      size: 5,
      idempotencyKey: "resurrect",
      body: Buffer.alloc(5),
    });
    await service.softDelete(auth, doc.id);

    // replay + confirm, exactly like the reported flow
    const replay = await service.createUploadSession(auth, {
      filename: "b.txt",
      mimeType: "text/plain",
      name: "B",
      size: 5,
      idempotencyKey: "resurrect",
    });
    expect(replay.replayed).toBe(true);

    const completed = await service.completeUpload(auth, replay.document.id, { size: 5 });
    expect(completed.status).toBe("active");
    expect(completed.deletedAt).toBeNull();
  });
});
