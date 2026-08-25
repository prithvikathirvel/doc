import { FolderService } from "../../service/folderService";
import { FolderMapService } from "../../service/folderMapService";
import { DocumentService } from "../../service/documentService";
import { PermissionService } from "../../service/permissionService";
import { StorageResolver } from "../../service/storageResolver";
import { AuthContext } from "../../service/models";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import {
  InMemoryDocumentRepository,
  InMemoryFolderRepository,
  InMemoryPermissionRepository,
  InMemoryTenantRepository,
  SilentAudit,
} from "../helpers/inMemory";
import { FakeStorageProvider } from "../../dao/fake/FakeStorageProvider";
import { storageRegistry } from "../../dao/dao";
import type { Tenant, TenantStorageConfig } from "../../service/models";
import { InMemoryFolderMapRepository } from "../helpers/inMemoryFolderMaps";
import {
  parsePathSegments,
  parseTemplate,
  resolveTemplate,
  templatePlaceholders,
} from "../../service/folderPaths";

const tenantAdmin: AuthContext = {
  userId: "jane",
  userName: "Jane",
  tenantId: "t-acme",
  roles: ["tenant_admin"],
};

const member: AuthContext = {
  userId: "carlos",
  userName: "Carlos",
  tenantId: "t-acme",
  roles: ["member"],
};

const outsider: AuthContext = {
  userId: "sam",
  userName: "Sam",
  tenantId: "t-other",
  roles: ["tenant_admin"],
};

describe("folder path utilities", () => {
  it("parses paths with or without a leading slash", () => {
    expect(parsePathSegments("submissions/org-123/form-456")).toEqual(["submissions", "org-123", "form-456"]);
    expect(parsePathSegments("/submissions/org-123/")).toEqual(["submissions", "org-123"]);
  });

  it("rejects traversal, empty segments, control characters and excessive depth", () => {
    expect(() => parsePathSegments("submissions/../branding")).toThrow(ValidationError);
    expect(() => parsePathSegments("submissions//form")).not.toThrow(); // empty segments are skipped
    expect(() => parsePathSegments("submissions/org\u0000")).toThrow(ValidationError);
    expect(() => parsePathSegments(new Array(20).fill("a").join("/"))).toThrow(ValidationError);
    expect(() => parsePathSegments("   ")).toThrow(ValidationError);
  });

  it("treats each template segment as a literal or exactly one placeholder", () => {
    expect(parseTemplate("submissions/{orgId}/{formId}").map((s) => s.type)).toEqual([
      "literal",
      "placeholder",
      "placeholder",
    ]);
    expect(templatePlaceholders("submissions/{orgId}/{formId}")).toEqual(["orgId", "formId"]);
    expect(() => parseTemplate("org-{orgId}")).toThrow(ValidationError);
    expect(() => parseTemplate("submissions/{bad name}")).toThrow(ValidationError);
  });

  it("resolves variables into exactly one validated segment each", () => {
    expect(resolveTemplate("submissions/{orgId}/{formId}", { orgId: "org-123", formId: "form-456" })).toBe(
      "submissions/org-123/form-456"
    );
    expect(() => resolveTemplate("submissions/{orgId}", { orgId: "a/b" })).toThrow(ValidationError);
    expect(() => resolveTemplate("submissions/{orgId}", { orgId: ".." })).toThrow(ValidationError);
    expect(() => resolveTemplate("submissions/{orgId}", {})).toThrow(ValidationError);
  });
});

