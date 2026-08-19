import { PermissionService } from "../../service/permissionService";
import { AuthContext, Document } from "../../service/models";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { InMemoryDocumentRepository, InMemoryPermissionRepository } from "../helpers/inMemory";

const tenantId = "11111111-1111-1111-1111-111111111111";

function makeDocument(): Document {
  const now = new Date();
  return {
    id: "doc-1",
    tenantId,
    folderId: null,
    name: "Master service agreement",
    originalFilename: "msa.pdf",
    mimeType: "application/pdf",
    size: 2048,
    checksum: null,
    storageProvider: "fake",
    storageContainer: "documents",
    storageKey: "documents/doc-1/v1/msa.pdf",
    currentVersion: 1,
    status: "active",
    createdBy: "alice",
    updatedBy: "alice",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    idempotencyKey: null,
    metadata: {},
  };
}

const alice: AuthContext = { userId: "alice", userName: "Alice", tenantId, roles: ["member"] };
const bob: AuthContext = { userId: "bob", userName: "Bob", tenantId, roles: ["member"] };
const admin: AuthContext = { userId: "ops", userName: "Ops", tenantId, roles: ["tenant_admin"] };

describe("PermissionService", () => {
  let documents: InMemoryDocumentRepository;
  let permissions: InMemoryPermissionRepository;
  let service: PermissionService;

  beforeEach(async () => {
    documents = new InMemoryDocumentRepository();
    permissions = new InMemoryPermissionRepository(documents.grants);
    service = new PermissionService(documents, permissions);
    await documents.create(makeDocument());
  });

  it("grants access by level and reports it back", async () => {
    const { permission, created } = await service.grant(alice, "doc-1", {
      principalType: "user",
      principalId: "bob",
      level: "contributor",
    });
    expect(created).toBe(true);
    expect(permission).toMatchObject({
      level: "contributor",
      canRead: true,
      canWrite: true,
      canDelete: false,
      canAdmin: false,
    });
  });

  it("updates an existing grant in place instead of creating a duplicate", async () => {
    await service.grant(alice, "doc-1", { principalType: "user", principalId: "bob", level: "viewer" });
    const second = await service.grant(alice, "doc-1", {
      principalType: "user",
      principalId: "bob",
      level: "manager",
    });
    expect(second.created).toBe(false);
    const grants = await service.list(alice, "doc-1");
    expect(grants).toHaveLength(1);
    expect(grants[0].level).toBe("manager");
  });

  it("normalizes legacy flag payloads", async () => {
    const { permission } = await service.grant(alice, "doc-1", {
      principalType: "role",
      principalId: "auditor",
      canDelete: true,
    });
    expect(permission.level).toBe("manager");
    expect(permission.canRead).toBe(true);
    expect(permission.canWrite).toBe(true);
  });

  it("rejects payloads without a level and unknown principal types", async () => {
    await expect(
      service.grant(alice, "doc-1", { principalType: "user", principalId: "bob" })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.grant(alice, "doc-1", {
        principalType: "group" as never,
        principalId: "bob",
        level: "viewer",
      })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.grant(alice, "doc-1", { principalType: "user", principalId: " ", level: "viewer" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("only lets owners manage sharing", async () => {
    await expect(service.list(bob, "doc-1")).rejects.toBeInstanceOf(ForbiddenError);
    await service.grant(alice, "doc-1", { principalType: "user", principalId: "bob", level: "manager" });
    await expect(service.list(bob, "doc-1")).rejects.toBeInstanceOf(ForbiddenError);

    await service.grant(alice, "doc-1", { principalType: "user", principalId: "bob", level: "owner" });
    await expect(service.list(bob, "doc-1")).resolves.toHaveLength(1);
  });

  it("protects the document creator's access", async () => {
    await expect(
      service.grant(admin, "doc-1", { principalType: "user", principalId: "alice", level: "viewer" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("reports effective access for the caller", async () => {
    await service.grant(alice, "doc-1", { principalType: "role", principalId: "auditor", level: "viewer" });
    const auditor: AuthContext = { ...bob, roles: ["auditor"] };
    const access = await service.effectiveAccess(auditor, "doc-1");
    expect(access).toMatchObject({ level: "viewer", source: "role_grant", canRead: true });
  });

  it("revokes a grant and refuses unknown ids", async () => {
    const { permission } = await service.grant(alice, "doc-1", {
      principalType: "user",
      principalId: "bob",
      level: "viewer",
    });
    await service.revoke(alice, "doc-1", permission.id);
    await expect(service.list(alice, "doc-1")).resolves.toHaveLength(0);
    await expect(service.revoke(alice, "doc-1", permission.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fails with 404 for documents outside the tenant", async () => {
    const otherTenant: AuthContext = { ...alice, tenantId: "22222222-2222-2222-2222-222222222222" };
    await expect(service.list(otherTenant, "doc-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