describe("FolderService.ensurePath", () => {
  let folders: InMemoryFolderRepository;
  let service: FolderService;

  beforeEach(() => {
    folders = new InMemoryFolderRepository();
    service = new FolderService(folders, new SilentAudit());
  });

  it("creates every missing segment and reports creation", async () => {
    const { folder, created } = await service.ensurePath(tenantAdmin, "submissions/org-123/form-456");
    expect(created).toBe(true);
    expect(folder.path).toBe("/submissions/org-123/form-456");
    expect(folder.parentId).toBeTruthy();
  });

  it("is idempotent — the second call returns the same folder", async () => {
    const first = await service.ensurePath(tenantAdmin, "submissions/org-123");
    const second = await service.ensurePath(tenantAdmin, "submissions/org-123");
    expect(second.created).toBe(false);
    expect(second.folder.id).toBe(first.folder.id);
  });

  it("reuses existing parents instead of duplicating them", async () => {
    await service.ensurePath(tenantAdmin, "submissions/org-1");
    const { folder } = await service.ensurePath(tenantAdmin, "submissions/org-2");
    expect(folder.path).toBe("/submissions/org-2");
    const roots = await service.list(tenantAdmin, null);
    expect(roots).toHaveLength(1); // only "submissions"
  });

  it("scopes to the caller's tenant", async () => {
    await service.ensurePath(tenantAdmin, "submissions");
    const { folder } = await service.ensurePath(outsider, "submissions");
    expect(folder.tenantId).toBe("t-other");
    expect(await folders.list("t-acme", null)).toHaveLength(1);
    expect(await folders.list("t-other", null)).toHaveLength(1);
  });

  it("resolvePath never creates and 404s for unknown paths", async () => {
    await service.ensurePath(tenantAdmin, "branding/org-1");
    const folder = await service.resolvePath(tenantAdmin, "branding/org-1");
    expect(folder.path).toBe("/branding/org-1");
    await expect(service.resolvePath(tenantAdmin, "branding/nope")).rejects.toBeInstanceOf(NotFoundError);
    expect(await folders.list("t-acme", null)).toHaveLength(1);
  });
});

describe("FolderMapService", () => {
  let maps: InMemoryFolderMapRepository;
  let service: FolderMapService;

  beforeEach(() => {
    maps = new InMemoryFolderMapRepository();
    service = new FolderMapService(maps);
  });

  it("saves a set of maps and normalises keys to lowercase", async () => {
    const saved = await service.save(tenantAdmin, "t-acme", {
      maps: [
        { key: "Submissions", pathTemplate: "submissions/{orgId}/{formId}" },
        { key: "branding", pathTemplate: "branding/{orgId}" },
      ],
    });
    expect(saved.map((map) => map.key)).toEqual(["branding", "submissions"]);
    expect(saved[1].pathTemplate).toBe("submissions/{orgId}/{formId}");
  });

  it("rejects invalid keys, duplicate keys and invalid templates", async () => {
    await expect(
      service.save(tenantAdmin, "t-acme", { maps: [{ key: "Bad Key", pathTemplate: "a" }] })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.save(tenantAdmin, "t-acme", {
        maps: [
          { key: "a", pathTemplate: "x" },
          { key: "a", pathTemplate: "y" },
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.save(tenantAdmin, "t-acme", { maps: [{ key: "a", pathTemplate: "x/{bad name}" }] })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("replaces the set on PUT — removed keys disappear", async () => {
    await service.save(tenantAdmin, "t-acme", {
      maps: [
        { key: "keep", pathTemplate: "keep" },
        { key: "drop", pathTemplate: "drop" },
      ],
    });
    const saved = await service.save(tenantAdmin, "t-acme", { maps: [{ key: "keep", pathTemplate: "keep" }] });
    expect(saved.map((map) => map.key)).toEqual(["keep"]);
  });

  it("members read and resolve; only administrators write; outsiders neither", async () => {
    await service.save(tenantAdmin, "t-acme", {
      maps: [{ key: "submissions", pathTemplate: "submissions/{orgId}/{formId}" }],
    });
    await expect(service.list(member, "t-acme")).resolves.toHaveLength(1);
    await expect(
      service.resolvePath(member, "t-acme", "submissions", { orgId: "o", formId: "f" })
    ).resolves.toBe("submissions/o/f");

    await expect(service.save(member, "t-acme", { maps: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.list(outsider, "t-acme")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.resolvePath(outsider, "t-acme", "submissions", {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("unknown and disabled maps do not resolve", async () => {
    await service.save(tenantAdmin, "t-acme", {
      maps: [
        { key: "parked", pathTemplate: "signatures/{orgId}", status: "disabled" },
      ],
    });
    await expect(service.resolvePath(member, "t-acme", "nope", {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.resolvePath(member, "t-acme", "parked", { orgId: "o" })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe("document listing with metadata filters", () => {
  let documents: InMemoryDocumentRepository;
  let folders: InMemoryFolderRepository;
  let service: DocumentService;

  let tenants: InMemoryTenantRepository;

  beforeEach(async () => {
    tenants = new InMemoryTenantRepository();
    const fake = new FakeStorageProvider();
    storageRegistry.register("fake", () => fake);
    storageRegistry.register("s3", () => fake);
    tenants.tenants.set("t-acme", {
      id: "t-acme",
      name: "Acme",
      slug: "acme",
      status: "active",
      ownerName: null,
      ownerEmail: null,
      maxFileSizeBytes: 52428800,
      allowedMimeTypes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Tenant);
    tenants.configs.set("t-acme", {
      id: "cfg-1",
      tenantId: "t-acme",
      provider: "s3",
      container: "documents",
      useSsl: true,
      signedUrlTtlSeconds: 900,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TenantStorageConfig);
    documents = new InMemoryDocumentRepository();
    folders = new InMemoryFolderRepository();
    const permissions = new InMemoryPermissionRepository(documents.grants);
    service = new DocumentService(
      documents,
      folders,
      tenants,
      permissions,
      new SilentAudit(),
      new StorageResolver()
    );

    // Filed via the map-style flow: ensure the path, then upload with metadata.
    const folderService = new FolderService(folders, new SilentAudit());
    const sub = await folderService.ensurePath(tenantAdmin, "submissions/org-123/form-456");
    const brand = await folderService.ensurePath(tenantAdmin, "branding/org-123");

    await service.uploadDirect(tenantAdmin, {
      filename: "response-1.pdf",
      name: "Response 1",
      mimeType: "application/pdf",
      size: 100,
      folderId: sub.folder.id,
      metadata: { orgId: "org-123", formId: "form-456" },
      body: Buffer.alloc(10),
    });
    await service.uploadDirect(tenantAdmin, {
      filename: "response-2.pdf",
      name: "Response 2",
      mimeType: "application/pdf",
      size: 100,
      folderId: sub.folder.id,
      metadata: { orgId: "org-999", formId: "form-456" },
      body: Buffer.alloc(10),
    });
    await service.uploadDirect(tenantAdmin, {
      filename: "logo.png",
      name: "Logo",
      mimeType: "image/png",
      size: 100,
      folderId: brand.folder.id,
      metadata: { orgId: "org-123" },
      body: Buffer.alloc(10),
    });
  });

  it("filters by exact metadata matches", async () => {
    const byForm = await service.list(tenantAdmin, { metadata: { formId: "form-456" } });
    expect(byForm.items).toHaveLength(2);
    const byOrgAndForm = await service.list(tenantAdmin, {
      metadata: { orgId: "org-123", formId: "form-456" },
    });
    expect(byOrgAndForm.items.map((d) => d.name)).toEqual(["Response 1"]);
  });

  it("combines metadata filters with folder scoping", async () => {
    const folder = await new FolderService(folders, new SilentAudit()).resolvePath(
      tenantAdmin,
      "branding/org-123"
    );
    const result = await service.list(tenantAdmin, { folderId: folder.id, metadata: { formId: "form-456" } });
    expect(result.items).toHaveLength(0);
  });

  it("rejects invalid metadata keys", async () => {
    await expect(service.list(tenantAdmin, { metadata: { "bad key!": "x" } })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("metadata filters narrow, never widen, member visibility", async () => {
    const result = await service.list(member, { metadata: { formId: "form-456" } });
    expect(result.items).toHaveLength(0); // member created nothing
  });
});
